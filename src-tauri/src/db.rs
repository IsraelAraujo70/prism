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
        );",
    )
    .expect("failed to create watched_repos table");
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
