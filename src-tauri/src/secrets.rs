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
    runtime
        .secure_storage_available
        .store(read_persisted_token().is_ok(), Ordering::Release);
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
    let token = Zeroizing::new(token);
    validate_token(&token)?;
    let entry = token_entry()?;
    save_to_entry(runtime, &token, &entry)
}

fn save_to_entry(
    runtime: &RuntimeState,
    token: &str,
    entry: &keyring::Entry,
) -> Result<TokenStatus, String> {
    let unavailable = || {
        runtime
            .secure_storage_available
            .store(false, Ordering::Release);
        "Secure OS credential storage is unavailable. Use a session-only token instead.".to_owned()
    };
    entry.set_password(token).map_err(|_| unavailable())?;
    let saved = Zeroizing::new(entry.get_password().map_err(|_| unavailable())?);
    if saved.as_str() != token {
        runtime
            .secure_storage_available
            .store(false, Ordering::Release);
        return Err("JABS could not confirm that your token was saved in OS credential storage. Try saving it again.".to_owned());
    }
    runtime
        .secure_storage_available
        .store(true, Ordering::Release);
    clear_session(runtime)?;
    Ok(TokenStatus {
        configured: true,
        storage_available: true,
        session_only: false,
    })
}

pub fn set_session(runtime: &RuntimeState, token: String) -> Result<TokenStatus, String> {
    let token = Zeroizing::new(token);
    validate_token(&token)?;
    let mut session = runtime
        .session_token
        .lock()
        .map_err(|_| "Token session state is unavailable.".to_owned())?;
    *session = Some(Zeroizing::new(token.trim().to_owned()));
    drop(session);
    Ok(status(runtime))
}

pub fn clear(runtime: &RuntimeState) -> Result<TokenStatus, String> {
    clear_tokens(runtime, |service| {
        keyring::Entry::new(service, STARTGG_ACCOUNT)?.delete_credential()
    })
}

fn clear_tokens(
    runtime: &RuntimeState,
    mut delete_credential: impl FnMut(&str) -> keyring::Result<()>,
) -> Result<TokenStatus, String> {
    clear_session(runtime)?;
    // A storage failure can leave a saved token behind. Always try deleting
    // both the current credential and the one used by older installations.
    let mut cleared = true;
    for service in [SERVICE, LEGACY_SERVICE] {
        match delete_credential(service) {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(_) => cleared = false,
        }
    }
    runtime
        .secure_storage_available
        .store(cleared, Ordering::Release);
    if !cleared {
        return Err("The session token was cleared, but saved tokens could not be removed. Try again when OS credential storage is available.".to_owned());
    }
    Ok(TokenStatus {
        configured: false,
        storage_available: true,
        session_only: false,
    })
}

pub fn token(runtime: &RuntimeState) -> Result<Option<Zeroizing<String>>, String> {
    let session = runtime
        .session_token
        .lock()
        .map_err(|_| "Token session state is unavailable.".to_owned())?;
    if let Some(token) = session.as_ref() {
        return Ok(Some(Zeroizing::new(token.to_string())));
    }
    drop(session);
    read_persisted_token()
}

fn clear_session(runtime: &RuntimeState) -> Result<(), String> {
    let mut session = runtime
        .session_token
        .lock()
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
    read_from_entries(&token_entry()?, &legacy_token_entry()?)
}

fn read_from_entries(
    entry: &keyring::Entry,
    legacy_entry: &keyring::Entry,
) -> Result<Option<Zeroizing<String>>, String> {
    match entry.get_password() {
        Ok(token) => Ok(Some(Zeroizing::new(token))),
        Err(keyring::Error::NoEntry) => read_and_migrate_legacy_token(entry, legacy_entry),
        Err(_) => Err("Secure OS credential storage is unavailable.".to_owned()),
    }
}

fn read_and_migrate_legacy_token(
    new_entry: &keyring::Entry,
    legacy_entry: &keyring::Entry,
) -> Result<Option<Zeroizing<String>>, String> {
    match legacy_entry.get_password() {
        Ok(token) => {
            let token = Zeroizing::new(token);
            // Migration never exposes the secret outside the native process. Keep the legacy
            // credential as a rollback path until the operator explicitly clears it.
            let _ = new_entry.set_password(&token);
            Ok(Some(token))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_token_status_returns_without_deadlocking_and_clear_removes_token() {
        let (sender, receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let database =
                crate::database::Database::open(std::path::Path::new(":memory:")).unwrap();
            let runtime = RuntimeState::new(
                database,
                Default::default(),
                Default::default(),
                Default::default(),
                Default::default(),
                Default::default(),
                Default::default(),
            )
            .unwrap();
            assert!(set_session(&runtime, "invalid token".to_owned()).is_err());
            let status = set_session(&runtime, "test-token-not-a-secret".to_owned()).unwrap();
            assert!(status.configured && status.session_only && !status.storage_available);
            assert_eq!(
                token(&runtime).unwrap().unwrap().as_str(),
                "test-token-not-a-secret"
            );
            let mut removed = Vec::new();
            let status = clear_tokens(&runtime, |service| {
                removed.push(service.to_owned());
                Err(keyring::Error::NoEntry)
            })
            .unwrap();
            assert_eq!(removed, [SERVICE, LEGACY_SERVICE]);
            assert!(!status.configured && !status.session_only);
            assert!(runtime.session_token.lock().unwrap().is_none());
            runtime
                .secure_storage_available
                .store(false, Ordering::Release);
            set_session(&runtime, "another-test-token".to_owned()).unwrap();
            removed.clear();
            let error = clear_tokens(&runtime, |service| {
                removed.push(service.to_owned());
                Err(keyring::Error::NoDefaultStore)
            })
            .err()
            .unwrap();
            assert_eq!(removed, [SERVICE, LEGACY_SERVICE]);
            assert!(error.contains("saved tokens could not be removed"));
            assert!(runtime.session_token.lock().unwrap().is_none());
            sender.send(()).unwrap();
        });
        receiver
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("session token operations must not deadlock");
    }

    #[test]
    #[ignore = "Requires an unlocked OS credential store; uses disposable test credentials."]
    fn os_credentials_survive_a_fresh_process_and_are_removed() {
        const INITIAL: &str = "jabs-credential-check-not-a-real-api-token";
        const UPDATED: &str = "jabs-credential-check-replacement-not-a-real-api-token";
        let service = std::env::var("JABS_CREDENTIAL_CHECK_SERVICE")
            .unwrap_or_else(|_| format!("JABS-security-check-{}", std::process::id()));
        assert!(service.starts_with("JABS-security-check-"));
        let phase = std::env::var("JABS_CREDENTIAL_CHECK_PHASE").ok();
        let entries = TestCredentials {
            current: keyring::Entry::new(&service, STARTGG_ACCOUNT)
                .expect("Test credential store is unavailable"),
            legacy: keyring::Entry::new(&format!("{service}-legacy"), STARTGG_ACCOUNT).unwrap(),
            cleanup: phase.is_none(),
        };
        if let Some(phase) = phase {
            let token = read_from_entries(&entries.current, &entries.legacy).unwrap();
            if phase == "read" {
                assert!(
                    token.as_deref().map(String::as_str) == Some(UPDATED),
                    "Saved token did not survive a fresh process"
                );
            } else {
                assert!(
                    token.is_none(),
                    "Removed token was still present in a fresh process"
                );
            }
            return;
        }
        assert!(matches!(
            entries.current.get_password(),
            Err(keyring::Error::NoEntry)
        ));
        assert!(matches!(
            entries.legacy.get_password(),
            Err(keyring::Error::NoEntry)
        ));
        let database = crate::database::Database::open(std::path::Path::new(":memory:")).unwrap();
        let runtime = RuntimeState::new(
            database,
            Default::default(),
            Default::default(),
            Default::default(),
            Default::default(),
            Default::default(),
            Default::default(),
        )
        .unwrap();
        entries.legacy.set_password(INITIAL).unwrap();
        let migrated = read_from_entries(&entries.current, &entries.legacy)
            .unwrap()
            .unwrap();
        assert!(
            migrated.as_str() == INITIAL,
            "Legacy migration changed the test token"
        );
        assert!(entries.current.get_password().unwrap() == INITIAL);
        set_session(&runtime, "temporary-test-token".to_owned()).unwrap();
        let status = save_to_entry(&runtime, UPDATED, &entries.current).unwrap();
        assert!(status.configured && status.storage_available && !status.session_only);
        assert!(runtime.session_token.lock().unwrap().is_none());
        for phase in ["read", "removed"] {
            if phase == "removed" {
                // Verify that deletion still runs after a previous storage failure.
                runtime
                    .secure_storage_available
                    .store(false, Ordering::Release);
                let status = clear_tokens(&runtime, |service| {
                    if service == SERVICE {
                        entries.current.delete_credential()
                    } else {
                        entries.legacy.delete_credential()
                    }
                })
                .unwrap();
                assert!(!status.configured && status.storage_available && !status.session_only);
            }
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "secrets::tests::os_credentials_survive_a_fresh_process_and_are_removed",
                    "--ignored",
                ])
                .env("JABS_CREDENTIAL_CHECK_SERVICE", &service)
                .env("JABS_CREDENTIAL_CHECK_PHASE", phase)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "Fresh-process credential check failed: {phase}"
            );
        }
    }

    struct TestCredentials {
        current: keyring::Entry,
        legacy: keyring::Entry,
        // Only the parent owns cleanup; fresh-process reads leave entries intact.
        cleanup: bool,
    }

    impl Drop for TestCredentials {
        fn drop(&mut self) {
            if self.cleanup {
                let _ = self.current.delete_credential();
                let _ = self.legacy.delete_credential();
            }
        }
    }
}
