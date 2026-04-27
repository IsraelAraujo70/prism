# Prism — Claude orientation

Tauri 2 desktop client for GitHub Pull Requests. **Source of truth for product scope is [`docs/PRD.md`](docs/PRD.md)** — read it before suggesting features.

## Stack

| Layer | Tool |
|---|---|
| Shell | Tauri 2.10 (Rust) |
| Frontend | React 19 + TypeScript |
| Bundler / dev server | Vite 8 |
| Styling | Tailwind CSS v4 + shadcn/ui (Nova preset, neutral base) |
| Package manager | Bun |
| Persistence (UI state) | `localStorage` |
| Persistence (user data) | SQLite via `rusqlite` (bundled) |
| Persistence (token) | Plain file at `~/.local/share/prism/.credentials` (mode 0600) |
| HTTP | `reqwest` (rustls-tls) |
| Auth | GitHub OAuth Device Flow (no secret needed) |

## Run

```bash
bun run tauri:dev    # full app (Rust + Vite). Includes WEBKIT_DISABLE_DMABUF_RENDERER=1 for Wayland
bun run dev          # frontend only (UI iteration without rebuilding Rust)
bun run build        # tsc + vite build
cd src-tauri && cargo check
```

## Layout

```
src-tauri/src/
  lib.rs            # tauri::Builder; manages DbState; registers all commands
  commands.rs       # #[tauri::command] handlers (thin orchestration layer)
  github.rs         # GitHub HTTP client + types + Device Flow
  db.rs             # SQLite init, schema, CRUD helpers
  auth.rs           # token file storage (load/save/delete)
  error.rs          # AppError enum (serializes to string at command boundary)

src/
  App.tsx           # top-level state machine (loading/login/main); sidebar shell; Ctrl+B handler
  lib/api.ts        # typed wrappers around `invoke()` — mirror Rust types here
  components/
    login-form.tsx       # OAuth Device Flow UI
    repo-list.tsx        # sidebar contents (groups by org, collapsed mode)
    add-repo-dialog.tsx  # modal: pick from /user/repos + tracked orgs' public repos
    settings-dialog.tsx  # modal: user orgs, request access, track external orgs
    user-menu.tsx        # sidebar footer
    ui/                  # shadcn primitives
```

## Conventions

- **Dark mode only.** `class="dark"` is hardcoded on `<html>`. Light styles exist (shadcn) but unused.
- **Communication:** PT-BR with the user. **Code, identifiers, commit messages: English.**
- **Token never crosses to the frontend.** Rust receives, validates, stores. Frontend only sees auth status.
- **OAuth Device Flow.** `GITHUB_CLIENT_ID` is public and committed (`src-tauri/src/github.rs`). Device Flow does not need the client secret — never commit one.
- **No PAT input.** Device Flow only.
- **No comments unless the WHY is non-obvious.** Identifiers should explain WHAT.
- **Don't introduce new abstractions for hypothetical future features.** Bug fixes don't need surrounding cleanup.

## Skills

When working on Prism, invoke these for task-specific guidance:

- `/prism-feature` — full-stack pattern for adding a feature (Rust → SQLite → command → api.ts → component). Use when adding any user-facing functionality.
- `/prism-design` — design tokens, sidebar patterns, color/spacing reference. Use when adding/tweaking UI.

## Key past decisions worth knowing

- `keyring` crate's keyutils backend was unreliable on Linux (save succeeded, read returned `NoEntry`). Replaced with file-based storage. Migrate to `tauri-plugin-stronghold` if encryption-at-rest becomes a requirement.
- WebKitGTK on Wayland needs `WEBKIT_DISABLE_DMABUF_RENDERER=1` (baked into the `tauri:dev` script). Linux-only; if Windows/macOS contributors arrive, switch to `cross-env`.
- Sidebar uses two persistence layers: SQLite for content (`watched_repos`, `tracked_orgs`) and `localStorage` for UI state (`prism.sidebar-collapsed`, `prism.collapsed-orgs`).
- **GraphQL is the default for GitHub features.** Use `Client::graphql<T>` in `src-tauri/src/github.rs` and write one query with aliases instead of multiple REST calls. The earlier REST-Search-based dashboard was inconsistent (silent zero counts); the GraphQL rewrite fixed it. Mutations (merge, add comment, submit review) use the same helper.
- **GitHub Search API has a real-time gotcha.** New PRs/issues take 1–5 min to appear in `search(type: ISSUE)` results — affects GitHub.com itself. The dashboard's "Aguardando review" / open count panels can lag right after PR creation. Not a Prism bug. `viewer.pullRequests` is the real-time alternative for the user's own PRs.
- License: MIT.
