mod auth;
mod commands;
mod db;
mod error;
mod github;
mod notifications;
mod tray;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let conn = db::init();

  tauri::Builder::default()
    .manage(db::DbState(Mutex::new(conn)))
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "main" {
          let _ = window.hide();
          api.prevent_close();
        }
      }
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      tray::build(app.handle())?;
      notifications::spawn_loop(app.handle().clone());
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
      commands::add_review_thread_reply,
      commands::resolve_review_thread,
      commands::unresolve_review_thread,
      commands::list_notifications,
      commands::unread_notification_count,
      commands::mark_notification_read,
      commands::mark_all_notifications_read,
      commands::sync_notifications_now,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
