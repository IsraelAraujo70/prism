use crate::auth;
use crate::db::{self, DbState, WatchedRepo};
use crate::error::{AppError, AppResult};
use crate::github::{
    self, Client, DeviceCodeResponse, DevicePollResult, GithubUser, PollOutcome, Repo,
};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct AuthStatus {
    pub authenticated: bool,
    pub user: Option<GithubUser>,
}

#[tauri::command]
pub async fn get_auth_status() -> AppResult<AuthStatus> {
    let Some(token) = auth::load_token()? else {
        return Ok(AuthStatus { authenticated: false, user: None });
    };
    let client = Client::new(token)?;
    match client.get_user().await {
        Ok(user) => Ok(AuthStatus { authenticated: true, user: Some(user) }),
        Err(AppError::InvalidToken(_)) => {
            auth::delete_token().ok();
            Ok(AuthStatus { authenticated: false, user: None })
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn start_device_flow() -> AppResult<DeviceCodeResponse> {
    let response = github::request_device_code().await?;
    let url = response
        .verification_uri_complete
        .as_deref()
        .unwrap_or(&response.verification_uri);
    open::that(url).ok();
    Ok(response)
}

#[tauri::command]
pub async fn poll_device_flow(device_code: String) -> AppResult<DevicePollResult> {
    match github::poll_for_token(&device_code).await? {
        PollOutcome::Success { token, user } => {
            auth::save_token(&token)?;
            Ok(DevicePollResult::Success { user })
        }
        PollOutcome::Pending => Ok(DevicePollResult::Pending),
        PollOutcome::SlowDown { interval } => Ok(DevicePollResult::SlowDown { interval }),
        PollOutcome::Expired => Ok(DevicePollResult::Expired),
        PollOutcome::Denied => Ok(DevicePollResult::Denied),
    }
}

#[tauri::command]
pub async fn logout() -> AppResult<()> {
    auth::delete_token()
}

// ── Watched repos (SQLite) ─────────────────────────────

#[tauri::command]
pub async fn get_watched_repos(db: State<'_, DbState>) -> AppResult<Vec<WatchedRepo>> {
    let conn = db.0.lock().unwrap();
    Ok(db::list_watched(&conn))
}

#[tauri::command]
pub async fn add_watched_repo(repo: WatchedRepo, db: State<'_, DbState>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    db::add_watched(&conn, &repo);
    Ok(())
}

#[tauri::command]
pub async fn remove_watched_repo(repo_id: i64, db: State<'_, DbState>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    db::remove_watched(&conn, repo_id);
    Ok(())
}

#[tauri::command]
pub async fn get_watched_ids(db: State<'_, DbState>) -> AppResult<Vec<i64>> {
    let conn = db.0.lock().unwrap();
    Ok(db::watched_ids(&conn))
}

// ── GitHub API ─────────────────────────────────────────

#[tauri::command]
pub async fn list_all_repos() -> AppResult<Vec<Repo>> {
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    Client::new(token)?.list_repos().await
}
