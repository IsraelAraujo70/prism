use crate::auth;
use crate::error::{AppError, AppResult};
use crate::github::{Client, GithubUser, Repo};
use serde::Serialize;

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
pub async fn save_token(token: String) -> AppResult<AuthStatus> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err(AppError::InvalidToken("token is empty".into()));
    }
    let client = Client::new(token.clone())?;
    let user = client.get_user().await?;
    auth::save_token(&token)?;
    Ok(AuthStatus { authenticated: true, user: Some(user) })
}

#[tauri::command]
pub async fn logout() -> AppResult<()> {
    auth::delete_token()
}

#[tauri::command]
pub async fn list_repos() -> AppResult<Vec<Repo>> {
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    Client::new(token)?.list_repos().await
}
