use crate::error::{AppError, AppResult};
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};

const API_BASE: &str = "https://api.github.com";
const UA: &str = concat!("prism/", env!("CARGO_PKG_VERSION"));

pub const GITHUB_CLIENT_ID: &str = "Ov23livH5iIGo31MqRiB";
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const OAUTH_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const OAUTH_SCOPES: &str = "repo read:org";

// ── Types ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repo {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub private: bool,
    pub html_url: String,
    pub open_issues_count: u32,
    pub pushed_at: Option<String>,
    pub owner: RepoOwner,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoOwner {
    pub login: String,
    pub avatar_url: String,
}

// ── Device Flow types ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    #[serde(default)]
    pub verification_uri_complete: Option<String>,
    pub expires_in: u64,
    pub interval: u64,
}

pub enum PollOutcome {
    Pending,
    SlowDown { interval: u64 },
    Success { token: String, user: GithubUser },
    Expired,
    Denied,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status")]
pub enum DevicePollResult {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "slow_down")]
    SlowDown { interval: u64 },
    #[serde(rename = "success")]
    Success { user: GithubUser },
    #[serde(rename = "expired")]
    Expired,
    #[serde(rename = "denied")]
    Denied,
}

#[derive(Deserialize)]
struct OAuthTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    interval: Option<u64>,
}

// ── Device Flow ────────────────────────────────────────

pub async fn request_device_code() -> AppResult<DeviceCodeResponse> {
    let http = reqwest::Client::new();
    let res = http
        .post(DEVICE_CODE_URL)
        .header(USER_AGENT, UA)
        .header(ACCEPT, "application/json")
        .form(&[("client_id", GITHUB_CLIENT_ID), ("scope", OAUTH_SCOPES)])
        .send()
        .await?;
    Ok(res.error_for_status()?.json().await?)
}

pub async fn poll_for_token(device_code: &str) -> AppResult<PollOutcome> {
    let http = reqwest::Client::new();
    let res = http
        .post(OAUTH_TOKEN_URL)
        .header(USER_AGENT, UA)
        .header(ACCEPT, "application/json")
        .form(&[
            ("client_id", GITHUB_CLIENT_ID),
            ("device_code", device_code),
            (
                "grant_type",
                "urn:ietf:params:oauth:grant-type:device_code",
            ),
        ])
        .send()
        .await?;

    let body: OAuthTokenResponse = res.error_for_status()?.json().await?;

    if let Some(token) = body.access_token {
        let client = Client::new(token.clone())?;
        let user = client.get_user().await?;
        return Ok(PollOutcome::Success { token, user });
    }

    match body.error.as_deref() {
        Some("authorization_pending") => Ok(PollOutcome::Pending),
        Some("slow_down") => Ok(PollOutcome::SlowDown {
            interval: body.interval.unwrap_or(10),
        }),
        Some("expired_token") => Ok(PollOutcome::Expired),
        Some("access_denied") => Ok(PollOutcome::Denied),
        Some(other) => Err(AppError::InvalidToken(other.to_string())),
        None => Err(AppError::InvalidToken("unexpected OAuth response".into())),
    }
}

// ── Authenticated client ───────────────────────────────

pub struct Client {
    http: reqwest::Client,
    token: String,
}

impl Client {
    pub fn new(token: String) -> AppResult<Self> {
        let http = reqwest::Client::builder().gzip(true).build()?;
        Ok(Self { http, token })
    }

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.http
            .request(method, format!("{API_BASE}{path}"))
            .header(USER_AGENT, UA)
            .header(ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header(AUTHORIZATION, format!("Bearer {}", self.token))
    }

    pub async fn get_user(&self) -> AppResult<GithubUser> {
        let res = self.request(reqwest::Method::GET, "/user").send().await?;
        if res.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AppError::InvalidToken(
                "GitHub rejected the token (401)".into(),
            ));
        }
        Ok(res.error_for_status()?.json().await?)
    }

    pub async fn list_repos(&self) -> AppResult<Vec<Repo>> {
        let res = self
            .request(reqwest::Method::GET, "/user/repos")
            .query(&[
                ("per_page", "100"),
                ("sort", "updated"),
                ("affiliation", "owner,collaborator,organization_member"),
            ])
            .send()
            .await?;
        Ok(res.error_for_status()?.json().await?)
    }
}
