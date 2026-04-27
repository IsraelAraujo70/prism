mod auth;
mod commands;
mod error;
mod github;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::get_auth_status,
      commands::save_token,
      commands::logout,
      commands::list_repos,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
