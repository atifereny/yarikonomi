mod commands;
mod db;
mod store;

use std::sync::Mutex;
use std::time::Duration;
use store::{AppState, Inner};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Gerçek Belgeler klasörü (OneDrive'a yönlendirilmişse onu döndürür)
            let documents = app
                .path()
                .document_dir()
                .or_else(|_| app.path().home_dir().map(|h| h.join("Documents")))?;
            let data_dir = documents.join("Muhasebe");
            let settings_path = app.path().app_config_dir()?.join("settings.json");

            let mut inner = Inner::new(data_dir, settings_path);
            inner.startup();
            app.manage(AppState(Mutex::new(inner)));

            // Yazma işlemlerinden sonra en fazla dakikada bir yedek alır
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(5));
                handle.state::<AppState>().lock().backup_if_due();
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::set_theme,
            commands::set_backup_dir,
            commands::list_backups,
            commands::backup_now,
            commands::restore_backup,
            commands::create_fresh_db,
            commands::retry_open,
            commands::open_folder,
            commands::export_json,
            commands::import_json,
            commands::save_file,
            commands::read_system_font,
            commands::list_contacts,
            commands::get_contact,
            commands::create_contact,
            commands::update_contact,
            commands::delete_contact,
            commands::list_entries,
            commands::list_contact_entries,
            commands::year_summaries,
            commands::create_entry,
            commands::update_entry,
            commands::set_entry_paid,
            commands::set_entry_status,
            commands::add_payment,
            commands::collect_payment,
            commands::delete_entry,
        ])
        .build(tauri::generate_context!())
        .expect("uygulama başlatılamadı");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            // Kapanırken yedeklenmemiş değişiklik varsa son bir yedek al
            let state = handle.state::<AppState>();
            let mut s = state.lock();
            if s.dirty {
                s.backup_now();
            }
        }
    });
}
