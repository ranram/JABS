use crate::runtime::RuntimeState;
use serde::Serialize;
use std::sync::atomic::Ordering;
use zeroize::Zeroizing;

const SERVICE: &str = "JABS";
const LEGACY_SERVICE: &str = "Bracketier";
const STARTGG_ACCOUNT: &str = "start.gg-api-token";

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenStatus {
    pub configured: bool,
    pub storage_available: bool,
    pub session_only: bool,
}

pub fn initialize(runtime: &RuntimeState) {
    runtime.secure_storage_available.store(
        read_persisted_token().is_ok(),
        Ordering::Release,
    );
}

pub fn status(runtime: &RuntimeState) -> TokenStatus {
    let session_only = runtime
        .session_token
        .lock()
        .map(|token| token.is_some())
        .unwrap_or(false);
    let storage_available = runtime.secure_storage_available.load(Ordering::Acquire);
    let persisted = storage_available && read_persisted_token().ok().flatten().is_some();
    TokenStatus {
        configured: session_only || persisted,
        storage_available,
        session_only,
    }
}

pub fn set_persisted(runtime: &RuntimeState, token: String) -> Result<TokenStatus, String> {
    validate_token(&token)?;
    let entry = token_entry()?;
    entry.set_password(token.trim()).map_err(|_| {
        runtime.secure_storage_available.store(false, Ordering::Release);
        "Secure OS credential storage is unavailable. Use a session-only token instead.".to_owned()
    })?;
    runtime.secure_storage_available.store(true, Ordering::Release);
    clear_session(runtime)?;
    Ok(status(runtime))
}

pub fn set_session(runtime: &RuntimeState, token: String) -> Result<TokenStatus, String> {
    validate_token(&token)?;
    let mut session = runtime.session_token.lock()
        .map_err(|_| "Token session state is unavailable.".to_owned())?;
    *session = Some(Zeroizing::new(token.trim().to_owned()));
    Ok(status(runtime))
}

pub fn clear(runtime: &RuntimeState) -> Result<TokenStatus, String> {
    clear_session(runtime)?;
    if runtime.secure_storage_available.load(Ordering::Acquire) {
        for entry in [token_entry()?, legacy_token_entry()?] {
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => {}
                Err(_) => {
                    runtime.secure_storage_available.store(false, Ordering::Release);
                    return Err("Secure OS credential storage is unavailable.".to_owned());
                }
            }
        }
    }
    Ok(status(runtime))
}

pub fn token(runtime: &RuntimeState) -> Result<Option<Zeroizing<String>>, String> {
    let session = runtime.session_token.lock()
        .map_err(|_| "Token session state is unavailable.".to_owned())?;
    if let Some(token) = session.as_ref() {
        return Ok(Some(Zeroizing::new(token.to_string())));
    }
    drop(session);
    read_persisted_token()
}

fn clear_session(runtime: &RuntimeState) -> Result<(), String> {
    let mut session = runtime.session_token.lock()
        .map_err(|_| "Token session state is unavailable.".to_owned())?;
    *session = None;
    Ok(())
}

fn validate_token(token: &str) -> Result<(), String> {
    if token.trim().is_empty() {
        return Err("Enter a start.gg token first.".to_owned());
    }
    if token.len() > 4096 || token.chars().any(char::is_whitespace) {
        return Err("The start.gg token format is invalid.".to_owned());
    }
    Ok(())
}

fn read_persisted_token() -> Result<Option<Zeroizing<String>>, String> {
    let entry = token_entry()?;
    match entry.get_password() {
        Ok(token) => Ok(Some(Zeroizing::new(token))),
        Err(keyring::Error::NoEntry) => read_and_migrate_legacy_token(&entry),
        Err(_) => Err("Secure OS credential storage is unavailable.".to_owned()),
    }
}

fn read_and_migrate_legacy_token(new_entry: &keyring::Entry) -> Result<Option<Zeroizing<String>>, String> {
    match legacy_token_entry()?.get_password() {
        Ok(token) => {
            // Migration never exposes the secret outside the native process. Keep the legacy
            // credential as a rollback path until the operator explicitly clears it.
            let _ = new_entry.set_password(&token);
            Ok(Some(Zeroizing::new(token)))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Secure OS credential storage is unavailable.".to_owned()),
    }
}

fn token_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, STARTGG_ACCOUNT)
        .map_err(|_| "Secure OS credential storage is unavailable.".to_owned())
}

fn legacy_token_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(LEGACY_SERVICE, STARTGG_ACCOUNT)
        .map_err(|_| "Secure OS credential storage is unavailable.".to_owned())
}
