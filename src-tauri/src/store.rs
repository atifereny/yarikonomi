//! Uygulama durumu: veritabanı bağlantısı, ayarlar, yedekleme ve kurtarma.

use crate::db;
use chrono::Local;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

pub const DB_FILE: &str = "veri.db";
pub const BACKUP_PREFIX: &str = "veri_";
pub const BACKUP_KEEP: usize = 30;
pub const BACKUP_MIN_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// Boşsa varsayılan klasör (Belgeler/Muhasebe/Yedekler) kullanılır.
    pub backup_dir: Option<String>,
    /// "system" | "light" | "dark"
    pub theme: String,
    /// Veritabanı en az bir kez oluşturuldu mu? (dosya kaybolursa ayırt etmek için)
    pub db_initialized: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { backup_dir: None, theme: "system".into(), db_initialized: false }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase", tag = "state", content = "message")]
pub enum DbStatus {
    Ready,
    /// Veritabanı dosyası bulunamadı
    Missing,
    /// Dosya var ama açılamadı / bozuk
    Error(String),
}

pub struct Inner {
    pub conn: Option<Connection>,
    pub status: DbStatus,
    pub settings: Settings,
    pub data_dir: PathBuf,
    pub settings_path: PathBuf,
    pub dirty: bool,
    pub last_backup: Option<Instant>,
    pub last_backup_at: Option<String>,
    pub last_backup_error: Option<String>,
}

pub struct AppState(pub Mutex<Inner>);

impl AppState {
    pub fn lock(&self) -> MutexGuard<'_, Inner> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }
}

fn timestamp() -> String {
    Local::now().format("%Y-%m-%d_%H-%M-%S").to_string()
}

impl Inner {
    pub fn new(data_dir: PathBuf, settings_path: PathBuf) -> Self {
        let settings = fs::read_to_string(&settings_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Self {
            conn: None,
            status: DbStatus::Missing,
            settings,
            data_dir,
            settings_path,
            dirty: false,
            last_backup: None,
            last_backup_at: None,
            last_backup_error: None,
        }
    }

    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join(DB_FILE)
    }

    pub fn default_backup_dir(&self) -> PathBuf {
        self.data_dir.join("Yedekler")
    }

    pub fn backup_dir(&self) -> PathBuf {
        match &self.settings.backup_dir {
            Some(d) if !d.trim().is_empty() => PathBuf::from(d),
            _ => self.default_backup_dir(),
        }
    }

    pub fn save_settings(&self) -> Result<(), String> {
        if let Some(parent) = self.settings_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Ayar klasörü oluşturulamadı: {e}"))?;
        }
        let json = serde_json::to_string_pretty(&self.settings).map_err(|e| e.to_string())?;
        fs::write(&self.settings_path, json).map_err(|e| format!("Ayarlar kaydedilemedi: {e}"))
    }

    /// Açılışta çağrılır: klasörü oluşturur, veritabanını açar veya kayıp olduğunu tespit eder.
    pub fn startup(&mut self) {
        if let Err(e) = fs::create_dir_all(&self.data_dir) {
            self.status = DbStatus::Error(format!(
                "Veri klasörü oluşturulamadı ({}): {e}",
                self.data_dir.display()
            ));
            return;
        }
        let path = self.db_path();
        if !path.exists() {
            // Daha önce veritabanı oluşturulmuşsa ya da yedek varsa dosya kaybolmuştur:
            // sessizce boş veritabanı oluşturmak yerine kullanıcıya soruyoruz.
            let has_backups = list_backups(&self.backup_dir()).map(|b| !b.is_empty()).unwrap_or(false);
            if self.settings.db_initialized || has_backups {
                self.status = DbStatus::Missing;
                return;
            }
        }
        self.open_db();
        if self.status == DbStatus::Ready {
            self.backup_now();
        }
    }

    pub fn open_db(&mut self) {
        self.conn = None;
        match db::open(&self.db_path()) {
            Ok(conn) => {
                self.conn = Some(conn);
                self.status = DbStatus::Ready;
                if !self.settings.db_initialized {
                    self.settings.db_initialized = true;
                    let _ = self.save_settings();
                }
            }
            Err(e) => self.status = DbStatus::Error(e),
        }
    }

    pub fn conn(&self) -> Result<&Connection, String> {
        self.conn.as_ref().ok_or_else(|| "Veritabanı açık değil.".to_string())
    }

    pub fn conn_mut(&mut self) -> Result<&mut Connection, String> {
        self.conn.as_mut().ok_or_else(|| "Veritabanı açık değil.".to_string())
    }

    /// Veritabanının tutarlı bir kopyasını yedek klasörüne yazar ve eski yedekleri temizler.
    pub fn backup_now(&mut self) -> Option<PathBuf> {
        let result = (|| -> Result<PathBuf, String> {
            let conn = self.conn()?;
            let dir = self.backup_dir();
            fs::create_dir_all(&dir)
                .map_err(|e| format!("Yedek klasörü oluşturulamadı ({}): {e}", dir.display()))?;
            let base = format!("{BACKUP_PREFIX}{}", timestamp());
            let mut target = dir.join(format!("{base}.db"));
            let mut n = 1;
            while target.exists() {
                target = dir.join(format!("{base}-{n}.db"));
                n += 1;
            }
            // VACUUM INTO: yazma sırasında bile tutarlı, sıkıştırılmış bir kopya üretir.
            conn.execute("VACUUM INTO ?1", [target.to_string_lossy().as_ref()])
                .map_err(|e| format!("Yedek alınamadı: {e}"))?;
            prune_backups(&dir, BACKUP_KEEP);
            Ok(target)
        })();
        self.last_backup = Some(Instant::now());
        match result {
            Ok(p) => {
                self.dirty = false;
                self.last_backup_at = Some(db::now_string());
                self.last_backup_error = None;
                Some(p)
            }
            Err(e) => {
                self.last_backup_error = Some(e);
                None
            }
        }
    }

    /// Arka plan iş parçacığı tarafından periyodik çağrılır.
    pub fn backup_if_due(&mut self) {
        let due = self.last_backup.map_or(true, |t| t.elapsed() >= BACKUP_MIN_INTERVAL);
        if self.dirty && due && self.conn.is_some() {
            self.backup_now();
        }
    }

    /// Bir .db dosyasını (yedek) mevcut veritabanının yerine koyar.
    pub fn restore_from_file(&mut self, source: &Path) -> Result<(), String> {
        if !source.exists() {
            return Err("Seçilen yedek dosyası bulunamadı.".into());
        }
        db::validate_file(source)?;
        // Mevcut veriyi kaybetmemek için önce onu da yedekle
        if self.conn.is_some() {
            self.backup_now();
        }
        self.conn = None;
        let path = self.db_path();
        let tmp = self.data_dir.join(format!("{DB_FILE}.geri-yukleme"));
        fs::copy(source, &tmp).map_err(|e| format!("Yedek kopyalanamadı: {e}"))?;
        // Kopyanın şemasını güncelle (eski sürüm yedeklerde migration uygulanır)
        db::open(&tmp).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            e
        })?;
        if path.exists() {
            let old = self.data_dir.join(format!("{DB_FILE}.onceki"));
            let _ = fs::remove_file(&old);
            fs::rename(&path, &old).map_err(|e| format!("Mevcut veritabanı taşınamadı: {e}"))?;
        }
        fs::rename(&tmp, &path).map_err(|e| format!("Yedek yerine konamadı: {e}"))?;
        self.open_db();
        match &self.status {
            DbStatus::Ready => {
                self.backup_now();
                Ok(())
            }
            DbStatus::Error(e) => Err(e.clone()),
            DbStatus::Missing => Err("Veritabanı açılamadı.".into()),
        }
    }

    /// Kayıp/bozuk veritabanı yerine boş bir veritabanı oluşturur. Bozuk dosya silinmez, yeniden adlandırılır.
    pub fn create_fresh(&mut self) -> Result<(), String> {
        self.conn = None;
        let path = self.db_path();
        if path.exists() {
            let broken = self.data_dir.join(format!("veri_bozuk_{}.db", timestamp()));
            fs::rename(&path, &broken).map_err(|e| format!("Bozuk dosya taşınamadı: {e}"))?;
        }
        self.open_db();
        match &self.status {
            DbStatus::Ready => Ok(()),
            DbStatus::Error(e) => Err(e.clone()),
            DbStatus::Missing => Err("Veritabanı oluşturulamadı.".into()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct BackupFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    /// Dosya adından çıkarılan tarih: "YYYY-MM-DD HH:MM:SS"
    pub created: String,
}

fn is_backup_name(name: &str) -> bool {
    name.starts_with(BACKUP_PREFIX) && name.ends_with(".db") && !name.starts_with("veri_bozuk_")
}

/// Yedekleri yeniden eskiye sıralı döndürür.
pub fn list_backups(dir: &Path) -> Result<Vec<BackupFile>, String> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out: Vec<BackupFile> = fs::read_dir(dir)
        .map_err(|e| format!("Yedek klasörü okunamadı: {e}"))?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if !is_backup_name(&name) {
                return None;
            }
            let meta = e.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            // veri_2026-10-11_13-05-22.db -> 2026-10-11 13:05:22
            let stamp = name
                .get(BACKUP_PREFIX.len()..name.len().min(BACKUP_PREFIX.len() + 19))
                .unwrap_or("");
            let created = stamp.replacen('_', " ", 1);
            let created = match created.split_once(' ') {
                Some((d, t)) => format!("{d} {}", t.replace('-', ":")),
                None => created,
            };
            Some(BackupFile { path: e.path().to_string_lossy().to_string(), size: meta.len(), created, name })
        })
        .collect();
    // Zaman damgası sabit genişlikte olduğundan ad sırası = kronolojik sıra
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

pub fn prune_backups(dir: &Path, keep: usize) {
    if let Ok(list) = list_backups(dir) {
        for old in list.into_iter().skip(keep) {
            let _ = fs::remove_file(&old.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("muhasebe-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn backup_rotation_keeps_latest() {
        let d = tmpdir("rot");
        for i in 0..35 {
            fs::write(d.join(format!("veri_2026-01-01_00-00-{i:02}.db")), b"x").unwrap();
        }
        fs::write(d.join("baska.txt"), b"x").unwrap();
        prune_backups(&d, 30);
        let list = list_backups(&d).unwrap();
        assert_eq!(list.len(), 30);
        assert_eq!(list[0].name, "veri_2026-01-01_00-00-34.db");
        assert_eq!(list[0].created, "2026-01-01 00:00:34");
        assert!(d.join("baska.txt").exists());
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn missing_db_detected_and_restored() {
        let d = tmpdir("miss");
        let settings = d.join("settings.json");
        let mut s = Inner::new(d.join("Muhasebe"), settings.clone());
        s.startup();
        assert_eq!(s.status, DbStatus::Ready);
        assert_eq!(list_backups(&s.backup_dir()).unwrap().len(), 1);
        let backup = list_backups(&s.backup_dir()).unwrap()[0].path.clone();

        // dosyayı sil, yeniden başlat
        s.conn = None;
        fs::remove_file(s.db_path()).unwrap();
        let mut s2 = Inner::new(d.join("Muhasebe"), settings);
        s2.startup();
        assert_eq!(s2.status, DbStatus::Missing);
        s2.restore_from_file(Path::new(&backup)).unwrap();
        assert_eq!(s2.status, DbStatus::Ready);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn corrupt_db_reports_error() {
        let d = tmpdir("bad");
        let data = d.join("Muhasebe");
        fs::create_dir_all(&data).unwrap();
        fs::write(data.join(DB_FILE), b"bu bir veritabani degil, sadece metin dosyasi......").unwrap();
        let mut s = Inner::new(data, d.join("settings.json"));
        s.startup();
        assert!(matches!(s.status, DbStatus::Error(_)));
        s.create_fresh().unwrap();
        assert_eq!(s.status, DbStatus::Ready);
        let _ = fs::remove_dir_all(&d);
    }
}
