use crate::auth;
use crate::db::{self, DbState, WatchedRepo};
use crate::error::{AppError, AppResult};
use crate::github::{
    self, Client, DeviceCodeResponse, DevicePollResult, GithubUser, OrgRef, PollOutcome,
    PrAuthor, PullRequestRef, Repo,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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

#[tauri::command]
pub fn get_oauth_client_id() -> &'static str {
    github::GITHUB_CLIENT_ID
}

#[tauri::command]
pub fn open_url(url: String) {
    open::that(url).ok();
}

#[tauri::command]
pub async fn get_user_orgs() -> AppResult<Vec<OrgRef>> {
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    Client::new(token)?.list_user_orgs().await
}

// ── Tracked orgs (SQLite + GitHub) ─────────────────────

#[tauri::command]
pub async fn get_tracked_orgs(db: State<'_, DbState>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    Ok(db::list_tracked_orgs(&conn))
}

#[tauri::command]
pub async fn add_tracked_org(name: String, db: State<'_, DbState>) -> AppResult<()> {
    let trimmed = name.trim().trim_start_matches('@').to_string();
    if trimmed.is_empty() {
        return Err(AppError::InvalidToken("nome da organização vazio".into()));
    }
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;
    if !client.org_exists(&trimmed).await? {
        return Err(AppError::InvalidToken(format!(
            "organização '{trimmed}' não encontrada"
        )));
    }
    let conn = db.0.lock().unwrap();
    db::add_tracked_org(&conn, &trimmed);
    Ok(())
}

#[tauri::command]
pub async fn remove_tracked_org(name: String, db: State<'_, DbState>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    db::remove_tracked_org(&conn, &name);
    Ok(())
}

// ── Dashboard ──────────────────────────────────────────

#[derive(Debug, Default, Serialize)]
pub struct DashboardStats {
    pub open_prs: i64,
    pub merged_30d: i64,
    pub awaiting_count: i64,
    pub contributors_count: i64,
}

#[derive(Debug, Serialize)]
pub struct ContributorStat {
    pub login: String,
    pub avatar_url: String,
    pub prs: i64,
}

#[derive(Debug, Default, Serialize)]
pub struct Dashboard {
    pub stats: DashboardStats,
    pub awaiting_your_review: Vec<PullRequestRef>,
    pub your_open_prs: Vec<PullRequestRef>,
    pub contributors: Vec<ContributorStat>,
}

const DASHBOARD_QUERY: &str = r#"
query($qAwaiting: String!, $qMine: String!, $qOpen: String!, $qMerged30: String!, $qMerged90: String!) {
  awaiting: search(query: $qAwaiting, type: ISSUE, first: 20) {
    issueCount
    nodes { ...PrFields }
  }
  mine: search(query: $qMine, type: ISSUE, first: 20) {
    issueCount
    nodes { ...PrFields }
  }
  openCount: search(query: $qOpen, type: ISSUE, first: 1) { issueCount }
  mergedCount: search(query: $qMerged30, type: ISSUE, first: 1) { issueCount }
  recent: search(query: $qMerged90, type: ISSUE, first: 100) {
    nodes {
      ... on PullRequest {
        author { login avatarUrl }
      }
    }
  }
}
fragment PrFields on PullRequest {
  databaseId
  number
  title
  url
  updatedAt
  isDraft
  comments { totalCount }
  author { login avatarUrl }
  repository { nameWithOwner }
}
"#;

#[derive(Deserialize)]
struct GqlData {
    awaiting: GqlSearchPrs,
    mine: GqlSearchPrs,
    #[serde(rename = "openCount")]
    open_count: GqlIssueCount,
    #[serde(rename = "mergedCount")]
    merged_count: GqlIssueCount,
    recent: GqlRecent,
}

#[derive(Deserialize)]
struct GqlSearchPrs {
    #[serde(rename = "issueCount")]
    issue_count: i64,
    nodes: Vec<GqlPrNode>,
}

#[derive(Deserialize)]
struct GqlIssueCount {
    #[serde(rename = "issueCount")]
    issue_count: i64,
}

#[derive(Deserialize)]
struct GqlRecent {
    nodes: Vec<GqlAuthorOnly>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct GqlPrNode {
    #[serde(rename = "databaseId")]
    database_id: Option<i64>,
    number: Option<i64>,
    title: Option<String>,
    url: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
    #[serde(rename = "isDraft")]
    is_draft: Option<bool>,
    comments: Option<GqlComments>,
    author: Option<GqlAuthor>,
    repository: Option<GqlRepoRef>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct GqlAuthorOnly {
    author: Option<GqlAuthor>,
}

#[derive(Deserialize)]
struct GqlAuthor {
    login: String,
    #[serde(rename = "avatarUrl")]
    avatar_url: String,
}

#[derive(Deserialize)]
struct GqlComments {
    #[serde(rename = "totalCount")]
    total_count: i64,
}

#[derive(Deserialize)]
struct GqlRepoRef {
    #[serde(rename = "nameWithOwner")]
    name_with_owner: String,
}

fn pr_from_node(n: GqlPrNode) -> Option<PullRequestRef> {
    let author = n.author?;
    let repo = n.repository?;
    Some(PullRequestRef {
        id: n.database_id?,
        number: n.number?,
        title: n.title?,
        html_url: n.url?,
        repo: repo.name_with_owner,
        author: PrAuthor {
            login: author.login,
            avatar_url: author.avatar_url,
        },
        updated_at: n.updated_at?,
        comments: n.comments?.total_count,
        draft: n.is_draft.unwrap_or(false),
    })
}

#[tauri::command]
pub async fn get_dashboard(
    repo_full_name: Option<String>,
    db: State<'_, DbState>,
) -> AppResult<Dashboard> {
    let repo_filter: String = match repo_full_name {
        Some(name) if !name.trim().is_empty() => format!("repo:{name}"),
        _ => {
            let repos = {
                let conn = db.0.lock().unwrap();
                db::list_watched(&conn)
            };
            if repos.is_empty() {
                return Ok(Dashboard::default());
            }
            repos
                .iter()
                .map(|r| format!("repo:{}", r.full_name))
                .collect::<Vec<_>>()
                .join(" ")
        }
    };

    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;

    let date_30 = date_days_ago(30);
    let date_90 = date_days_ago(90);

    let variables = serde_json::json!({
        "qAwaiting": format!("is:pr is:open review-requested:@me {repo_filter}"),
        "qMine": format!("is:pr is:open author:@me {repo_filter}"),
        "qOpen": format!("is:pr is:open {repo_filter}"),
        "qMerged30": format!("is:pr is:merged merged:>={date_30} {repo_filter}"),
        "qMerged90": format!("is:pr is:merged merged:>={date_90} {repo_filter}"),
    });

    let data: GqlData = client.graphql(DASHBOARD_QUERY, variables).await?;

    let awaiting_items: Vec<PullRequestRef> = data
        .awaiting
        .nodes
        .into_iter()
        .filter_map(pr_from_node)
        .collect();
    let mine_items: Vec<PullRequestRef> = data
        .mine
        .nodes
        .into_iter()
        .filter_map(pr_from_node)
        .collect();

    let mut contrib_map: HashMap<String, ContributorStat> = HashMap::new();
    for node in data.recent.nodes {
        if let Some(author) = node.author {
            contrib_map
                .entry(author.login.clone())
                .or_insert_with(|| ContributorStat {
                    login: author.login,
                    avatar_url: author.avatar_url,
                    prs: 0,
                })
                .prs += 1;
        }
    }
    let contributors_count = contrib_map.len() as i64;
    let mut contributors: Vec<_> = contrib_map.into_values().collect();
    contributors.sort_by(|a, b| b.prs.cmp(&a.prs).then_with(|| a.login.cmp(&b.login)));
    contributors.truncate(12);

    Ok(Dashboard {
        stats: DashboardStats {
            open_prs: data.open_count.issue_count,
            merged_30d: data.merged_count.issue_count,
            awaiting_count: data.awaiting.issue_count,
            contributors_count,
        },
        awaiting_your_review: awaiting_items,
        your_open_prs: mine_items,
        contributors,
    })
}

fn date_days_ago(days: u64) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let target = now.saturating_sub(days * 86_400);
    let days_since_epoch = (target / 86_400) as i64;

    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = y + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}")
}

// ── GitHub API ─────────────────────────────────────────

#[tauri::command]
pub async fn list_all_repos(db: State<'_, DbState>) -> AppResult<Vec<Repo>> {
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;

    let mut repos = client.list_repos().await?;

    let orgs = {
        let conn = db.0.lock().unwrap();
        db::list_tracked_orgs(&conn)
    };

    for org in orgs {
        if let Ok(extra) = client.list_org_repos(&org).await {
            repos.extend(extra);
        }
    }

    let mut seen = std::collections::HashSet::new();
    repos.retain(|r| seen.insert(r.id));
    Ok(repos)
}
