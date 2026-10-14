//! Frontend'in çağırdığı Tauri komutları. Hatalar Türkçe metin olarak döner.

use crate::db::{self, ContactInput, EntryInput};
use crate::store::{self, AppState, DbStatus};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

type R<T> = Result<T, String>;

/// Yazma işlemlerini sarar: başarılı olursa veritabanını "kirli" işaretler
/// (arka plan iş parçacığı en fazla dakikada bir yedek alır).
fn write<T>(state: &State<AppState>, f: impl FnOnce(&rusqlite::Connection) -> R<T>) -> R<T> {
    let mut s = state.lock();
    let out = f(s.conn()?)?;
    s.dirty = true;
    s.backup_if_due();
    Ok(out)
}

fn read<T>(state: &State<AppState>, f: impl FnOnce(&rusqlite::Connection) -> R<T>) -> R<T> {
    let s = state.lock();
    f(s.conn()?)
}

// --- Durum / ayarlar -------------------------------------------------------

#[derive(Serialize)]
pub struct AppInfo {
    pub status: DbStatus,
    pub data_dir: String,
    pub db_path: String,
    pub backup_dir: String,
    pub default_backup_dir: String,
    pub custom_backup_dir: bool,
    pub theme: String,
    pub last_backup_at: Option<String>,
    pub last_backup_error: Option<String>,
    pub schema_version: usize,
}

#[tauri::command]
pub fn app_info(state: State<AppState>) -> AppInfo {
    let s = state.lock();
    AppInfo {
        status: s.status.clone(),
        data_dir: s.data_dir.to_string_lossy().into(),
        db_path: s.db_path().to_string_lossy().into(),
        backup_dir: s.backup_dir().to_string_lossy().into(),
        default_backup_dir: s.default_backup_dir().to_string_lossy().into(),
        custom_backup_dir: s.settings.backup_dir.as_deref().is_some_and(|d| !d.trim().is_empty()),
        theme: s.settings.theme.clone(),
        last_backup_at: s.last_backup_at.clone(),
        last_backup_error: s.last_backup_error.clone(),
        schema_version: db::SCHEMA_VERSION,
    }
}

#[tauri::command]
pub fn set_theme(state: State<AppState>, theme: String) -> R<()> {
    if !["system", "light", "dark"].contains(&theme.as_str()) {
        return Err("Geçersiz tema.".into());
    }
    let mut s = state.lock();
    s.settings.theme = theme;
    s.save_settings()
}

/// `None` veya boş metin varsayılan klasöre döner.
#[tauri::command]
pub fn set_backup_dir(state: State<AppState>, dir: Option<String>) -> R<()> {
    let mut s = state.lock();
    let dir = dir.filter(|d| !d.trim().is_empty());
    if let Some(d) = &dir {
        let p = PathBuf::from(d);
        fs::create_dir_all(&p).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
        // Yazılabilir mi?
        let probe = p.join(".muhasebe-yazma-testi");
        fs::write(&probe, b"ok").map_err(|e| format!("Bu klasöre yazılamıyor: {e}"))?;
        let _ = fs::remove_file(probe);
    }
    s.settings.backup_dir = dir;
    s.save_settings()?;
    if s.conn.is_some() {
        s.backup_now();
        if let Some(e) = &s.last_backup_error {
            return Err(e.clone());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_backups(state: State<AppState>) -> R<Vec<store::BackupFile>> {
    let s = state.lock();
    store::list_backups(&s.backup_dir())
}

#[tauri::command]
pub fn backup_now(state: State<AppState>) -> R<String> {
    let mut s = state.lock();
    s.conn()?;
    match s.backup_now() {
        Some(p) => Ok(p.to_string_lossy().into()),
        None => Err(s.last_backup_error.clone().unwrap_or_else(|| "Yedek alınamadı.".into())),
    }
}

#[tauri::command]
pub fn restore_backup(state: State<AppState>, path: String) -> R<()> {
    state.lock().restore_from_file(Path::new(&path))
}

/// Kurtarma ekranındaki "Tekrar dene": dosya geri geldiyse (ör. bulut senkronu) açar.
#[tauri::command]
pub fn retry_open(state: State<AppState>) -> R<()> {
    let mut s = state.lock();
    s.startup();
    match &s.status {
        DbStatus::Ready => Ok(()),
        DbStatus::Missing => Err("Veritabanı dosyası hâlâ bulunamadı.".into()),
        DbStatus::Error(e) => Err(e.clone()),
    }
}

#[tauri::command]
pub fn create_fresh_db(state: State<AppState>) -> R<()> {
    state.lock().create_fresh()
}

#[tauri::command]
pub fn open_folder(path: String) -> R<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        fs::create_dir_all(&p).map_err(|e| format!("Klasör bulunamadı: {e}"))?;
    }
    std::process::Command::new("explorer")
        .arg(p)
        .spawn()
        .map_err(|e| format!("Klasör açılamadı: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn export_json(state: State<AppState>, path: String) -> R<()> {
    let data = read(&state, db::export_all)?;
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("Dosya yazılamadı: {e}"))
}

#[derive(Serialize)]
pub struct ImportResult {
    pub contacts: usize,
    pub entries: usize,
}

/// JSON yedeğini içe aktarır; mevcut verinin yerini alır. Veritabanı kayıpsa önce boş bir tane oluşturur.
#[tauri::command]
pub fn import_json(state: State<AppState>, path: String) -> R<ImportResult> {
    let text = fs::read_to_string(&path).map_err(|e| format!("Dosya okunamadı: {e}"))?;
    let data: db::ExportData =
        serde_json::from_str(&text).map_err(|e| format!("Geçersiz yedek dosyası: {e}"))?;
    let mut s = state.lock();
    if s.conn.is_none() {
        s.create_fresh()?;
    } else {
        // içe aktarmadan önceki hâli yedekle
        s.backup_now();
    }
    let (contacts, entries) = db::import_all(s.conn_mut()?, &data)?;
    s.backup_now();
    Ok(ImportResult { contacts, entries })
}

// --- Kişiler ---------------------------------------------------------------

#[tauri::command]
pub fn list_contacts(state: State<AppState>) -> R<Vec<db::ContactWithBalance>> {
    read(&state, db::list_contacts)
}

#[tauri::command]
pub fn get_contact(state: State<AppState>, id: i64) -> R<db::ContactWithBalance> {
    read(&state, |c| db::get_contact(c, id))
}

#[tauri::command]
pub fn create_contact(state: State<AppState>, input: ContactInput) -> R<db::Contact> {
    write(&state, |c| db::create_contact(c, input))
}

#[tauri::command]
pub fn update_contact(state: State<AppState>, id: i64, input: ContactInput) -> R<()> {
    write(&state, |c| db::update_contact(c, id, input))
}

#[tauri::command]
pub fn delete_contact(state: State<AppState>, id: i64) -> R<()> {
    write(&state, |c| db::delete_contact(c, id))
}

// --- Kayıtlar --------------------------------------------------------------

#[tauri::command]
pub fn list_entries(state: State<AppState>, from: String, to: String) -> R<Vec<db::EntryWithContact>> {
    read(&state, |c| db::list_entries(c, &from, &to))
}

#[tauri::command]
pub fn list_contact_entries(state: State<AppState>, contact_id: i64) -> R<Vec<db::EntryWithContact>> {
    read(&state, |c| db::list_contact_entries(c, contact_id))
}

#[tauri::command]
pub fn year_summaries(state: State<AppState>) -> R<Vec<db::YearSummary>> {
    read(&state, db::year_summaries)
}

#[tauri::command]
pub fn create_entry(state: State<AppState>, input: EntryInput) -> R<i64> {
    write(&state, |c| db::create_entry(c, input))
}

#[tauri::command]
pub fn update_entry(state: State<AppState>, id: i64, input: EntryInput) -> R<()> {
    write(&state, |c| db::update_entry(c, id, input))
}

#[tauri::command]
pub fn set_entry_paid(state: State<AppState>, id: i64, paid: bool, paid_date: Option<String>) -> R<()> {
    write(&state, |c| db::set_entry_paid(c, id, paid, paid_date))
}

#[tauri::command]
pub fn set_entry_status(state: State<AppState>, id: i64, status: String, paid_date: Option<String>) -> R<()> {
    write(&state, |c| db::set_entry_status(c, id, &status, paid_date))
}

#[tauri::command]
pub fn add_payment(state: State<AppState>, id: i64, amount: i64, paid_date: Option<String>) -> R<()> {
    write(&state, |c| db::add_payment(c, id, amount, paid_date))
}

#[tauri::command]
pub fn collect_payment(
    state: State<AppState>,
    contact_id: i64,
    direction: String,
    amount: i64,
    paid_date: Option<String>,
) -> R<db::CollectResult> {
    write(&state, |c| db::collect_payment(c, contact_id, &direction, amount, paid_date))
}

#[tauri::command]
pub fn delete_entry(state: State<AppState>, id: i64) -> R<()> {
    write(&state, |c| db::delete_entry(c, id))
}

// --- Rapor / ekstre dosyaları -------------------------------------------------

/// "%C3%87" gibi URL kodlu metni çözer (başlıkta Türkçe karakterli yol taşımak için).
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Some(v) = s.get(i + 1..i + 3).and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Rapor dosyasını (Excel / PDF) kaydeder. Gövde ham bayt, hedef yol `path` başlığında (URL kodlu).
#[tauri::command]
pub fn save_file(request: tauri::ipc::Request) -> R<()> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("Geçersiz dosya verisi.".into());
    };
    let raw = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or("Dosya yolu belirtilmedi.")?;
    let path = PathBuf::from(percent_decode(raw));
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if ext != "xlsx" && ext != "pdf" {
        return Err("Yalnızca .xlsx ve .pdf dosyaları kaydedilebilir.".into());
    }
    fs::write(&path, data).map_err(|e| format!("Dosya yazılamadı: {e}"))
}

/// PDF için Türkçe karakterleri destekleyen bir Windows yazı tipini okur (Segoe UI, yoksa Arial).
#[tauri::command]
pub fn read_system_font(bold: bool) -> R<tauri::ipc::Response> {
    let dir = PathBuf::from(std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into())).join("Fonts");
    let names: [&str; 2] = if bold { ["segoeuib.ttf", "arialbd.ttf"] } else { ["segoeui.ttf", "arial.ttf"] };
    for n in names {
        if let Ok(bytes) = fs::read(dir.join(n)) {
            return Ok(tauri::ipc::Response::new(bytes));
        }
    }
    Err("PDF için gerekli yazı tipi (Segoe UI / Arial) bulunamadı.".into())
}
