use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchedRepo {
    pub id: i64,
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub private: bool,
    pub html_url: String,
    pub owner_login: String,
    pub owner_avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationRow {
    pub id: String,
    pub repo_full: String,
    pub subject_type: String,
    pub subject_url: Option<String>,
    pub pr_number: Option<i64>,
    pub reason: String,
    pub title: String,
    pub unread: bool,
    pub updated_at: String,
    pub last_seen_at: String,
}

fn db_path() -> PathBuf {
    let base = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
            PathBuf::from(home).join(".local").join("share")
        });
    let dir = base.join("prism");
    fs::create_dir_all(&dir).ok();
    dir.join("prism.db")
}

pub fn init() -> Connection {
    let conn = Connection::open(db_path()).expect("failed to open SQLite database");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS watched_repos (
            id        INTEGER PRIMARY KEY,
            name      TEXT NOT NULL,
            full_name TEXT NOT NULL,
            description TEXT,
            private   INTEGER NOT NULL DEFAULT 0,
            html_url  TEXT NOT NULL,
            owner_login TEXT NOT NULL,
            owner_avatar_url TEXT NOT NULL,
            added_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
         CREATE TABLE IF NOT EXISTS tracked_orgs (
            name      TEXT PRIMARY KEY,
            added_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
         CREATE TABLE IF NOT EXISTS notifications (
            id            TEXT PRIMARY KEY,
            repo_full     TEXT NOT NULL,
            subject_type  TEXT NOT NULL,
            subject_url   TEXT,
            pr_number     INTEGER,
            reason        TEXT NOT NULL,
            title         TEXT NOT NULL,
            unread        INTEGER NOT NULL,
            updated_at    TEXT NOT NULL,
            last_seen_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
         CREATE INDEX IF NOT EXISTS idx_notifications_unread_updated
            ON notifications(unread DESC, updated_at DESC);
         CREATE TABLE IF NOT EXISTS sync_state (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
         CREATE TABLE IF NOT EXISTS notification_mutes (
            scope_type TEXT NOT NULL,
            scope_key  TEXT NOT NULL,
            PRIMARY KEY (scope_type, scope_key)
        );",
    )
    .expect("failed to create database tables");
    conn
}

pub fn list_watched(conn: &Connection) -> Vec<WatchedRepo> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, full_name, description, private, html_url, owner_login, owner_avatar_url
             FROM watched_repos ORDER BY name COLLATE NOCASE",
        )
        .unwrap();
    stmt.query_map([], |row| {
        Ok(WatchedRepo {
            id: row.get(0)?,
            name: row.get(1)?,
            full_name: row.get(2)?,
            description: row.get(3)?,
            private: row.get::<_, i32>(4)? != 0,
            html_url: row.get(5)?,
            owner_login: row.get(6)?,
            owner_avatar_url: row.get(7)?,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

pub fn add_watched(conn: &Connection, repo: &WatchedRepo) {
    conn.execute(
        "INSERT OR REPLACE INTO watched_repos
         (id, name, full_name, description, private, html_url, owner_login, owner_avatar_url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            repo.id,
            repo.name,
            repo.full_name,
            repo.description,
            repo.private as i32,
            repo.html_url,
            repo.owner_login,
            repo.owner_avatar_url,
        ],
    )
    .unwrap();
}

pub fn remove_watched(conn: &Connection, repo_id: i64) {
    conn.execute("DELETE FROM watched_repos WHERE id = ?1", params![repo_id])
        .unwrap();
}

pub fn watched_ids(conn: &Connection) -> Vec<i64> {
    let mut stmt = conn.prepare("SELECT id FROM watched_repos").unwrap();
    stmt.query_map([], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

pub fn list_tracked_orgs(conn: &Connection) -> Vec<String> {
    let mut stmt = conn
        .prepare("SELECT name FROM tracked_orgs ORDER BY name COLLATE NOCASE")
        .unwrap();
    stmt.query_map([], |row| row.get::<_, String>(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

pub fn add_tracked_org(conn: &Connection, name: &str) {
    conn.execute(
        "INSERT OR IGNORE INTO tracked_orgs (name) VALUES (?1)",
        params![name],
    )
    .unwrap();
}

pub fn remove_tracked_org(conn: &Connection, name: &str) {
    conn.execute("DELETE FROM tracked_orgs WHERE name = ?1", params![name])
        .unwrap();
}

pub fn upsert_notification(conn: &Connection, n: &NotificationRow) {
    conn.execute(
        "INSERT INTO notifications
            (id, repo_full, subject_type, subject_url, pr_number, reason, title, unread, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            repo_full    = excluded.repo_full,
            subject_type = excluded.subject_type,
            subject_url  = excluded.subject_url,
            pr_number    = excluded.pr_number,
            reason       = excluded.reason,
            title        = excluded.title,
            unread       = excluded.unread,
            updated_at   = excluded.updated_at,
            last_seen_at = datetime('now')",
        params![
            n.id,
            n.repo_full,
            n.subject_type,
            n.subject_url,
            n.pr_number,
            n.reason,
            n.title,
            n.unread as i32,
            n.updated_at,
        ],
    )
    .unwrap();
}

pub fn list_notifications(conn: &Connection) -> Vec<NotificationRow> {
    let mut stmt = conn
        .prepare(
            "SELECT id, repo_full, subject_type, subject_url, pr_number, reason, title,
                    unread, updated_at, last_seen_at
             FROM notifications
             ORDER BY unread DESC, updated_at DESC",
        )
        .unwrap();
    stmt.query_map([], |row| {
        Ok(NotificationRow {
            id: row.get(0)?,
            repo_full: row.get(1)?,
            subject_type: row.get(2)?,
            subject_url: row.get(3)?,
            pr_number: row.get(4)?,
            reason: row.get(5)?,
            title: row.get(6)?,
            unread: row.get::<_, i32>(7)? != 0,
            updated_at: row.get(8)?,
            last_seen_at: row.get(9)?,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

pub fn existing_notification_ids(conn: &Connection) -> std::collections::HashSet<String> {
    let mut stmt = conn.prepare("SELECT id FROM notifications").unwrap();
    stmt.query_map([], |r| r.get::<_, String>(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

pub fn unread_count(conn: &Connection) -> i64 {
    conn.query_row("SELECT COUNT(*) FROM notifications WHERE unread = 1", [], |r| r.get(0))
        .unwrap_or(0)
}

pub fn mark_notification_read(conn: &Connection, id: &str) {
    conn.execute(
        "UPDATE notifications SET unread = 0 WHERE id = ?1",
        params![id],
    )
    .unwrap();
}

pub fn mark_all_notifications_read(conn: &Connection) {
    conn.execute("UPDATE notifications SET unread = 0", []).unwrap();
}

pub fn get_sync_state(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM sync_state WHERE key = ?1",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .ok()
}

pub fn set_sync_state(conn: &Connection, key: &str, value: &str) {
    conn.execute(
        "INSERT INTO sync_state (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .unwrap();
}

pub fn list_mutes(conn: &Connection, scope_type: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare("SELECT scope_key FROM notification_mutes WHERE scope_type = ?1")
        .unwrap();
    stmt.query_map(params![scope_type], |r| r.get::<_, String>(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

pub fn is_muted(conn: &Connection, scope_type: &str, scope_key: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM notification_mutes WHERE scope_type = ?1 AND scope_key = ?2",
        params![scope_type, scope_key],
        |_| Ok(()),
    )
    .is_ok()
}

pub fn set_mute(conn: &Connection, scope_type: &str, scope_key: &str, muted: bool) {
    if muted {
        conn.execute(
            "INSERT OR IGNORE INTO notification_mutes (scope_type, scope_key) VALUES (?1, ?2)",
            params![scope_type, scope_key],
        )
        .unwrap();
    } else {
        conn.execute(
            "DELETE FROM notification_mutes WHERE scope_type = ?1 AND scope_key = ?2",
            params![scope_type, scope_key],
        )
        .unwrap();
    }
}
