mod auth;
mod commands;
mod db;
mod error;
mod github;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let conn = db::init();

  tauri::Builder::default()
    .manage(db::DbState(Mutex::new(conn)))
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
      commands::start_device_flow,
      commands::poll_device_flow,
      commands::logout,
      commands::get_watched_repos,
      commands::add_watched_repo,
      commands::remove_watched_repo,
      commands::get_watched_ids,
      commands::get_user_orgs,
      commands::get_oauth_client_id,
      commands::open_url,
      commands::get_tracked_orgs,
      commands::add_tracked_org,
      commands::remove_tracked_org,
      commands::list_all_repos,
      commands::get_dashboard,
      commands::get_pr_details,
      commands::get_pr_files,
      commands::merge_pull_request,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
