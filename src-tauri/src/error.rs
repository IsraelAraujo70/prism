use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("not authenticated")]
    NotAuthenticated,
    #[error("invalid token: {0}")]
    InvalidToken(String),
    #[error("keyring: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("network: {0}")]
    Network(#[from] reqwest::Error),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
