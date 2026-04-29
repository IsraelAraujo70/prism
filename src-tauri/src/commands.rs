use crate::auth;
use crate::db::{self, DbState, NotificationRow, WatchedRepo};
use crate::error::{AppError, AppResult};
use crate::github::{
    self, Client, DeviceCodeResponse, DevicePollResult, GithubUser, OrgRef, PollOutcome,
    PrAuthor, PrFile, PullRequestRef, Repo,
};
use crate::notifications;
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
        state: None,
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

// ── PR details ─────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct PrLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ThreadComment {
    pub author: Option<PrAuthor>,
    pub body: String,
    pub created_at: String,
    pub state: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TimelineEntry {
    Comment {
        author: Option<PrAuthor>,
        body: String,
        created_at: String,
    },
    Review {
        author: Option<PrAuthor>,
        body: String,
        state: String,
        submitted_at: String,
    },
    ReviewThread {
        id: String,
        path: String,
        line: Option<i64>,
        is_resolved: bool,
        is_outdated: bool,
        comments: Vec<ThreadComment>,
        created_at: String,
    },
}

#[derive(Debug, Serialize, Clone)]
pub struct CheckEntry {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub url: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub app_name: Option<String>,
    pub app_logo_url: Option<String>,
    pub workflow_name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PrDetails {
    pub id: i64,
    pub node_id: String,
    pub number: i64,
    pub title: String,
    pub body: String,
    pub state: String,
    pub is_draft: bool,
    pub html_url: String,
    pub created_at: String,
    pub updated_at: String,
    pub merged_at: Option<String>,
    pub closed_at: Option<String>,
    pub additions: i64,
    pub deletions: i64,
    pub changed_files: i64,
    pub commits_count: i64,
    pub mergeable: String,
    pub base_ref: String,
    pub head_ref: String,
    pub author: Option<PrAuthor>,
    pub repo: String,
    pub labels: Vec<PrLabel>,
    pub assignees: Vec<PrAuthor>,
    pub review_requests: Vec<PrAuthor>,
    pub timeline: Vec<TimelineEntry>,
    pub checks_state: Option<String>,
    pub checks: Vec<CheckEntry>,
    pub pending_review_id: Option<String>,
    pub pending_review_threads_count: i64,
}

const PR_DETAILS_QUERY: &str = r#"
query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    nameWithOwner
    pullRequest(number: $number) {
      id
      databaseId
      number
      title
      body
      state
      isDraft
      url
      createdAt
      updatedAt
      mergedAt
      closedAt
      additions
      deletions
      changedFiles
      mergeable
      baseRefName
      headRefName
      author { login avatarUrl }
      commitsCount: commits { totalCount }
      labels(first: 20) { nodes { name color } }
      assignees(first: 10) { nodes { login avatarUrl } }
      reviewRequests(first: 10) {
        nodes {
          requestedReviewer {
            ... on User { login avatarUrl }
          }
        }
      }
      comments(first: 100) {
        nodes {
          author { login avatarUrl }
          body
          createdAt
        }
      }
      reviews(first: 50) {
        nodes {
          id
          author { login avatarUrl }
          body
          state
          submittedAt
        }
      }
      reviewThreads(first: 50) {
        nodes {
          id
          path
          line
          originalLine
          isResolved
          isOutdated
          comments(first: 50) {
            nodes {
              author { login avatarUrl }
              body
              createdAt
              state
            }
          }
        }
      }
      lastCommit: commits(last: 1) {
        nodes {
          commit {
            oid
            statusCheckRollup {
              state
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun {
                    name
                    status
                    conclusion
                    detailsUrl
                    startedAt
                    completedAt
                    checkSuite {
                      app { name logoUrl }
                      workflowRun { workflow { name } }
                    }
                  }
                  ... on StatusContext {
                    context
                    state
                    targetUrl
                    description
                    avatarUrl
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
"#;

#[derive(Deserialize)]
struct PrGqlData {
    viewer: GqlViewer,
    repository: Option<PrGqlRepo>,
}

#[derive(Deserialize)]
struct GqlViewer {
    login: String,
}

#[derive(Deserialize)]
struct PrGqlRepo {
    #[serde(rename = "nameWithOwner")]
    name_with_owner: String,
    #[serde(rename = "pullRequest")]
    pull_request: Option<PrGqlNode>,
}

#[derive(Deserialize)]
struct PrGqlNode {
    id: String,
    #[serde(rename = "databaseId")]
    database_id: Option<i64>,
    number: i64,
    title: String,
    #[serde(default)]
    body: String,
    state: String,
    #[serde(rename = "isDraft")]
    is_draft: bool,
    url: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(rename = "mergedAt")]
    merged_at: Option<String>,
    #[serde(rename = "closedAt")]
    closed_at: Option<String>,
    additions: i64,
    deletions: i64,
    #[serde(rename = "changedFiles")]
    changed_files: i64,
    mergeable: String,
    #[serde(rename = "baseRefName")]
    base_ref_name: String,
    #[serde(rename = "headRefName")]
    head_ref_name: String,
    author: Option<GqlUser>,
    #[serde(rename = "commitsCount")]
    commits_count: GqlTotalCount,
    labels: GqlLabelConnection,
    assignees: GqlUserConnection,
    #[serde(rename = "reviewRequests")]
    review_requests: GqlReviewRequestConnection,
    comments: GqlCommentConnection,
    reviews: GqlReviewConnection,
    #[serde(rename = "reviewThreads")]
    review_threads: GqlThreadConnection,
    #[serde(rename = "lastCommit")]
    last_commit: GqlCommitConnection,
}

#[derive(Deserialize)]
struct GqlThreadConnection {
    nodes: Vec<GqlThreadNode>,
}

#[derive(Deserialize)]
struct GqlThreadNode {
    id: String,
    path: String,
    line: Option<i64>,
    #[serde(rename = "originalLine")]
    original_line: Option<i64>,
    #[serde(rename = "isResolved")]
    is_resolved: bool,
    #[serde(rename = "isOutdated")]
    is_outdated: bool,
    comments: GqlThreadCommentConnection,
}

#[derive(Deserialize)]
struct GqlThreadCommentConnection {
    nodes: Vec<GqlThreadComment>,
}

#[derive(Deserialize)]
struct GqlThreadComment {
    author: Option<GqlUser>,
    #[serde(default)]
    body: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    state: Option<String>,
}

#[derive(Deserialize)]
struct GqlUser {
    login: String,
    #[serde(rename = "avatarUrl")]
    avatar_url: String,
}

#[derive(Deserialize)]
struct GqlTotalCount {
    #[serde(rename = "totalCount")]
    total_count: i64,
}

#[derive(Deserialize)]
struct GqlLabelConnection {
    nodes: Vec<GqlLabelNode>,
}

#[derive(Deserialize)]
struct GqlLabelNode {
    name: String,
    color: String,
}

#[derive(Deserialize)]
struct GqlUserConnection {
    nodes: Vec<GqlUser>,
}

#[derive(Deserialize)]
struct GqlReviewRequestConnection {
    nodes: Vec<GqlReviewRequestNode>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct GqlReviewRequestNode {
    #[serde(rename = "requestedReviewer")]
    requested_reviewer: Option<GqlUser>,
}

#[derive(Deserialize)]
struct GqlCommentConnection {
    nodes: Vec<GqlCommentNode>,
}

#[derive(Deserialize)]
struct GqlCommentNode {
    author: Option<GqlUser>,
    #[serde(default)]
    body: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Deserialize)]
struct GqlReviewConnection {
    nodes: Vec<GqlReviewNode>,
}

#[derive(Deserialize)]
struct GqlReviewNode {
    id: String,
    author: Option<GqlUser>,
    #[serde(default)]
    body: String,
    state: String,
    #[serde(rename = "submittedAt")]
    submitted_at: Option<String>,
}

#[derive(Deserialize)]
struct GqlCommitConnection {
    nodes: Vec<GqlCommitNode>,
}

#[derive(Deserialize)]
struct GqlCommitNode {
    commit: GqlCommit,
}

#[derive(Deserialize)]
struct GqlCommit {
    #[serde(rename = "statusCheckRollup")]
    status_check_rollup: Option<GqlRollup>,
}

#[derive(Deserialize)]
struct GqlRollup {
    state: String,
    contexts: GqlContextConnection,
}

#[derive(Deserialize)]
struct GqlContextConnection {
    nodes: Vec<GqlCheckContext>,
}

#[derive(Deserialize)]
#[serde(tag = "__typename")]
enum GqlCheckContext {
    CheckRun {
        name: String,
        status: String,
        conclusion: Option<String>,
        #[serde(rename = "detailsUrl")]
        details_url: Option<String>,
        #[serde(rename = "startedAt")]
        started_at: Option<String>,
        #[serde(rename = "completedAt")]
        completed_at: Option<String>,
        #[serde(rename = "checkSuite")]
        check_suite: Option<GqlCheckSuite>,
    },
    StatusContext {
        context: String,
        state: String,
        #[serde(rename = "targetUrl")]
        target_url: Option<String>,
        description: Option<String>,
    },
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct GqlCheckSuite {
    app: Option<GqlApp>,
    #[serde(rename = "workflowRun")]
    workflow_run: Option<GqlWorkflowRun>,
}

#[derive(Deserialize)]
struct GqlApp {
    name: String,
    #[serde(rename = "logoUrl")]
    logo_url: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct GqlWorkflowRun {
    workflow: Option<GqlWorkflow>,
}

#[derive(Deserialize)]
struct GqlWorkflow {
    name: String,
}

fn user_to_author(u: GqlUser) -> PrAuthor {
    PrAuthor {
        login: u.login,
        avatar_url: u.avatar_url,
    }
}

#[tauri::command]
pub async fn get_pr_details(
    owner: String,
    name: String,
    number: i64,
) -> AppResult<PrDetails> {
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;

    let variables = serde_json::json!({
        "owner": owner,
        "name": name,
        "number": number,
    });

    let data: PrGqlData = client.graphql(PR_DETAILS_QUERY, variables).await?;
    let repo = data
        .repository
        .ok_or_else(|| AppError::InvalidToken("Repositório não encontrado".into()))?;
    let pr = repo
        .pull_request
        .ok_or_else(|| AppError::InvalidToken("PR não encontrado".into()))?;

    let labels: Vec<PrLabel> = pr
        .labels
        .nodes
        .into_iter()
        .map(|l| PrLabel {
            name: l.name,
            color: l.color,
        })
        .collect();

    let assignees: Vec<PrAuthor> = pr.assignees.nodes.into_iter().map(user_to_author).collect();

    let review_requests: Vec<PrAuthor> = pr
        .review_requests
        .nodes
        .into_iter()
        .filter_map(|n| n.requested_reviewer.map(user_to_author))
        .collect();

    let mut timeline: Vec<TimelineEntry> = Vec::new();
    for c in pr.comments.nodes {
        timeline.push(TimelineEntry::Comment {
            author: c.author.map(user_to_author),
            body: c.body,
            created_at: c.created_at,
        });
    }
    let viewer_login = data.viewer.login.clone();
    let mut pending_review_id: Option<String> = None;
    for r in pr.reviews.nodes {
        let is_viewer_pending = r.state == "PENDING"
            && r.author.as_ref().map(|a| a.login == viewer_login).unwrap_or(false);
        if is_viewer_pending {
            pending_review_id = Some(r.id.clone());
            continue;
        }
        if let Some(submitted_at) = r.submitted_at.clone() {
            timeline.push(TimelineEntry::Review {
                author: r.author.map(user_to_author),
                body: r.body,
                state: r.state,
                submitted_at,
            });
        }
    }
    let mut pending_review_threads_count: i64 = 0;
    for t in pr.review_threads.nodes {
        let comments: Vec<ThreadComment> = t
            .comments
            .nodes
            .into_iter()
            .map(|c| ThreadComment {
                author: c.author.map(user_to_author),
                body: c.body,
                created_at: c.created_at,
                state: c.state,
            })
            .collect();
        let is_pending_by_viewer = comments
            .first()
            .map(|c| {
                c.state.as_deref() == Some("PENDING")
                    && c.author.as_ref().map(|a| a.login == viewer_login).unwrap_or(false)
            })
            .unwrap_or(false);
        if is_pending_by_viewer {
            pending_review_threads_count += 1;
        }
        let created_at = comments
            .first()
            .map(|c| c.created_at.clone())
            .unwrap_or_default();
        timeline.push(TimelineEntry::ReviewThread {
            id: t.id,
            path: t.path,
            line: t.line.or(t.original_line),
            is_resolved: t.is_resolved,
            is_outdated: t.is_outdated,
            comments,
            created_at,
        });
    }
    timeline.sort_by(|a, b| timeline_at(a).cmp(timeline_at(b)));

    let rollup = pr
        .last_commit
        .nodes
        .into_iter()
        .next()
        .and_then(|n| n.commit.status_check_rollup);

    let (checks_state, checks) = match rollup {
        None => (None, Vec::new()),
        Some(r) => {
            let entries = r
                .contexts
                .nodes
                .into_iter()
                .map(|c| match c {
                    GqlCheckContext::CheckRun {
                        name,
                        status,
                        conclusion,
                        details_url,
                        started_at,
                        completed_at,
                        check_suite,
                    } => {
                        let suite = check_suite.unwrap_or_default();
                        let app = suite.app;
                        let workflow_name = suite
                            .workflow_run
                            .and_then(|w| w.workflow)
                            .map(|w| w.name);
                        CheckEntry {
                            name,
                            status,
                            conclusion,
                            url: details_url,
                            started_at,
                            completed_at,
                            app_name: app.as_ref().map(|a| a.name.clone()),
                            app_logo_url: app.and_then(|a| a.logo_url),
                            workflow_name,
                            description: None,
                        }
                    }
                    GqlCheckContext::StatusContext {
                        context,
                        state,
                        target_url,
                        description,
                    } => {
                        let (status, conclusion) = match state.as_str() {
                            "PENDING" | "EXPECTED" => ("PENDING".to_string(), None),
                            _ => ("COMPLETED".to_string(), Some(state)),
                        };
                        CheckEntry {
                            name: context,
                            status,
                            conclusion,
                            url: target_url,
                            started_at: None,
                            completed_at: None,
                            app_name: None,
                            app_logo_url: None,
                            workflow_name: None,
                            description,
                        }
                    }
                })
                .collect();
            (Some(r.state), entries)
        }
    };

    Ok(PrDetails {
        id: pr.database_id.unwrap_or(0),
        node_id: pr.id,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        is_draft: pr.is_draft,
        html_url: pr.url,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        merged_at: pr.merged_at,
        closed_at: pr.closed_at,
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
        commits_count: pr.commits_count.total_count,
        mergeable: pr.mergeable,
        base_ref: pr.base_ref_name,
        head_ref: pr.head_ref_name,
        author: pr.author.map(user_to_author),
        repo: repo.name_with_owner,
        labels,
        assignees,
        review_requests,
        timeline,
        checks_state,
        checks,
        pending_review_id,
        pending_review_threads_count,
    })
}

fn timeline_at(e: &TimelineEntry) -> &str {
    match e {
        TimelineEntry::Comment { created_at, .. } => created_at,
        TimelineEntry::Review { submitted_at, .. } => submitted_at,
        TimelineEntry::ReviewThread { created_at, .. } => created_at,
    }
}

const MERGE_MUTATION: &str = r#"
mutation($input: MergePullRequestInput!) {
  mergePullRequest(input: $input) {
    pullRequest { state merged mergedAt }
  }
}
"#;

#[tauri::command]
pub async fn merge_pull_request(
    pr_node_id: String,
    method: String,
) -> AppResult<()> {
    let upper = method.to_uppercase();
    let merge_method = match upper.as_str() {
        "MERGE" | "SQUASH" | "REBASE" => upper,
        _ => return Err(AppError::InvalidToken(format!("método inválido: {method}"))),
    };

    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;

    let variables = serde_json::json!({
        "input": {
            "pullRequestId": pr_node_id,
            "mergeMethod": merge_method,
        }
    });

    let _: serde_json::Value = client.graphql(MERGE_MUTATION, variables).await?;
    Ok(())
}

const ADD_THREAD_REPLY_MUTATION: &str = r#"
mutation($input: AddPullRequestReviewThreadReplyInput!) {
  addPullRequestReviewThreadReply(input: $input) {
    comment { id }
  }
}
"#;

#[tauri::command]
pub async fn add_review_thread_reply(
    thread_id: String,
    body: String,
) -> AppResult<()> {
    let body = body.trim().to_string();
    if body.is_empty() {
        return Err(AppError::InvalidToken("comentário vazio".into()));
    }
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;
    let variables = serde_json::json!({
        "input": {
            "pullRequestReviewThreadId": thread_id,
            "body": body,
        }
    });
    let _: serde_json::Value = client.graphql(ADD_THREAD_REPLY_MUTATION, variables).await?;
    Ok(())
}

const RESOLVE_THREAD_MUTATION: &str = r#"
mutation($input: ResolveReviewThreadInput!) {
  resolveReviewThread(input: $input) {
    thread { id isResolved }
  }
}
"#;

const UNRESOLVE_THREAD_MUTATION: &str = r#"
mutation($input: UnresolveReviewThreadInput!) {
  unresolveReviewThread(input: $input) {
    thread { id isResolved }
  }
}
"#;

#[tauri::command]
pub async fn resolve_review_thread(thread_id: String) -> AppResult<()> {
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;
    let variables = serde_json::json!({ "input": { "threadId": thread_id } });
    let _: serde_json::Value = client.graphql(RESOLVE_THREAD_MUTATION, variables).await?;
    Ok(())
}

const START_REVIEW_MUTATION: &str = r#"
mutation($input: AddPullRequestReviewInput!) {
  addPullRequestReview(input: $input) {
    pullRequestReview { id }
  }
}
"#;

#[derive(Deserialize)]
struct StartReviewData {
    #[serde(rename = "addPullRequestReview")]
    add_pull_request_review: StartReviewPayload,
}

#[derive(Deserialize)]
struct StartReviewPayload {
    #[serde(rename = "pullRequestReview")]
    pull_request_review: StartReviewNode,
}

#[derive(Deserialize)]
struct StartReviewNode {
    id: String,
}

#[tauri::command]
pub async fn start_pr_review(pr_node_id: String) -> AppResult<String> {
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;
    let variables = serde_json::json!({
        "input": {
            "pullRequestId": pr_node_id,
            "event": "PENDING",
        }
    });
    let data: StartReviewData = client.graphql(START_REVIEW_MUTATION, variables).await?;
    Ok(data.add_pull_request_review.pull_request_review.id)
}

const ADD_THREAD_MUTATION: &str = r#"
mutation($input: AddPullRequestReviewThreadInput!) {
  addPullRequestReviewThread(input: $input) {
    thread { id }
  }
}
"#;

#[tauri::command]
pub async fn add_pr_review_thread(
    review_id: String,
    path: String,
    line: i64,
    side: String,
    start_line: Option<i64>,
    start_side: Option<String>,
    body: String,
) -> AppResult<()> {
    let body = body.trim().to_string();
    if body.is_empty() {
        return Err(AppError::InvalidToken("comentário vazio".into()));
    }
    let side_upper = side.to_uppercase();
    if side_upper != "LEFT" && side_upper != "RIGHT" {
        return Err(AppError::InvalidToken(format!("side inválido: {side}")));
    }
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;

    let mut input = serde_json::Map::new();
    input.insert("pullRequestReviewId".into(), pr_node_id_value(&review_id));
    input.insert("path".into(), serde_json::Value::String(path));
    input.insert("line".into(), serde_json::Value::Number(line.into()));
    input.insert("side".into(), serde_json::Value::String(side_upper));
    input.insert("body".into(), serde_json::Value::String(body));
    if let (Some(sl), Some(ss)) = (start_line, start_side) {
        let ss_upper = ss.to_uppercase();
        if ss_upper != "LEFT" && ss_upper != "RIGHT" {
            return Err(AppError::InvalidToken(format!("start_side inválido: {ss}")));
        }
        input.insert("startLine".into(), serde_json::Value::Number(sl.into()));
        input.insert("startSide".into(), serde_json::Value::String(ss_upper));
    }

    let variables = serde_json::json!({ "input": input });
    let _: serde_json::Value = client.graphql(ADD_THREAD_MUTATION, variables).await?;
    Ok(())
}

fn pr_node_id_value(s: &str) -> serde_json::Value {
    serde_json::Value::String(s.to_string())
}

const SUBMIT_REVIEW_MUTATION: &str = r#"
mutation($input: SubmitPullRequestReviewInput!) {
  submitPullRequestReview(input: $input) {
    pullRequestReview { id state }
  }
}
"#;

#[tauri::command]
pub async fn submit_pr_review(
    review_id: String,
    body: String,
    event: String,
) -> AppResult<()> {
    let event_upper = event.to_uppercase();
    if !matches!(event_upper.as_str(), "APPROVE" | "COMMENT" | "REQUEST_CHANGES") {
        return Err(AppError::InvalidToken(format!("event inválido: {event}")));
    }
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;
    let variables = serde_json::json!({
        "input": {
            "pullRequestReviewId": review_id,
            "body": body,
            "event": event_upper,
        }
    });
    let _: serde_json::Value = client.graphql(SUBMIT_REVIEW_MUTATION, variables).await?;
    Ok(())
}

#[tauri::command]
pub async fn unresolve_review_thread(thread_id: String) -> AppResult<()> {
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;
    let variables = serde_json::json!({ "input": { "threadId": thread_id } });
    let _: serde_json::Value = client.graphql(UNRESOLVE_THREAD_MUTATION, variables).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_pr_files(
    owner: String,
    name: String,
    number: i64,
) -> AppResult<Vec<PrFile>> {
    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    Client::new(token)?.list_pr_files(&owner, &name, number).await
}

// ── Notifications ──────────────────────────────────────

#[tauri::command]
pub async fn list_notifications(db: State<'_, DbState>) -> AppResult<Vec<NotificationRow>> {
    let conn = db.0.lock().unwrap();
    Ok(db::list_notifications(&conn))
}

#[tauri::command]
pub async fn unread_notification_count(db: State<'_, DbState>) -> AppResult<i64> {
    let conn = db.0.lock().unwrap();
    Ok(db::unread_count(&conn))
}

#[tauri::command]
pub async fn mark_notification_read(
    thread_id: String,
    app: tauri::AppHandle,
) -> AppResult<()> {
    notifications::mark_thread_read(&app, &thread_id).await
}

#[tauri::command]
pub async fn mark_all_notifications_read(app: tauri::AppHandle) -> AppResult<()> {
    notifications::mark_all_read(&app).await
}

#[tauri::command]
pub async fn mark_repo_notifications_read(
    repo_full: String,
    app: tauri::AppHandle,
) -> AppResult<()> {
    notifications::mark_repo_read(&app, &repo_full).await
}

#[tauri::command]
pub async fn sync_notifications_now(app: tauri::AppHandle) -> AppResult<()> {
    notifications::sync_once(&app).await.map(|_| ())
}

#[derive(Debug, Serialize)]
pub struct NotificationMutes {
    pub reasons: Vec<String>,
    pub repos: Vec<String>,
}

#[tauri::command]
pub async fn list_notification_mutes(db: State<'_, DbState>) -> AppResult<NotificationMutes> {
    let conn = db.0.lock().unwrap();
    Ok(NotificationMutes {
        reasons: db::list_mutes(&conn, "reason"),
        repos: db::list_mutes(&conn, "repo"),
    })
}

#[tauri::command]
pub async fn set_notification_mute(
    scope_type: String,
    scope_key: String,
    muted: bool,
    db: State<'_, DbState>,
) -> AppResult<()> {
    if scope_type != "reason" && scope_type != "repo" {
        return Err(AppError::InvalidToken(format!(
            "scope_type inválido: {scope_type}"
        )));
    }
    let conn = db.0.lock().unwrap();
    db::set_mute(&conn, &scope_type, &scope_key, muted);
    Ok(())
}

#[tauri::command]
pub async fn pause_notifications(minutes: i64, app: tauri::AppHandle) -> AppResult<()> {
    if minutes <= 0 {
        return Err(AppError::InvalidToken("minutes deve ser > 0".into()));
    }
    notifications::pause_for(&app, minutes);
    crate::tray::update_title(&app);
    Ok(())
}

#[tauri::command]
pub async fn resume_notifications(app: tauri::AppHandle) -> AppResult<()> {
    notifications::resume(&app);
    crate::tray::update_title(&app);
    Ok(())
}

#[tauri::command]
pub async fn get_pause_status(app: tauri::AppHandle) -> AppResult<Option<i64>> {
    Ok(notifications::paused_until(&app))
}

// ── Repo PR list ───────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct RepoPrPage {
    pub items: Vec<PullRequestRef>,
    pub total: i64,
    pub next_cursor: Option<String>,
}

const REPO_PRS_QUERY: &str = r#"
query($owner: String!, $name: String!, $states: [PullRequestState!], $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(
      first: 30
      after: $after
      states: $states
      orderBy: {field: UPDATED_AT, direction: DESC}
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        databaseId
        number
        title
        url
        updatedAt
        isDraft
        state
        comments { totalCount }
        author { login avatarUrl }
        repository { nameWithOwner }
      }
    }
  }
}
"#;

#[derive(Deserialize)]
struct RepoPrsData {
    repository: Option<RepoPrsRepo>,
}

#[derive(Deserialize)]
struct RepoPrsRepo {
    #[serde(rename = "pullRequests")]
    pull_requests: RepoPrsConnection,
}

#[derive(Deserialize)]
struct RepoPrsConnection {
    #[serde(rename = "totalCount")]
    total_count: i64,
    #[serde(rename = "pageInfo")]
    page_info: RepoPrsPageInfo,
    nodes: Vec<RepoPrNode>,
}

#[derive(Deserialize)]
struct RepoPrsPageInfo {
    #[serde(rename = "hasNextPage")]
    has_next_page: bool,
    #[serde(rename = "endCursor")]
    end_cursor: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct RepoPrNode {
    #[serde(rename = "databaseId")]
    database_id: Option<i64>,
    number: Option<i64>,
    title: Option<String>,
    url: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
    #[serde(rename = "isDraft")]
    is_draft: Option<bool>,
    state: Option<String>,
    comments: Option<GqlComments>,
    author: Option<GqlAuthor>,
    repository: Option<GqlRepoRef>,
}

fn repo_pr_from_node(n: RepoPrNode) -> Option<PullRequestRef> {
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
        state: n.state,
    })
}

#[tauri::command]
pub async fn list_repo_prs(
    owner: String,
    name: String,
    scope: String,
    after: Option<String>,
) -> AppResult<RepoPrPage> {
    let states: Option<Vec<&str>> = match scope.as_str() {
        "open" => Some(vec!["OPEN"]),
        "closed" => Some(vec!["CLOSED", "MERGED"]),
        "all" => None,
        other => {
            return Err(AppError::InvalidToken(format!("scope inválido: {other}")));
        }
    };

    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;

    let variables = serde_json::json!({
        "owner": owner,
        "name": name,
        "states": states,
        "after": after,
    });

    let data: RepoPrsData = client.graphql(REPO_PRS_QUERY, variables).await?;
    let repo = data
        .repository
        .ok_or_else(|| AppError::InvalidToken("repositório não encontrado".into()))?;

    let items: Vec<PullRequestRef> = repo
        .pull_requests
        .nodes
        .into_iter()
        .filter_map(repo_pr_from_node)
        .collect();

    Ok(RepoPrPage {
        items,
        total: repo.pull_requests.total_count,
        next_cursor: if repo.pull_requests.page_info.has_next_page {
            repo.pull_requests.page_info.end_cursor
        } else {
            None
        },
    })
}

// ── PR search (command palette) ────────────────────────

const PR_SEARCH_QUERY: &str = r#"
query($q: String!) {
  search(query: $q, type: ISSUE, first: 15) {
    nodes {
      ... on PullRequest {
        databaseId
        number
        title
        url
        updatedAt
        isDraft
        state
        comments { totalCount }
        author { login avatarUrl }
        repository { nameWithOwner }
      }
    }
  }
}
"#;

#[derive(Deserialize)]
struct PrSearchData {
    search: PrSearchConnection,
}

#[derive(Deserialize)]
struct PrSearchConnection {
    nodes: Vec<RepoPrNode>,
}

#[tauri::command]
pub async fn search_prs(
    query: String,
    db: State<'_, DbState>,
) -> AppResult<Vec<PullRequestRef>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let repos = {
        let conn = db.0.lock().unwrap();
        db::list_watched(&conn)
    };
    if repos.is_empty() {
        return Ok(Vec::new());
    }

    let repo_filter = repos
        .iter()
        .map(|r| format!("repo:{}", r.full_name))
        .collect::<Vec<_>>()
        .join(" ");

    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;

    let q = format!("is:pr {trimmed} {repo_filter}");
    let variables = serde_json::json!({ "q": q });

    let data: PrSearchData = client.graphql(PR_SEARCH_QUERY, variables).await?;
    let items: Vec<PullRequestRef> = data
        .search
        .nodes
        .into_iter()
        .filter_map(repo_pr_from_node)
        .collect();

    Ok(items)
}

#[tauri::command]
pub async fn search_prs_in_repo(
    owner: String,
    name: String,
    query: String,
) -> AppResult<Vec<PullRequestRef>> {
    let trimmed_owner = owner.trim();
    let trimmed_name = name.trim();
    if trimmed_owner.is_empty() || trimmed_name.is_empty() {
        return Ok(Vec::new());
    }

    let token = auth::load_token()?.ok_or(AppError::NotAuthenticated)?;
    let client = Client::new(token)?;

    let term = query.trim();
    let q = if term.is_empty() {
        format!("is:pr repo:{trimmed_owner}/{trimmed_name}")
    } else {
        format!("is:pr {term} repo:{trimmed_owner}/{trimmed_name}")
    };
    let variables = serde_json::json!({ "q": q });

    let data: PrSearchData = client.graphql(PR_SEARCH_QUERY, variables).await?;
    let items: Vec<PullRequestRef> = data
        .search
        .nodes
        .into_iter()
        .filter_map(repo_pr_from_node)
        .collect();

    Ok(items)
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
