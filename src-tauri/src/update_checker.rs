use crate::error::{AppError, AppResult};
use reqwest::header::{ACCEPT, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const REPO: &str = "IsraelAraujo70/prism";
const POLL_INTERVAL: Duration = Duration::from_secs(60 * 60 * 3);
const RETRY_INTERVAL: Duration = Duration::from_secs(60 * 10);
const UA: &str = concat!("prism/", env!("CARGO_PKG_VERSION"));
pub const EVENT_UPDATE_INFO: &str = "prism:update-info";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub html_url: String,
    pub has_update: bool,
    pub checked_at: i64,
}

#[derive(Default)]
pub struct UpdateState(pub Mutex<Option<UpdateInfo>>);

#[derive(Deserialize)]
struct GhRelease {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

pub async fn check_now() -> AppResult<UpdateInfo> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let http = reqwest::Client::builder().build()?;
    let res = http
        .get(url)
        .header(USER_AGENT, UA)
        .header(ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await?;
    let release: GhRelease = res.error_for_status()?.json().await?;
    if release.draft || release.prerelease {
        return Err(AppError::InvalidToken(
            "latest release is draft/prerelease".into(),
        ));
    }
    let current = env!("CARGO_PKG_VERSION").to_string();
    let latest = release.tag_name.trim_start_matches('v').to_string();
    let has_update = is_newer(&latest, &current);
    Ok(UpdateInfo {
        current_version: current,
        latest_version: latest,
        html_url: release.html_url,
        has_update,
        checked_at: now_unix(),
    })
}

pub fn spawn_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            match check_now().await {
                Ok(info) => {
                    publish(&app, info);
                    tokio::time::sleep(POLL_INTERVAL).await;
                }
                Err(e) => {
                    log::warn!("update check failed: {e}");
                    tokio::time::sleep(RETRY_INTERVAL).await;
                }
            }
        }
    });
}

fn publish(app: &AppHandle, info: UpdateInfo) {
    {
        let state = app.state::<UpdateState>();
        let mut guard = state.0.lock().unwrap();
        *guard = Some(info.clone());
    }
    let _ = app.emit(EVENT_UPDATE_INFO, info);
}

fn parse_version(v: &str) -> Option<(u64, u64, u64)> {
    let core = v.split(['-', '+']).next()?.trim();
    let mut it = core.split('.');
    let major: u64 = it.next()?.parse().ok()?;
    let minor: u64 = it.next()?.parse().ok()?;
    let patch: u64 = it.next()?.parse().ok()?;
    Some((major, minor, patch))
}

fn is_newer(latest: &str, current: &str) -> bool {
    match (parse_version(latest), parse_version(current)) {
        (Some(l), Some(c)) => l > c,
        _ => latest != current,
    }
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_basic() {
        assert!(is_newer("0.1.3", "0.1.2"));
        assert!(is_newer("0.2.0", "0.1.9"));
        assert!(is_newer("1.0.0", "0.9.9"));
    }

    #[test]
    fn not_newer_when_equal_or_older() {
        assert!(!is_newer("0.1.2", "0.1.2"));
        assert!(!is_newer("0.1.1", "0.1.2"));
        assert!(!is_newer("0.0.9", "0.1.0"));
    }

    #[test]
    fn handles_v_prefix_via_caller() {
        // caller strips leading 'v', so we just verify pure semver compare
        assert!(is_newer("0.1.3", "0.1.2"));
    }

    #[test]
    fn handles_prerelease_suffix() {
        assert!(!is_newer("0.1.2-rc1", "0.1.2"));
        assert!(is_newer("0.2.0-rc1", "0.1.9"));
    }
}
