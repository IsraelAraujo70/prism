use crate::auth;
use crate::db::{self, DbState, NotificationRow};
use crate::error::{AppError, AppResult};
use crate::github::{Client, GhNotification, NotificationsFetch};
use crate::tray;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const SYNC_KEY_LAST_MODIFIED: &str = "notifications.last_modified";
pub const SYNC_KEY_PAUSED_UNTIL: &str = "notifications.paused_until";
const MIN_POLL_SECS: u64 = 60;
const MAX_POLL_SECS: u64 = 300;
const MUTE_REASON: &str = "reason";
const MUTE_REPO: &str = "repo";

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn paused_until(app: &AppHandle) -> Option<i64> {
    let state = app.state::<DbState>();
    let conn = state.0.lock().unwrap();
    db::get_sync_state(&conn, SYNC_KEY_PAUSED_UNTIL)
        .and_then(|s| s.parse().ok())
        .filter(|&v: &i64| v > 0)
}

pub fn is_paused(app: &AppHandle) -> bool {
    paused_until(app).map(|t| t > now_unix()).unwrap_or(false)
}

pub fn pause_for(app: &AppHandle, minutes: i64) {
    let until = now_unix().saturating_add(minutes.saturating_mul(60));
    let state = app.state::<DbState>();
    let conn = state.0.lock().unwrap();
    db::set_sync_state(&conn, SYNC_KEY_PAUSED_UNTIL, &until.to_string());
}

pub fn resume(app: &AppHandle) {
    let state = app.state::<DbState>();
    let conn = state.0.lock().unwrap();
    db::set_sync_state(&conn, SYNC_KEY_PAUSED_UNTIL, "0");
}

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
            let (was_empty, pushes) = {
                let state = app.state::<DbState>();
                let conn = state.0.lock().unwrap();
                let existing = db::existing_notification_ids(&conn);
                let was_empty = existing.is_empty();

                let pushes: Vec<(String, String)> = items
                    .iter()
                    .filter(|i| {
                        i.unread
                            && !existing.contains(&i.id)
                            && should_push(&i.reason)
                            && !db::is_muted(&conn, MUTE_REASON, &i.reason)
                            && !db::is_muted(&conn, MUTE_REPO, &i.repository.full_name)
                    })
                    .map(|i| {
                        (
                            push_title(&i.reason).to_string(),
                            format!("{} — {}", i.repository.full_name, i.subject.title),
                        )
                    })
                    .collect();

                for item in &items {
                    db::upsert_notification(&conn, &row_from_gh(item));
                }
                if let Some(lm) = last_modified {
                    db::set_sync_state(&conn, SYNC_KEY_LAST_MODIFIED, &lm);
                }

                (was_empty, pushes)
            };
            log::info!("notifications: synced {count} item(s)");
            tray::update_title(app);
            let _ = app.emit("notifications:changed", ());
            if !was_empty && !pushes.is_empty() && !is_paused(app) {
                fire_pushes(app, pushes);
            }
            Ok(clamp_poll(poll_interval))
        }
    }
}

pub async fn mark_thread_read(app: &AppHandle, thread_id: &str) -> AppResult<()> {
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;
    client.mark_notification_thread_read(thread_id).await?;
    {
        let state = app.state::<DbState>();
        let conn = state.0.lock().unwrap();
        db::mark_notification_read(&conn, thread_id);
    }
    tray::update_title(app);
    let _ = app.emit("notifications:changed", ());
    Ok(())
}

pub async fn mark_all_read(app: &AppHandle) -> AppResult<()> {
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;
    client.mark_all_notifications_read().await?;
    {
        let state = app.state::<DbState>();
        let conn = state.0.lock().unwrap();
        db::mark_all_notifications_read(&conn);
    }
    tray::update_title(app);
    let _ = app.emit("notifications:changed", ());
    Ok(())
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

const PUSH_REASONS: &[&str] = &[
    "review_requested",
    "mention",
    "team_mention",
    "comment",
    "assign",
    "state_change",
    "ci_activity",
];

fn should_push(reason: &str) -> bool {
    PUSH_REASONS.contains(&reason)
}

fn push_title(reason: &str) -> &'static str {
    match reason {
        "review_requested" => "Pediram seu review",
        "mention" | "team_mention" => "Mencionaram você",
        "comment" => "Novo comentário",
        "assign" => "Atribuíram a você",
        "state_change" => "PR mudou de estado",
        "ci_activity" => "Atualização de CI",
        _ => "Nova notificação",
    }
}

fn fire_pushes(app: &AppHandle, pushes: Vec<(String, String)>) {
    use tauri_plugin_notification::NotificationExt;
    let n = pushes.len();
    if n <= 3 {
        for (title, body) in pushes {
            if let Err(e) = app.notification().builder().title(title).body(body).show() {
                log::warn!("push notification failed: {e}");
            }
        }
    } else if let Err(e) = app
        .notification()
        .builder()
        .title("Prism")
        .body(format!("Você tem {n} novas notificações no GitHub"))
        .show()
    {
        log::warn!("push notification (summary) failed: {e}");
    }
}
