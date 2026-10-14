//! SQLite şeması, migration'lar ve sorgular.
//!
//! Tutarlar kuruş cinsinden INTEGER olarak saklanır. Tarihler `YYYY-MM-DD`
//! biçiminde TEXT olarak tutulur (sözlük sırası = kronolojik sıra).

use chrono::{Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Her eleman bir şema sürümüdür. `PRAGMA user_version` uygulanan son sürümü tutar.
/// Yeni migration eklemek için listenin SONUNA yeni bir SQL bloğu ekleyin; eskileri değiştirmeyin.
const MIGRATIONS: &[&str] = &[
    // v1: ilk şema
    r#"
    CREATE TABLE contacts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL DEFAULT '',
        company     TEXT NOT NULL DEFAULT '',
        address     TEXT NOT NULL DEFAULT '',
        phone       TEXT NOT NULL DEFAULT '',
        email       TEXT NOT NULL DEFAULT '',
        note        TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL
    );
    CREATE TABLE entries (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        direction   TEXT NOT NULL CHECK (direction IN ('alacak', 'verecek')),
        amount      INTEGER NOT NULL CHECK (amount > 0),
        date        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'odenmedi' CHECK (status IN ('odendi', 'odenmedi')),
        paid_date   TEXT,
        created_at  TEXT NOT NULL
    );
    CREATE INDEX idx_entries_date ON entries(date);
    CREATE INDEX idx_entries_contact ON entries(contact_id);
    "#,
    // v2: çek takibi (ileri tarihli alacak/verecek). Çekte `date` vade tarihidir.
    r#"
    ALTER TABLE entries ADD COLUMN is_cheque INTEGER NOT NULL DEFAULT 0 CHECK (is_cheque IN (0, 1));
    ALTER TABLE entries ADD COLUMN cheque_no TEXT NOT NULL DEFAULT '';
    ALTER TABLE entries ADD COLUMN bank TEXT NOT NULL DEFAULT '';
    "#,
    // v3: çek tahsil edilemedi ('karsiliksiz') durumu. CHECK kısıtı değiştirilemediği için tablo yeniden kurulur.
    r#"
    CREATE TABLE entries_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        direction   TEXT NOT NULL CHECK (direction IN ('alacak', 'verecek')),
        amount      INTEGER NOT NULL CHECK (amount > 0),
        date        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'odenmedi' CHECK (status IN ('odendi', 'odenmedi', 'karsiliksiz')),
        paid_date   TEXT,
        created_at  TEXT NOT NULL,
        is_cheque   INTEGER NOT NULL DEFAULT 0 CHECK (is_cheque IN (0, 1)),
        cheque_no   TEXT NOT NULL DEFAULT '',
        bank        TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO entries_new (id, contact_id, direction, amount, date, description, status, paid_date, created_at, is_cheque, cheque_no, bank)
        SELECT id, contact_id, direction, amount, date, description, status, paid_date, created_at, is_cheque, cheque_no, bank FROM entries;
    DROP TABLE entries;
    ALTER TABLE entries_new RENAME TO entries;
    CREATE INDEX idx_entries_date ON entries(date);
    CREATE INDEX idx_entries_contact ON entries(contact_id);
    "#,
    // v4: gerçek / tüzel kişi ve T.C. kimlik / vergi kimlik numarası
    r#"
    ALTER TABLE contacts ADD COLUMN kind TEXT NOT NULL DEFAULT 'gercek' CHECK (kind IN ('gercek', 'tuzel'));
    ALTER TABLE contacts ADD COLUMN tax_no TEXT NOT NULL DEFAULT '';
    UPDATE contacts SET kind = 'tuzel' WHERE name = '' AND company <> '';
    "#,
    // v5: kredi ödemesi (verecek; `bank` alanında banka adı)
    r#"
    ALTER TABLE entries ADD COLUMN is_loan INTEGER NOT NULL DEFAULT 0 CHECK (is_loan IN (0, 1));
    "#,
    // v6: kısmi ödeme (`paid_amount`), ödeme zamanı belirsiz müşteri (`undated`) ve tahsilat eşiği (`threshold`, kuruş)
    r#"
    ALTER TABLE entries ADD COLUMN paid_amount INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount >= 0);
    UPDATE entries SET paid_amount = amount WHERE status = 'odendi';
    ALTER TABLE contacts ADD COLUMN undated INTEGER NOT NULL DEFAULT 0 CHECK (undated IN (0, 1));
    ALTER TABLE contacts ADD COLUMN threshold INTEGER NOT NULL DEFAULT 0 CHECK (threshold >= 0);
    "#,
];

pub const SCHEMA_VERSION: usize = MIGRATIONS.len();

pub fn now_string() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

/// Bağlantıyı açar, pragmaları ayarlar ve migration'ları uygular.
pub fn open(path: &Path) -> Result<Connection, String> {
    let mut conn = Connection::open(path).map_err(|e| format!("Veritabanı açılamadı: {e}"))?;
    configure(&conn)?;
    migrate(&mut conn)?;
    Ok(conn)
}

pub fn configure(conn: &Connection) -> Result<(), String> {
    // WAL yerine klasik journal: veri.db tek dosya kalır, bulut senkron klasörlerinde daha güvenli.
    conn.execute_batch(
        "PRAGMA foreign_keys = ON; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;",
    )
    .map_err(|e| format!("Veritabanı dosyası okunamadı (bozuk olabilir): {e}"))?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn migrate(conn: &mut Connection) -> Result<(), String> {
    let current: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| format!("Veritabanı dosyası okunamadı (bozuk olabilir): {e}"))?;
    let current = current.max(0) as usize;
    if current > MIGRATIONS.len() {
        return Err(format!(
            "Veritabanı bu uygulamadan daha yeni bir sürümle oluşturulmuş (şema v{current}). Lütfen uygulamayı güncelleyin."
        ));
    }
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(sql)
            .map_err(|e| format!("Migration v{} başarısız: {e}", i + 1))?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Dosyanın geçerli bir uygulama veritabanı olup olmadığını kontrol eder (salt okunur).
pub fn validate_file(path: &Path) -> Result<(), String> {
    let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("Dosya açılamadı: {e}"))?;
    let check: String = conn
        .query_row("PRAGMA quick_check", [], |r| r.get(0))
        .map_err(|_| "Seçilen dosya geçerli bir SQLite veritabanı değil.".to_string())?;
    if check != "ok" {
        return Err(format!("Veritabanı bütünlük kontrolü başarısız: {check}"));
    }
    let tables: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('contacts','entries')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if tables != 2 {
        return Err("Seçilen dosya bu uygulamaya ait bir veritabanı değil.".into());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Modeller
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: i64,
    pub name: String,
    pub company: String,
    pub address: String,
    pub phone: String,
    pub email: String,
    pub note: String,
    pub created_at: String,
    /// "gercek" (T.C. kimlik no) ya da "tuzel" (vergi kimlik no)
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub tax_no: String,
    /// Ödeme zamanı belirsiz: bu kişinin ödenmemiş kayıtları takvim toplamlarına girmez
    #[serde(default)]
    pub undated: bool,
    /// Tahsilat eşiği (kuruş); açık alacak bu tutara ulaşınca uyarı verilir. 0 = yok
    #[serde(default)]
    pub threshold: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactInput {
    #[serde(default = "default_kind")]
    pub kind: String,
    #[serde(default)]
    pub tax_no: String,
    #[serde(default)]
    pub undated: bool,
    #[serde(default)]
    pub threshold: i64,
    pub name: String,
    pub company: String,
    pub address: String,
    pub phone: String,
    pub email: String,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContactWithBalance {
    #[serde(flatten)]
    pub contact: Contact,
    /// Ödenmemiş alacak toplamı (kuruş)
    pub open_receivable: i64,
    /// Ödenmemiş verecek toplamı (kuruş)
    pub open_payable: i64,
    pub entry_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub id: i64,
    pub contact_id: i64,
    pub direction: String,
    pub amount: i64,
    pub date: String,
    pub description: String,
    pub status: String,
    pub paid_date: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub is_cheque: bool,
    #[serde(default)]
    pub cheque_no: String,
    #[serde(default)]
    pub bank: String,
    /// Kredi ödemesi: yön her zaman "verecek", `bank` banka adıdır
    #[serde(default)]
    pub is_loan: bool,
    /// Şimdiye kadar ödenen / tahsil edilen kısım (kuruş). Ödendi durumunda tutara eşittir.
    #[serde(default)]
    pub paid_amount: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct EntryWithContact {
    #[serde(flatten)]
    pub entry: Entry,
    pub contact_name: String,
    /// Kişi "ödeme zamanı belirsiz" işaretliyse true
    pub undated: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EntryInput {
    pub contact_id: i64,
    pub direction: String,
    pub amount: i64,
    pub date: String,
    pub description: String,
    pub status: String,
    pub paid_date: Option<String>,
    #[serde(default)]
    pub is_cheque: bool,
    #[serde(default)]
    pub cheque_no: String,
    #[serde(default)]
    pub bank: String,
    /// Kredi ödemesi: yön her zaman "verecek", `bank` banka adıdır
    #[serde(default)]
    pub is_loan: bool,
    #[serde(default)]
    pub paid_amount: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct YearSummary {
    pub year: i32,
    pub receivable: i64,
    pub payable: i64,
    pub count: i64,
}

fn default_kind() -> String {
    "gercek".into()
}

fn contact_from_row(r: &Row) -> rusqlite::Result<Contact> {
    Ok(Contact {
        id: r.get("id")?,
        name: r.get("name")?,
        company: r.get("company")?,
        address: r.get("address")?,
        phone: r.get("phone")?,
        email: r.get("email")?,
        note: r.get("note")?,
        created_at: r.get("created_at")?,
        kind: r.get("kind")?,
        tax_no: r.get("tax_no")?,
        undated: r.get("undated")?,
        threshold: r.get("threshold")?,
    })
}

fn entry_from_row(r: &Row) -> rusqlite::Result<Entry> {
    Ok(Entry {
        id: r.get("id")?,
        contact_id: r.get("contact_id")?,
        direction: r.get("direction")?,
        amount: r.get("amount")?,
        date: r.get("date")?,
        description: r.get("description")?,
        status: r.get("status")?,
        paid_date: r.get("paid_date")?,
        created_at: r.get("created_at")?,
        is_cheque: r.get("is_cheque")?,
        cheque_no: r.get("cheque_no")?,
        bank: r.get("bank")?,
        is_loan: r.get("is_loan")?,
        paid_amount: r.get("paid_amount")?,
    })
}

fn err(e: rusqlite::Error) -> String {
    format!("Veritabanı hatası: {e}")
}

fn valid_date(s: &str) -> bool {
    s.len() == 10 && NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

// ---------------------------------------------------------------------------
// Kişiler
// ---------------------------------------------------------------------------

fn clean_contact(input: ContactInput) -> Result<ContactInput, String> {
    if input.kind != "gercek" && input.kind != "tuzel" {
        return Err("Geçersiz kişi türü.".into());
    }
    let tax_no: String = input.tax_no.chars().filter(|c| !c.is_whitespace()).collect();
    if !tax_no.is_empty() {
        if !tax_no.chars().all(|c| c.is_ascii_digit()) {
            return Err("Kimlik numarası yalnızca rakamlardan oluşmalıdır.".into());
        }
        if input.kind == "gercek" {
            if !valid_tc(&tax_no) {
                return Err("Geçersiz T.C. kimlik numarası (11 haneli olmalı).".into());
            }
        } else if tax_no.len() != 10 {
            return Err("Vergi kimlik numarası 10 haneli olmalıdır.".into());
        }
    }
    let c = ContactInput {
        kind: input.kind.clone(),
        tax_no,
        name: input.name.trim().to_string(),
        company: input.company.trim().to_string(),
        address: input.address.trim().to_string(),
        phone: input.phone.trim().to_string(),
        email: input.email.trim().to_string(),
        note: input.note.trim().to_string(),
        undated: input.undated,
        threshold: if input.undated { input.threshold } else { 0 },
    };
    if c.threshold < 0 {
        return Err("Tahsilat eşiği negatif olamaz.".into());
    }
    if c.kind == "gercek" && c.name.is_empty() {
        return Err("Gerçek kişi için ad soyad girilmelidir.".into());
    }
    if c.kind == "tuzel" && c.company.is_empty() {
        return Err("Tüzel kişi için firma unvanı girilmelidir.".into());
    }
    Ok(c)
}

/// T.C. kimlik numarası: 11 hane, ilk hane 0 olamaz, 10. ve 11. haneler sağlama kuralına uymalı.
fn valid_tc(s: &str) -> bool {
    let d: Vec<i64> = s.chars().filter_map(|c| c.to_digit(10)).map(i64::from).collect();
    if d.len() != 11 || d[0] == 0 {
        return false;
    }
    let odd = d[0] + d[2] + d[4] + d[6] + d[8];
    let even = d[1] + d[3] + d[5] + d[7];
    let d10 = ((odd * 7 - even) % 10 + 10) % 10;
    let d11 = d[..10].iter().sum::<i64>() % 10;
    d[9] == d10 && d[10] == d11
}

const CONTACT_BALANCE_SQL: &str = r#"
    SELECT c.*,
      COALESCE(SUM(CASE WHEN e.direction='alacak'  AND e.status='odenmedi' THEN e.amount - e.paid_amount END), 0) AS open_receivable,
      COALESCE(SUM(CASE WHEN e.direction='verecek' AND e.status='odenmedi' THEN e.amount - e.paid_amount END), 0) AS open_payable,
      COUNT(e.id) AS entry_count
    FROM contacts c LEFT JOIN entries e ON e.contact_id = c.id
"#;

fn balance_from_row(r: &Row) -> rusqlite::Result<ContactWithBalance> {
    Ok(ContactWithBalance {
        contact: contact_from_row(r)?,
        open_receivable: r.get("open_receivable")?,
        open_payable: r.get("open_payable")?,
        entry_count: r.get("entry_count")?,
    })
}

pub fn list_contacts(conn: &Connection) -> Result<Vec<ContactWithBalance>, String> {
    let mut stmt = conn
        .prepare(&format!("{CONTACT_BALANCE_SQL} GROUP BY c.id"))
        .map_err(err)?;
    let rows = stmt.query_map([], balance_from_row).map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

pub fn get_contact(conn: &Connection, id: i64) -> Result<ContactWithBalance, String> {
    conn.query_row(
        &format!("{CONTACT_BALANCE_SQL} WHERE c.id = ?1 GROUP BY c.id"),
        [id],
        balance_from_row,
    )
    .optional()
    .map_err(err)?
    .ok_or_else(|| "Kişi bulunamadı.".to_string())
}

pub fn create_contact(conn: &Connection, input: ContactInput) -> Result<Contact, String> {
    let c = clean_contact(input)?;
    let created_at = now_string();
    conn.execute(
        "INSERT INTO contacts (name, company, address, phone, email, note, created_at, kind, tax_no, undated, threshold) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![c.name, c.company, c.address, c.phone, c.email, c.note, created_at, c.kind, c.tax_no, c.undated, c.threshold],
    )
    .map_err(err)?;
    let id = conn.last_insert_rowid();
    Ok(Contact {
        id,
        name: c.name,
        company: c.company,
        address: c.address,
        phone: c.phone,
        email: c.email,
        note: c.note,
        created_at,
        kind: c.kind,
        tax_no: c.tax_no,
        undated: c.undated,
        threshold: c.threshold,
    })
}

pub fn update_contact(conn: &Connection, id: i64, input: ContactInput) -> Result<(), String> {
    let c = clean_contact(input)?;
    let n = conn
        .execute(
            "UPDATE contacts SET name=?1, company=?2, address=?3, phone=?4, email=?5, note=?6, kind=?7, tax_no=?8, undated=?9, threshold=?10 WHERE id=?11",
            params![c.name, c.company, c.address, c.phone, c.email, c.note, c.kind, c.tax_no, c.undated, c.threshold, id],
        )
        .map_err(err)?;
    if n == 0 {
        return Err("Kişi bulunamadı.".into());
    }
    Ok(())
}

pub fn delete_contact(conn: &Connection, id: i64) -> Result<(), String> {
    // entries ON DELETE CASCADE ile birlikte silinir
    conn.execute("DELETE FROM contacts WHERE id=?1", [id])
        .map_err(err)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Kayıtlar
// ---------------------------------------------------------------------------

fn clean_entry(input: EntryInput) -> Result<EntryInput, String> {
    if input.direction != "alacak" && input.direction != "verecek" {
        return Err("Geçersiz yön.".into());
    }
    if !["odendi", "odenmedi", "karsiliksiz"].contains(&input.status.as_str()) {
        return Err("Geçersiz durum.".into());
    }
    if input.is_loan {
        if input.is_cheque {
            return Err("Kredi ödemesi çek olamaz.".into());
        }
        if input.direction != "verecek" {
            return Err("Kredi ödemesi 'verecek' olmalıdır.".into());
        }
        if input.bank.trim().is_empty() {
            return Err("Kredi ödemesi için banka seçilmelidir.".into());
        }
    }
    if input.status == "karsiliksiz" && !input.is_cheque {
        return Err("Tahsil edilemedi durumu yalnızca çekler için geçerlidir.".into());
    }
    if input.amount <= 0 {
        return Err("Tutar sıfırdan büyük olmalıdır.".into());
    }
    if !valid_date(&input.date) {
        return Err("Geçersiz tarih.".into());
    }
    let paid_date = if input.status == "odendi" || input.status == "karsiliksiz" {
        match input.paid_date.as_deref().map(str::trim) {
            Some(d) if !d.is_empty() => {
                if !valid_date(d) {
                    return Err("Geçersiz ödeme tarihi.".into());
                }
                Some(d.to_string())
            }
            _ => None,
        }
    } else {
        None
    };
    let paid_amount = match input.status.as_str() {
        "odendi" => input.amount,
        "karsiliksiz" => 0,
        _ if input.is_cheque => 0,
        _ => {
            if input.paid_amount < 0 || input.paid_amount >= input.amount {
                return Err("Ödenen kısım toplam tutardan az olmalıdır. Tamamı ödendiyse durumu \"Ödendi\" yapın.".into());
            }
            input.paid_amount
        }
    };
    Ok(EntryInput {
        paid_amount,
        description: input.description.trim().to_string(),
        paid_date,
        cheque_no: if input.is_cheque { input.cheque_no.trim().to_string() } else { String::new() },
        bank: if input.is_cheque || input.is_loan { input.bank.trim().to_string() } else { String::new() },
        ..input
    })
}

const ENTRY_SQL: &str = r#"
    SELECT e.*,
      CASE WHEN c.name <> '' THEN c.name ELSE c.company END AS contact_name,
      c.undated AS contact_undated
    FROM entries e JOIN contacts c ON c.id = e.contact_id
"#;

fn entry_with_contact(r: &Row) -> rusqlite::Result<EntryWithContact> {
    Ok(EntryWithContact {
        entry: entry_from_row(r)?,
        contact_name: r.get("contact_name")?,
        undated: r.get("contact_undated")?,
    })
}

/// `from` ve `to` dahil tarih aralığındaki kayıtlar.
pub fn list_entries(conn: &Connection, from: &str, to: &str) -> Result<Vec<EntryWithContact>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "{ENTRY_SQL} WHERE e.date >= ?1 AND e.date <= ?2 ORDER BY e.date, e.id"
        ))
        .map_err(err)?;
    let rows = stmt.query_map([from, to], entry_with_contact).map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

pub fn list_contact_entries(conn: &Connection, contact_id: i64) -> Result<Vec<EntryWithContact>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "{ENTRY_SQL} WHERE e.contact_id = ?1 ORDER BY e.date DESC, e.id DESC"
        ))
        .map_err(err)?;
    let rows = stmt.query_map([contact_id], entry_with_contact).map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

pub fn year_summaries(conn: &Connection) -> Result<Vec<YearSummary>, String> {
    let mut stmt = conn
        .prepare(
            r#"SELECT CAST(substr(date, 1, 4) AS INTEGER) AS y,
                 COALESCE(SUM(CASE WHEN direction='alacak' AND status<>'karsiliksiz' THEN amount END), 0),
                 COALESCE(SUM(CASE WHEN direction='verecek' AND status<>'karsiliksiz' THEN amount END), 0),
                 COUNT(*)
               FROM entries GROUP BY y ORDER BY y"#,
        )
        .map_err(err)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(YearSummary {
                year: r.get(0)?,
                receivable: r.get(1)?,
                payable: r.get(2)?,
                count: r.get(3)?,
            })
        })
        .map_err(err)?;
    rows.collect::<Result<_, _>>().map_err(err)
}

fn ensure_contact(conn: &Connection, id: i64) -> Result<(), String> {
    let exists: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM contacts WHERE id=?1)", [id], |r| r.get(0))
        .map_err(err)?;
    if exists { Ok(()) } else { Err("Seçilen kişi bulunamadı.".into()) }
}

pub fn create_entry(conn: &Connection, input: EntryInput) -> Result<i64, String> {
    let e = clean_entry(input)?;
    ensure_contact(conn, e.contact_id)?;
    conn.execute(
        "INSERT INTO entries (contact_id, direction, amount, date, description, status, paid_date, created_at, is_cheque, cheque_no, bank, is_loan, paid_amount)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        params![e.contact_id, e.direction, e.amount, e.date, e.description, e.status, e.paid_date, now_string(),
                e.is_cheque, e.cheque_no, e.bank, e.is_loan, e.paid_amount],
    )
    .map_err(err)?;
    Ok(conn.last_insert_rowid())
}

pub fn update_entry(conn: &Connection, id: i64, input: EntryInput) -> Result<(), String> {
    let e = clean_entry(input)?;
    ensure_contact(conn, e.contact_id)?;
    let n = conn
        .execute(
            "UPDATE entries SET contact_id=?1, direction=?2, amount=?3, date=?4, description=?5, status=?6, paid_date=?7, is_cheque=?8, cheque_no=?9, bank=?10, is_loan=?11, paid_amount=?12 WHERE id=?13",
            params![e.contact_id, e.direction, e.amount, e.date, e.description, e.status, e.paid_date,
                    e.is_cheque, e.cheque_no, e.bank, e.is_loan, e.paid_amount, id],
        )
        .map_err(err)?;
    if n == 0 {
        return Err("Kayıt bulunamadı.".into());
    }
    Ok(())
}

/// Durumu doğrudan ayarlar. "karsiliksiz" yalnızca çeklerde geçerlidir.
pub fn set_entry_status(conn: &Connection, id: i64, status: &str, paid_date: Option<String>) -> Result<(), String> {
    let is_cheque: bool = conn
        .query_row("SELECT is_cheque FROM entries WHERE id=?1", [id], |r| r.get(0))
        .map_err(|_| "Kayıt bulunamadı.".to_string())?;
    match status {
        "odendi" => set_entry_paid(conn, id, true, paid_date),
        "odenmedi" => set_entry_paid(conn, id, false, None),
        // `paid_date` doluysa: vadesinde alınamadı, sonradan ayrı bir kayıtla tahsil edildi.
        // Tutar o kayıtta sayıldığı için bu çek toplamlara girmez.
        "karsiliksiz" if is_cheque => {
            if let Some(d) = paid_date.as_deref() {
                if !valid_date(d) {
                    return Err("Geçersiz tarih.".into());
                }
            }
            conn.execute("UPDATE entries SET status='karsiliksiz', paid_date=?1, paid_amount=0 WHERE id=?2", params![paid_date, id]).map_err(err)?;
            Ok(())
        }
        "karsiliksiz" => Err("Tahsil edilemedi durumu yalnızca çekler için geçerlidir.".into()),
        _ => Err("Geçersiz durum.".into()),
    }
}

pub fn set_entry_paid(conn: &Connection, id: i64, paid: bool, paid_date: Option<String>) -> Result<(), String> {
    let (status, date) = if paid {
        let d = paid_date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
        if !valid_date(&d) {
            return Err("Geçersiz ödeme tarihi.".into());
        }
        ("odendi", Some(d))
    } else {
        ("odenmedi", None)
    };
    conn.execute(
        "UPDATE entries SET status=?1, paid_date=?2, paid_amount=CASE WHEN ?1='odendi' THEN amount ELSE 0 END WHERE id=?3",
        params![status, date, id],
    )
    .map_err(err)?;
    Ok(())
}

/// Bir kayda kısmi (ya da kalan tutarın tamamı kadar) ödeme / tahsilat ekler.
/// Kalan tutar sıfırlanırsa kayıt "ödendi" olur.
pub fn add_payment(conn: &Connection, id: i64, amount: i64, paid_date: Option<String>) -> Result<(), String> {
    let (total, paid, status, cheque): (i64, i64, String, bool) = conn
        .query_row("SELECT amount, paid_amount, status, is_cheque FROM entries WHERE id=?1", [id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })
        .map_err(|_| "Kayıt bulunamadı.".to_string())?;
    if status != "odenmedi" {
        return Err("Yalnızca ödenmemiş kayıtlara ödeme eklenebilir.".into());
    }
    if cheque {
        return Err("Çeklere kısmi ödeme eklenemez; çeki \"Aldım\" / \"Ödedim\" olarak işaretleyin.".into());
    }
    if amount <= 0 {
        return Err("Ödeme tutarı sıfırdan büyük olmalıdır.".into());
    }
    let remaining = total - paid;
    if amount > remaining {
        return Err("Ödeme tutarı kalan tutardan fazla olamaz.".into());
    }
    let date = paid_date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    if !valid_date(&date) {
        return Err("Geçersiz ödeme tarihi.".into());
    }
    if amount == remaining {
        conn.execute("UPDATE entries SET status='odendi', paid_amount=amount, paid_date=?1 WHERE id=?2", params![date, id])
    } else {
        conn.execute("UPDATE entries SET paid_amount=paid_amount+?1 WHERE id=?2", params![amount, id])
    }
    .map_err(err)?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct CollectResult {
    /// Ödeme uygulanan kayıt sayısı
    pub touched: usize,
    /// Tamamen kapanan kayıt sayısı
    pub closed: usize,
}

/// Bir kişinin açık (çek olmayan) kayıtlarına, en eski tarihten başlayarak toplu ödeme / tahsilat uygular.
pub fn collect_payment(conn: &Connection, contact_id: i64, direction: &str, amount: i64, paid_date: Option<String>) -> Result<CollectResult, String> {
    if direction != "alacak" && direction != "verecek" {
        return Err("Geçersiz yön.".into());
    }
    if amount <= 0 {
        return Err("Tutar sıfırdan büyük olmalıdır.".into());
    }
    let tx = conn.unchecked_transaction().map_err(err)?;
    let open: Vec<(i64, i64)> = {
        let mut stmt = tx
            .prepare(
                "SELECT id, amount - paid_amount FROM entries
                 WHERE contact_id=?1 AND direction=?2 AND status='odenmedi' AND is_cheque=0
                 ORDER BY date, id",
            )
            .map_err(err)?;
        let rows = stmt.query_map(params![contact_id, direction], |r| Ok((r.get(0)?, r.get(1)?))).map_err(err)?;
        rows.collect::<Result<_, _>>().map_err(err)?
    };
    let total: i64 = open.iter().map(|(_, r)| r).sum();
    if amount > total {
        return Err("Girilen tutar bu kişinin açık bakiyesinden fazla.".into());
    }
    let mut left = amount;
    let (mut touched, mut closed) = (0, 0);
    for (id, remaining) in open {
        if left == 0 {
            break;
        }
        let take = left.min(remaining);
        add_payment(&tx, id, take, paid_date.clone())?;
        left -= take;
        touched += 1;
        if take == remaining {
            closed += 1;
        }
    }
    tx.commit().map_err(err)?;
    Ok(CollectResult { touched, closed })
}

pub fn delete_entry(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM entries WHERE id=?1", [id])
        .map_err(err)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// JSON dışa/içe aktarma
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportData {
    pub app: String,
    pub format_version: u32,
    pub schema_version: usize,
    pub exported_at: String,
    pub contacts: Vec<Contact>,
    pub entries: Vec<Entry>,
}

pub fn export_all(conn: &Connection) -> Result<ExportData, String> {
    let mut stmt = conn.prepare("SELECT * FROM contacts ORDER BY id").map_err(err)?;
    let contacts = stmt
        .query_map([], contact_from_row)
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    let mut stmt = conn.prepare("SELECT * FROM entries ORDER BY id").map_err(err)?;
    let entries = stmt
        .query_map([], entry_from_row)
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    Ok(ExportData {
        app: "muhasebe".into(),
        format_version: 1,
        schema_version: SCHEMA_VERSION,
        exported_at: now_string(),
        contacts,
        entries,
    })
}

/// Mevcut tüm veriyi siler ve dışa aktarılmış veriyle değiştirir (tek transaction).
pub fn import_all(conn: &mut Connection, data: &ExportData) -> Result<(usize, usize), String> {
    if data.app != "muhasebe" {
        return Err("Bu dosya bu uygulamaya ait bir yedek değil.".into());
    }
    if data.format_version > 1 {
        return Err("Yedek dosyası daha yeni bir uygulama sürümüne ait.".into());
    }
    let tx = conn.transaction().map_err(err)?;
    tx.execute_batch("DELETE FROM entries; DELETE FROM contacts; DELETE FROM sqlite_sequence;")
        .map_err(err)?;
    for c in &data.contacts {
        tx.execute(
            "INSERT INTO contacts (id, name, company, address, phone, email, note, created_at, kind, tax_no, undated, threshold) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
            params![c.id, c.name, c.company, c.address, c.phone, c.email, c.note, c.created_at,
                    if c.kind == "tuzel" || (c.kind.is_empty() && c.name.is_empty() && !c.company.is_empty()) { "tuzel" } else { "gercek" },
                    c.tax_no, c.undated, if c.undated { c.threshold.max(0) } else { 0 }],
        )
        .map_err(|e| format!("Kişi #{} içe aktarılamadı: {e}", c.id))?;
    }
    for e in &data.entries {
        let checked = clean_entry(EntryInput {
            contact_id: e.contact_id,
            direction: e.direction.clone(),
            amount: e.amount,
            date: e.date.clone(),
            description: e.description.clone(),
            status: e.status.clone(),
            paid_date: e.paid_date.clone(),
            is_cheque: e.is_cheque,
            cheque_no: e.cheque_no.clone(),
            bank: e.bank.clone(),
            is_loan: e.is_loan,
            paid_amount: e.paid_amount,
        })
        .map_err(|m| format!("Kayıt #{} geçersiz: {m}", e.id))?;
        tx.execute(
            "INSERT INTO entries (id, contact_id, direction, amount, date, description, status, paid_date, created_at, is_cheque, cheque_no, bank, is_loan, paid_amount)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
            params![e.id, checked.contact_id, checked.direction, checked.amount, checked.date,
                    checked.description, checked.status, checked.paid_date, e.created_at,
                    checked.is_cheque, checked.cheque_no, checked.bank, checked.is_loan, checked.paid_amount],
        )
        .map_err(|x| format!("Kayıt #{} içe aktarılamadı: {x}", e.id))?;
    }
    tx.commit().map_err(err)?;
    Ok((data.contacts.len(), data.entries.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrate(&mut c).unwrap();
        c
    }

    fn contact(conn: &Connection, name: &str) -> i64 {
        create_contact(conn, ContactInput {
            kind: "gercek".into(), tax_no: "".into(),
            name: name.into(), company: "".into(), address: "".into(),
            phone: "".into(), email: "".into(), note: "".into(),
            undated: false, threshold: 0,
        }).unwrap().id
    }

    fn entry(cid: i64, dir: &str, amount: i64, date: &str, status: &str) -> EntryInput {
        EntryInput {
            contact_id: cid, direction: dir.into(), amount, date: date.into(),
            description: "".into(), status: status.into(), paid_date: None,
            is_cheque: false, cheque_no: "".into(), bank: "".into(), is_loan: false, paid_amount: 0,
        }
    }

    #[test]
    fn cheque_fields_roundtrip_and_v1_upgrade() {
        // v1 şemasıyla oluşturulmuş eski bir veritabanı v2'ye yükseltilir
        let mut c = Connection::open_in_memory().unwrap();
        configure(&c).unwrap();
        c.execute_batch(MIGRATIONS[0]).unwrap();
        c.pragma_update(None, "user_version", 1).unwrap();
        c.execute("INSERT INTO contacts (name, created_at) VALUES ('Ali', 'x')", []).unwrap();
        c.execute("INSERT INTO entries (contact_id, direction, amount, date, created_at) VALUES (1,'alacak',500,'2026-01-01','x')", []).unwrap();
        migrate(&mut c).unwrap();
        let old = &list_entries(&c, "2026-01-01", "2026-01-01").unwrap()[0].entry;
        assert!(!old.is_cheque && old.cheque_no.is_empty());

        let mut e = entry(1, "verecek", 1000, "2026-06-01", "odenmedi");
        e.is_cheque = true;
        e.cheque_no = " 123 ".into();
        e.bank = "Ziraat".into();
        create_entry(&c, e).unwrap();
        let got = &list_entries(&c, "2026-06-01", "2026-06-01").unwrap()[0].entry;
        assert!(got.is_cheque);
        assert_eq!(got.cheque_no, "123");
        assert_eq!(got.bank, "Ziraat");
    }

    #[test]
    fn loan_payment_rules() {
        let c = mem();
        let cid = contact(&c, "Ziraat");
        let mut e = entry(cid, "verecek", 5_000_00, "2026-05-01", "odenmedi");
        e.is_loan = true;
        assert!(create_entry(&c, e.clone()).is_err()); // banka yok
        e.bank = " Ziraat Bankası ".into();
        e.direction = "alacak".into();
        assert!(create_entry(&c, e.clone()).is_err()); // yön yanlış
        e.direction = "verecek".into();
        e.is_cheque = true;
        assert!(create_entry(&c, e.clone()).is_err()); // çek olamaz
        e.is_cheque = false;
        create_entry(&c, e).unwrap();
        let got = &list_entries(&c, "2026-05-01", "2026-05-01").unwrap()[0].entry;
        assert!(got.is_loan);
        assert_eq!(got.bank, "Ziraat Bankası");
    }

    #[test]
    fn partial_payments_and_bulk_collection() {
        let c = mem();
        let cid = contact(&c, "Müşteri");
        let a = create_entry(&c, entry(cid, "alacak", 600_000, "2026-01-05", "odenmedi")).unwrap();
        let b = create_entry(&c, entry(cid, "alacak", 400_000, "2026-02-05", "odenmedi")).unwrap();
        let d = create_entry(&c, entry(cid, "alacak", 300_000, "2026-03-05", "odenmedi")).unwrap();
        assert_eq!(get_contact(&c, cid).unwrap().open_receivable, 1_300_000);

        add_payment(&c, a, 100_000, None).unwrap();
        assert_eq!(get_contact(&c, cid).unwrap().open_receivable, 1_200_000);
        assert!(add_payment(&c, a, 600_000, None).is_err()); // kalandan fazla
        assert!(add_payment(&c, a, 0, None).is_err());

        // 800.000 ₺: a'nın kalan 500.000'i kapanır, b'ye 300.000 işlenir
        let r = collect_payment(&c, cid, "alacak", 800_000, Some("2026-04-01".into())).unwrap();
        assert_eq!((r.touched, r.closed), (2, 1));
        let list = list_contact_entries(&c, cid).unwrap();
        let get = |id: i64| list.iter().find(|x| x.entry.id == id).unwrap().entry.clone();
        assert_eq!(get(a).status, "odendi");
        assert_eq!(get(a).paid_amount, 600_000);
        assert_eq!(get(b).status, "odenmedi");
        assert_eq!(get(b).paid_amount, 300_000);
        assert_eq!(get(d).paid_amount, 0);
        assert_eq!(get_contact(&c, cid).unwrap().open_receivable, 400_000);
        assert!(collect_payment(&c, cid, "alacak", 400_001, None).is_err());

        // Durumu geri alınca ödenen kısım sıfırlanır
        set_entry_paid(&c, a, false, None).unwrap();
        assert_eq!(get_contact(&c, cid).unwrap().open_receivable, 1_000_000);
    }

    #[test]
    fn contact_threshold_and_paid_amount_rules() {
        let c = mem();
        let mk = |undated: bool, threshold: i64| ContactInput {
            kind: "tuzel".into(), tax_no: "".into(), name: "".into(), company: "Büyük A.Ş.".into(),
            address: "".into(), phone: "".into(), email: "".into(), note: "".into(), undated, threshold,
        };
        assert!(create_contact(&c, mk(true, -1)).is_err());
        let k = create_contact(&c, mk(true, 100_000_000)).unwrap();
        assert!(k.undated);
        assert_eq!(k.threshold, 100_000_000);
        assert_eq!(create_contact(&c, mk(false, 5)).unwrap().threshold, 0);
        let mut e = entry(k.id, "alacak", 1000, "2026-01-01", "odenmedi");
        e.paid_amount = 1000; // tamamı ödenmişse "odendi" olmalı
        assert!(create_entry(&c, e.clone()).is_err());
        e.paid_amount = 400;
        create_entry(&c, e).unwrap();
        let got = &list_entries(&c, "2026-01-01", "2026-01-01").unwrap()[0];
        assert!(got.undated);
        assert_eq!(got.entry.paid_amount, 400);
    }

    #[test]
    fn contact_kinds_and_tax_numbers() {
        let c = mem();
        let mk = |kind: &str, name: &str, company: &str, tax: &str| ContactInput {
            kind: kind.into(), tax_no: tax.into(), name: name.into(), company: company.into(),
            address: "".into(), phone: "".into(), email: "".into(), note: "".into(),
            undated: false, threshold: 0,
        };
        // 10000000146 geçerli bir T.C. kimlik numarası örneğidir
        assert!(create_contact(&c, mk("gercek", "Ali", "", "10000000146")).is_ok());
        assert!(create_contact(&c, mk("gercek", "Ali", "", "10000000147")).is_err());
        assert!(create_contact(&c, mk("gercek", "Ali", "", "123")).is_err());
        assert!(create_contact(&c, mk("gercek", "", "Firma", "")).is_err());
        assert!(create_contact(&c, mk("tuzel", "", "Firma A.Ş.", "1234567890")).is_ok());
        assert!(create_contact(&c, mk("tuzel", "", "Firma A.Ş.", "12345")).is_err());
        assert!(create_contact(&c, mk("tuzel", "Yetkili", "", "")).is_err());
        assert!(create_contact(&c, mk("x", "Ali", "", "")).is_err());
        assert_eq!(list_contacts(&c).unwrap().iter().filter(|x| x.contact.kind == "tuzel").count(), 1);
    }

    #[test]
    fn failed_cheque_status() {
        let c = mem();
        let cid = contact(&c, "Ali");
        let plain = create_entry(&c, entry(cid, "alacak", 100, "2026-01-01", "odenmedi")).unwrap();
        let mut ch = entry(cid, "alacak", 700, "2026-02-01", "odenmedi");
        ch.is_cheque = true;
        let chq = create_entry(&c, ch).unwrap();
        assert!(set_entry_status(&c, plain, "karsiliksiz", None).is_err());
        set_entry_status(&c, chq, "karsiliksiz", None).unwrap();
        let got = &list_entries(&c, "2026-02-01", "2026-02-01").unwrap()[0].entry;
        assert_eq!(got.status, "karsiliksiz");
        // açık bakiyeye girmez
        let bal = get_contact(&c, cid).unwrap();
        assert_eq!(bal.open_receivable, 100);
        // sonradan tahsil edilen çek: durum karsiliksiz kalır, tarih saklanır
        set_entry_status(&c, chq, "karsiliksiz", Some("2026-03-01".into())).unwrap();
        let late = &list_entries(&c, "2026-02-01", "2026-02-01").unwrap()[0].entry;
        assert_eq!((late.status.as_str(), late.paid_date.as_deref()), ("karsiliksiz", Some("2026-03-01")));
        set_entry_status(&c, chq, "odendi", None).unwrap();
        assert_eq!(list_entries(&c, "2026-02-01", "2026-02-01").unwrap()[0].entry.status, "odendi");
    }

    #[test]
    fn migrate_is_idempotent() {
        let mut c = mem();
        migrate(&mut c).unwrap();
        let v: i64 = c.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(v as usize, SCHEMA_VERSION);
    }

    #[test]
    fn balances_and_cascade() {
        let c = mem();
        let a = contact(&c, "Ali");
        create_entry(&c, entry(a, "alacak", 10_000, "2026-01-05", "odenmedi")).unwrap();
        create_entry(&c, entry(a, "alacak", 5_000, "2026-01-06", "odendi")).unwrap();
        create_entry(&c, entry(a, "verecek", 2_550, "2026-02-01", "odenmedi")).unwrap();
        let b = get_contact(&c, a).unwrap();
        assert_eq!(b.open_receivable, 10_000);
        assert_eq!(b.open_payable, 2_550);
        assert_eq!(b.entry_count, 3);
        let ys = year_summaries(&c).unwrap();
        assert_eq!(ys.len(), 1);
        assert_eq!(ys[0].receivable, 15_000);
        assert_eq!(list_entries(&c, "2026-01-01", "2026-01-31").unwrap().len(), 2);
        delete_contact(&c, a).unwrap();
        assert_eq!(list_entries(&c, "2000-01-01", "2100-01-01").unwrap().len(), 0);
    }

    #[test]
    fn validation() {
        let c = mem();
        let a = contact(&c, "Ayşe");
        assert!(create_entry(&c, entry(a, "alacak", 0, "2026-01-05", "odenmedi")).is_err());
        assert!(create_entry(&c, entry(a, "x", 1, "2026-01-05", "odenmedi")).is_err());
        assert!(create_entry(&c, entry(a, "alacak", 1, "2026-02-30", "odenmedi")).is_err());
        assert!(create_entry(&c, entry(999, "alacak", 1, "2026-02-03", "odenmedi")).is_err());
    }

    #[test]
    fn export_import_roundtrip() {
        let mut c = mem();
        let a = contact(&c, "Ali");
        create_entry(&c, entry(a, "verecek", 123_456, "2025-12-31", "odenmedi")).unwrap();
        let data = export_all(&c).unwrap();
        let json = serde_json::to_string(&data).unwrap();
        let back: ExportData = serde_json::from_str(&json).unwrap();
        let mut d = mem();
        assert_eq!(import_all(&mut d, &back).unwrap(), (1, 1));
        assert_eq!(list_entries(&d, "2025-01-01", "2025-12-31").unwrap()[0].entry.amount, 123_456);
        // aynı veritabanına tekrar içe aktarma da çalışmalı
        assert_eq!(import_all(&mut c, &back).unwrap(), (1, 1));
    }
}
