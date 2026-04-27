use crate::error::{AppError, AppResult};
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};

const API_BASE: &str = "https://api.github.com";
const UA: &str = concat!("prism/", env!("CARGO_PKG_VERSION"));

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
