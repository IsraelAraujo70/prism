use crate::error::AppResult;
use keyring::Entry;

const SERVICE: &str = "io.github.israelaraujo70.prism";
const ACCOUNT: &str = "github_pat";

fn entry() -> AppResult<Entry> {
    Ok(Entry::new(SERVICE, ACCOUNT)?)
}

pub fn load_token() -> AppResult<Option<String>> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn save_token(token: &str) -> AppResult<()> {
    entry()?.set_password(token)?;
    Ok(())
}

pub fn delete_token() -> AppResult<()> {
    match entry()?.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
