---
name: prism-feature
description: Full-stack pattern for adding a feature to Prism. Walks through SQLite → Rust command → api.ts → React component. Use this whenever adding user-facing functionality that needs backend support.
---

# Adding a feature to Prism

This skill captures the full-stack pattern we follow. Stick to it for consistency — every feature so far (watched repos, tracked orgs, settings) was built this way.

## Order of operations

Always go **backend first, frontend second**. The Rust types are the source of truth; `api.ts` mirrors them.

1. Persistence (if needed) — `src-tauri/src/db.rs`
2. GitHub API (if needed) — `src-tauri/src/github.rs`
3. Error variants (if needed) — `src-tauri/src/error.rs`
4. Tauri command — `src-tauri/src/commands.rs`
5. Register handler — `src-tauri/src/lib.rs`
6. Verify Rust: `cd src-tauri && cargo check`
7. Frontend wrapper — `src/lib/api.ts`
8. UI component — `src/components/...`
9. Verify frontend: `bun run build`

## 1. Persistence — `db.rs`

Add tables in the `init()` function via `execute_batch`. Tables are created with `IF NOT EXISTS` (no migrations yet — schema is append-only):

```rust
conn.execute_batch(
    "CREATE TABLE IF NOT EXISTS watched_repos (
        id INTEGER PRIMARY KEY,
        ...
        added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
     CREATE TABLE IF NOT EXISTS tracked_orgs (
        name TEXT PRIMARY KEY,
        added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );",
).expect("...");
```

Add a row struct (when you need to return rows to the frontend) deriving both `Serialize` and `Deserialize`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchedRepo { ... }
```

Add CRUD helpers as **free functions taking `&Connection`** (not methods). Use `params!` for binding. Return `Vec<T>` directly (no `Result`) — DB errors panic, since they indicate a real problem we can't recover from in the v0.1 scope.

```rust
pub fn list_watched(conn: &Connection) -> Vec<WatchedRepo> { ... }
pub fn add_watched(conn: &Connection, repo: &WatchedRepo) { ... }
pub fn remove_watched(conn: &Connection, id: i64) { ... }
```

## 2. GitHub API — `github.rs`

For new types, derive `Serialize + Deserialize + Clone + Debug`. Match GitHub's JSON field names with `serde` rename if needed (most are already snake_case-compatible).

For new endpoints, add a method on `Client`:

```rust
pub async fn list_user_orgs(&self) -> AppResult<Vec<OrgRef>> {
    let res = self
        .request(reqwest::Method::GET, "/user/orgs")
        .query(&[("per_page", "100")])
        .send()
        .await?;
    Ok(res.error_for_status()?.json().await?)
}
```

Conventions:
- Use the `request()` helper — it sets User-Agent, Accept, X-GitHub-Api-Version, Authorization.
- For endpoints that 404 acceptably, handle explicitly: `if res.status() == NOT_FOUND { return Ok(Vec::new()); }`.
- Don't paginate beyond `per_page=100` for v0.1. Add pagination only when you actually hit the limit.

For unauthenticated endpoints (Device Flow), use a free function with a one-off `reqwest::Client::new()` — see `request_device_code` for the pattern.

## 3. Error variants — `error.rs`

`AppError` serializes to a string at the command boundary. Add a new variant only if you need to *match on it* somewhere (e.g., to recover from a specific failure). Otherwise, reuse existing variants like `InvalidToken(String)` for any user-message error.

If adding from a foreign error type, use `#[from]`:

```rust
#[error("storage: {0}")]
Storage(#[from] std::io::Error),
```

## 4. Tauri command — `commands.rs`

Pattern:

```rust
#[tauri::command]
pub async fn add_watched_repo(repo: WatchedRepo, db: State<'_, DbState>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    db::add_watched(&conn, &repo);
    Ok(())
}
```

Rules:
- Always return `AppResult<T>`.
- Inputs from frontend use camelCase on the JS side (`{ repoId }`) and snake_case on Rust (`repo_id: i64`) — Tauri auto-converts.
- For DB access, take `db: State<'_, DbState>` and lock with `db.0.lock().unwrap()`.
- **Critical:** never hold the `MutexGuard` across an `.await`. `Connection` is `!Sync`; the guard is `!Send`. Pattern:

```rust
let orgs = {
    let conn = db.0.lock().unwrap();
    db::list_tracked_orgs(&conn)
};  // guard dropped here

for org in orgs {
    client.list_org_repos(&org).await?;  // safe to await now
}
```

- For commands that hit the GitHub API, load the token via `auth::load_token()?.ok_or(AppError::NotAuthenticated)?` and build a `Client` per call (cheap; HTTP client is reused internally).

## 5. Register — `lib.rs`

Add the command to `tauri::generate_handler![...]` in `lib.rs::run()`. If it needs new state (rare), add a `.manage(...)` call.

## 6. Verify Rust

```bash
cd src-tauri && cargo check
```

Fix all warnings — we keep the build clean.

## 7. Frontend wrapper — `api.ts`

Mirror the Rust struct as a TS type. Match field names exactly (snake_case is fine in TS for these — they're DTOs from Rust):

```ts
export type WatchedRepo = {
  id: number
  name: string
  full_name: string
  // ...
}
```

Add the function on the `api` object using `invoke<ReturnType>('command_name', { args })`. **Args use camelCase** (Tauri auto-converts to snake_case for the Rust signature):

```ts
export const api = {
  // ...
  addWatchedRepo: (repo: WatchedRepo) => invoke<void>('add_watched_repo', { repo }),
  removeWatchedRepo: (repoId: number) => invoke<void>('remove_watched_repo', { repoId }),
}
```

## 8. UI component

Create in `src/components/`. Use the design tokens from `/prism-design`. Standard component skeleton:

```tsx
import { useEffect, useState } from 'react'
import { api, type WatchedRepo } from '@/lib/api'

type State =
  | { status: 'loading' }
  | { status: 'ready'; items: WatchedRepo[] }
  | { status: 'error'; message: string }

export function MyFeature() {
  const [state, setState] = useState<State>({ status: 'loading' })

  async function load() {
    setState({ status: 'loading' })
    try {
      setState({ status: 'ready', items: await api.getWatchedRepos() })
    } catch (err) {
      setState({ status: 'error', message: String(err) })
    }
  }

  useEffect(() => { load() }, [])

  // render skeleton/error/empty/ready
}
```

Wire it into `App.tsx` if it's a top-level area, or pass it as a child to an existing parent.

## 9. Verify frontend

```bash
bun run build
```

Tsc + Vite must be green. **Never** commit with TS errors.

## Persistence: SQLite vs localStorage

| Use SQLite (`db.rs`) for | Use `localStorage` for |
|---|---|
| Things tied to the user's GitHub identity (watched repos, tracked orgs) | UI state (sidebar collapsed, expanded org groups) |
| Data that should survive a logout/login | Ephemeral preferences |
| Anything queryable | Simple key-value flags |

Storage paths follow XDG: `~/.local/share/prism/prism.db` (data) and `~/.local/share/prism/.credentials` (token).

## Don'ts

- Don't add comments explaining WHAT the code does — names should do that.
- Don't introduce new error variants for one-off matches; use `InvalidToken(String)` for user-facing messages.
- Don't add backward-compatibility shims; just change the code (this is pre-v1).
- Don't hold a `MutexGuard<Connection>` across `.await`.
- Don't ship the OAuth client_secret. Device Flow uses client_id only (public).
- Don't list-then-paginate. If 100 isn't enough, write paginated logic upfront.
- Don't add a feature flag unless the user explicitly asks for staged rollout.
