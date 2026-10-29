pub(crate) mod commands;
mod storage;
mod operations;
pub use operations::{Method, Operation};
#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicUsize, Ordering},
        mpsc::{self, SyncSender},
    },
    time::Duration,
};
use storage::LogStorage;

pub const SUPPORT_EMAIL: &str = "akatsatech@gmail.com";
const QUEUE_SIZE: usize = 128;
static LOGGER: OnceLock<Logger> = OnceLock::new();

// Only reviewed event names and typed metadata reach disk. Error messages,
// command arguments, HTTP bodies, URLs, and player text are never accepted.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Event {
    SessionStarted,
    SessionEnded,
    PreviousSessionUnfinished,
    StartupFailed,
    DatabaseOpened,
    RuntimeReady,
    LocalServiceStarted,
    NativePanic,
    LocalServiceStopped,
    RequestFailed,
    StartggFailed,
    ReportOutcomeUncertain,
    SettingsRecovered,
    ArtworkSetupFailed,
    LogoSetupFailed, // Retained for reading existing diagnostic files.
    AllowlistLoadFailed,
    ObsSourceConnected,
    ObsSourceDisconnected,
    ObsReconnectRequested,
    StingerStarted,
    StingerFinished,
    StingerFailed,
    RendererError,
    QueueContextMissing,
    RendererRejection,
    NativeCommandFailed,
    RealtimeDisconnected,
    RealtimeReconnected,
    ExportFailed,
    ImageFailed,
    InvalidResponse,
    QueueOverflow,
    #[serde(rename = "stream-save:renderer-start")]
    StreamSaveStarted,
    #[serde(rename = "stream-save:renderer-complete")]
    StreamSaveCompleted,
    #[serde(rename = "stream-save:renderer-failed")]
    StreamSaveFailed,
    #[serde(rename = "local-request:retry")]
    LocalRequestRetry,
    #[serde(rename = "local-request:failed")]
    LocalRequestFailed,
    #[serde(rename = "local-request:cancelled")]
    LocalRequestCancelled,
    #[serde(rename = "local-request:recovered")]
    LocalRequestRecovered,
}

impl Event {
    fn renderer_allowed(self) -> bool {
        matches!(
            self,
            Self::RendererError
                | Self::QueueContextMissing
                | Self::RendererRejection
                | Self::NativeCommandFailed
                | Self::RealtimeDisconnected
                | Self::RealtimeReconnected
                | Self::ExportFailed
                | Self::ImageFailed
                | Self::InvalidResponse
                | Self::StreamSaveStarted
                | Self::StreamSaveCompleted
                | Self::StreamSaveFailed
                | Self::LocalRequestRetry
                | Self::LocalRequestFailed
                | Self::LocalRequestCancelled
                | Self::LocalRequestRecovered
        )
    }

    fn level(self) -> &'static str {
        match self {
            Self::SessionStarted
            | Self::SessionEnded
            | Self::DatabaseOpened
            | Self::RuntimeReady
            | Self::LocalServiceStarted
            | Self::StreamSaveStarted
            | Self::StreamSaveCompleted
            | Self::ObsSourceConnected
            | Self::ObsReconnectRequested
            | Self::StingerStarted
            | Self::StingerFinished
            | Self::RealtimeReconnected => "info",
            Self::LocalRequestCancelled | Self::LocalRequestRecovered => "info",
            Self::PreviousSessionUnfinished
            | Self::SettingsRecovered
            | Self::ObsSourceDisconnected
            | Self::LocalRequestRetry
            | Self::RealtimeDisconnected
            | Self::QueueOverflow => "warning",
            _ => "error",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Area {
    #[default]
    App,
    Stream,
    Bracket,
    Startgg,
    Reporting,
    Assets,
    Generators,
    Obs,
    Settings,
    Players,
    Desktop,
    Updates,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Reason {
    Network,
    Timeout,
    Cancelled,
    Permission,
    RateLimit,
    Upstream,
    Server,
    InvalidResponse,
    Validation,
    Storage,
    NotFound,
    Unavailable,
    AddressInUse,
    TypeError,
    ReferenceError,
    Unknown,
}

impl Reason {
    pub fn from_code(code: &str) -> Self {
        match code {
            "network" => Self::Network,
            "timeout" => Self::Timeout,
            "permission" | "unauthorized" | "authentication" | "token-missing"
            | "token-required" => Self::Permission,
            "rate-limit" | "rate-limited" => Self::RateLimit,
            "upstream" => Self::Upstream,
            "invalid-response" => Self::InvalidResponse,
            "validation" => Self::Validation,
            "storage" => Self::Storage,
            "not-found" => Self::NotFound,
            "unavailable" => Self::Unavailable,
            _ => Self::Unknown,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct Context {
    pub area: Area,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<Reason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation: Option<Operation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<Method>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub elapsed_ms: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt: Option<u8>,
}

impl Context {
    fn is_valid(self) -> bool {
        self.status
            .is_none_or(|status| (100..=599).contains(&status))
            && self.request_id.is_none_or(|id| id <= 9_007_199_254_740_991)
            && self.elapsed_ms.is_none_or(|ms| ms <= 86_400_000)
            && self.attempt.is_none_or(|attempt| (1..=2).contains(&attempt))
            && [self.line, self.column]
                .into_iter()
                .flatten()
                .all(|value| value <= 10_000_000)
    }
}

#[derive(Clone, Debug, Serialize)]
struct Entry {
    timestamp: String,
    session: String,
    version: String,
    level: &'static str,
    event: Event,
    #[serde(flatten)]
    context: Context,
    count: usize,
}

enum Message {
    Record(Event, Context),
    Flush(SyncSender<()>),
}

struct Logger {
    sender: SyncSender<Message>,
    storage: Arc<Mutex<LogStorage>>,
    dropped: Arc<AtomicUsize>,
}

pub fn initialize(app_data: &Path) -> std::io::Result<()> {
    if LOGGER.get().is_some() {
        return Ok(());
    }
    let storage = LogStorage::open(app_data.join("logs"))?;
    let unfinished = storage.unfinished;
    let storage = Arc::new(Mutex::new(storage));
    let dropped = Arc::new(AtomicUsize::new(0));
    let (sender, receiver) = mpsc::sync_channel(QUEUE_SIZE);
    let files = storage.clone();
    let lost = dropped.clone();
    std::thread::Builder::new()
        .name("jabs-diagnostics".into())
        .spawn(move || {
            loop {
                let message = receiver.recv_timeout(Duration::from_secs(5));
                let Ok(mut files) = files.lock() else { break };
                let dropped = lost.swap(0, Ordering::Relaxed);
                if dropped > 0 {
                    if files
                        .write(Event::QueueOverflow, Context::default(), dropped)
                        .is_err()
                    {
                        files.write_failed = true;
                    }
                }
                let result = match message {
                    Ok(Message::Record(event, context)) => files.record(event, context),
                    Ok(Message::Flush(done)) => {
                        let result = files.flush_repeats();
                        let _ = done.send(());
                        result
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => files.flush_repeats(),
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                };
                if result.is_err() {
                    files.write_failed = true;
                }
            }
        })?;
    let _ = LOGGER.set(Logger {
        sender,
        storage,
        dropped,
    });
    record(Event::SessionStarted, Context::default());
    if unfinished {
        record(Event::PreviousSessionUnfinished, Context::default());
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // Panic payloads can contain secrets or user text. Preserve only location numbers.
        if let Some(logger) = LOGGER.get() {
            if let Ok(mut files) = logger.storage.try_lock() {
                let _ = files.write(
                    Event::NativePanic,
                    Context {
                        line: info.location().map(|location| location.line()),
                        column: info.location().map(|location| location.column()),
                        ..Context::default()
                    },
                    1,
                );
            }
        }
        previous(info);
    }));
    Ok(())
}

pub fn record(event: Event, context: Context) {
    if let Some(logger) = LOGGER.get() {
        if logger
            .sender
            .try_send(Message::Record(event, context))
            .is_err()
        {
            logger.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
}

fn flush() -> Result<(), String> {
    let logger = LOGGER.get().ok_or("JABS diagnostics are unavailable.")?;
    let (done, receiver) = mpsc::sync_channel(1);
    logger
        .sender
        .try_send(Message::Flush(done))
        .map_err(|_| "JABS diagnostics are unavailable.")?;
    receiver
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| "JABS could not prepare the diagnostic report.".to_owned())
}

pub fn shutdown(clean: bool) {
    if clean {
        record(Event::SessionEnded, Context::default());
    }
    if flush().is_ok() && clean {
        if let Some(logger) = LOGGER.get() {
            if let Ok(files) = logger.storage.lock() {
                let _ = std::fs::remove_file(files.directory.join("session-active"));
            }
        }
    }
}

pub fn http_failure(route: &str, status: u16) {
    let area = if route.starts_with("/assets/") || route.starts_with("/api/assets/") {
        Area::Assets
    } else if route.contains("stingers") {
        Area::Obs
    } else if route.contains("report") {
        Area::Reporting
    } else if route.starts_with("/api/startgg/") {
        Area::Bracket
    } else if route.starts_with("/api/players") {
        Area::Players
    } else if route.contains("state") {
        Area::Stream
    } else {
        Area::Settings
    };
    record(
        Event::RequestFailed,
        Context {
            area,
            status: Some(status),
            ..Context::default()
        },
    );
}
