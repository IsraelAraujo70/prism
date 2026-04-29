use crate::auth;
use crate::db::{self, DbState, NotificationRow};
use crate::error::AppResult;
use crate::github::{Client, GhNotification, NotificationsFetch};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const SYNC_KEY_LAST_MODIFIED: &str = "notifications.last_modified";
const MIN_POLL_SECS: u64 = 60;
const MAX_POLL_SECS: u64 = 300;

pub async fn sync_once(app: &AppHandle) -> AppResult<Duration> {
    let Some(token) = auth::load_token()? else {
        return Ok(Duration::from_secs(MIN_POLL_SECS));
    };
    let client = Client::new(token)?;

    let if_modified_since = {
        let state = app.state::<DbState>();
        let conn = state.0.lock().unwrap();
        db::get_sync_state(&conn, SYNC_KEY_LAST_MODIFIED)
    };

    let fetch = client
        .list_notifications(if_modified_since.as_deref())
        .await?;

    match fetch {
        NotificationsFetch::NotModified { poll_interval } => {
            log::info!("notifications: 304 not modified");
            Ok(clamp_poll(poll_interval))
        }
        NotificationsFetch::Fresh {
            items,
            last_modified,
            poll_interval,
        } => {
            let count = items.len();
            {
                let state = app.state::<DbState>();
                let conn = state.0.lock().unwrap();
                for item in &items {
                    db::upsert_notification(&conn, &row_from_gh(item));
                }
                if let Some(lm) = last_modified {
                    db::set_sync_state(&conn, SYNC_KEY_LAST_MODIFIED, &lm);
                }
            }
            log::info!("notifications: synced {count} item(s)");
            let _ = app.emit("notifications:changed", ());
            Ok(clamp_poll(poll_interval))
        }
    }
}

pub fn spawn_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut backoff = MIN_POLL_SECS;
        loop {
            match sync_once(&app).await {
                Ok(next) => {
                    backoff = MIN_POLL_SECS;
                    tokio::time::sleep(next).await;
                }
                Err(e) => {
                    log::warn!("notifications sync error: {e}; retry in {backoff}s");
                    tokio::time::sleep(Duration::from_secs(backoff)).await;
                    backoff = (backoff.saturating_mul(2)).min(MAX_POLL_SECS);
                }
            }
        }
    });
}

fn clamp_poll(secs: u64) -> Duration {
    Duration::from_secs(secs.clamp(MIN_POLL_SECS, MAX_POLL_SECS))
}

fn row_from_gh(n: &GhNotification) -> NotificationRow {
    NotificationRow {
        id: n.id.clone(),
        repo_full: n.repository.full_name.clone(),
        subject_type: n.subject.kind.clone(),
        subject_url: n.subject.url.clone(),
        pr_number: n.subject.url.as_deref().and_then(parse_pr_number),
        reason: n.reason.clone(),
        title: n.subject.title.clone(),
        unread: n.unread,
        updated_at: n.updated_at.clone(),
        last_seen_at: String::new(),
    }
}

fn parse_pr_number(url: &str) -> Option<i64> {
    url.rsplit('/').next().and_then(|s| s.parse().ok())
}
