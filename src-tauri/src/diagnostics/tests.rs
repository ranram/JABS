use super::{
    Area, Context, Event, Method, Operation, Reason, commands,
    storage::{LogStorage, MAX_FILE_BYTES},
};
use std::{fs, path::PathBuf};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let directory =
            std::env::temp_dir().join(format!("jabs-diagnostics-{}", crate::stingers::unique_id()));
        fs::create_dir_all(&directory).unwrap();
        Self(directory)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn diagnostic_files_rotate_bound_exports_and_preserve_session_evidence() {
    let fixture = Fixture::new();
    let directory = fixture.0.join("logs");
    let mut log = LogStorage::open(directory.clone()).unwrap();
    assert!(!log.unfinished);
    let context = Context {
        area: Area::Reporting,
        reason: Some(Reason::Timeout),
        operation: Some(Operation::QueueHeartbeat),
        method: Some(Method::Post),
        request_id: Some(42),
        elapsed_ms: Some(3000),
        attempt: Some(1),
        ..Default::default()
    };
    for _ in 0..5 {
        log.record(Event::ReportOutcomeUncertain, context).unwrap();
    }
    log.flush_repeats().unwrap();
    let report = log.report().unwrap();
    let entries: Vec<serde_json::Value> = report
        .lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0]["count"], 1);
    assert_eq!(entries[1]["count"], 4);
    assert_eq!(entries[0]["reason"], "timeout");
    assert_eq!(entries[0]["operation"], "queue-heartbeat");
    assert_eq!(entries[0]["method"], "POST");
    assert_eq!(entries[0]["requestId"], 42);
    assert_eq!(entries[0]["elapsedMs"], 3000);
    assert_eq!(entries[0]["attempt"], 1);
    assert!(report.contains(env!("CARGO_PKG_VERSION")));
    assert!(report.contains(super::SUPPORT_EMAIL));
    log.record(Event::QueueContextMissing, Context { area: Area::Bracket, ..Default::default() }).unwrap();
    assert!(log.report().unwrap().contains("\"event\":\"queue-context-missing\""));
    let mut edited = entries[0].clone();
    edited["message"] = serde_json::json!("private secret from an edited log");
    fs::write(directory.join("jabs.log"), format!("{edited}\n")).unwrap();
    assert!(!log.report().unwrap().contains("private secret"));
    for key in ["operation", "method", "requestId", "elapsedMs", "attempt"] {
        edited.as_object_mut().unwrap().remove(key);
    }
    fs::write(directory.join("jabs.log"), format!("{edited}\n")).unwrap();
    assert!(log.report().unwrap().contains("report-outcome-uncertain"));
    assert!(!log.report().unwrap().contains("private secret"));
    edited["session"] = serde_json::json!("private-user");
    fs::write(directory.join("jabs.log"), format!("{edited}\n")).unwrap();
    assert!(!log.report().unwrap().contains("private-user"));
    fs::write(fixture.0.join("jabs-main.log"), "private legacy content").unwrap();
    fs::write(directory.join("unrelated.txt"), "private unrelated content").unwrap();
    for _ in 0..5 {
        fs::OpenOptions::new()
            .write(true)
            .open(directory.join("jabs.log"))
            .unwrap()
            .set_len(MAX_FILE_BYTES)
            .unwrap();
        log.write(Event::RequestFailed, Context::default(), 1)
            .unwrap();
    }
    for name in ["jabs.log", "jabs.1.log", "jabs.2.log"] {
        assert!(fs::metadata(directory.join(name)).unwrap().len() <= MAX_FILE_BYTES);
    }
    assert!(!directory.join("jabs.3.log").exists());
    let report = log.report().unwrap();
    assert!(report.len() < 3 * MAX_FILE_BYTES as usize + 1024);
    assert!(!report.contains("private legacy content"));
    assert!(!report.contains("private unrelated content"));
    drop(log);
    assert!(LogStorage::open(directory.clone()).unwrap().unfinished);
    fs::remove_file(directory.join("session-active")).unwrap();
    assert!(!LogStorage::open(directory).unwrap().unfinished);
}

#[test]
fn diagnostic_ingress_accepts_only_reviewed_events_and_non_text_metadata() {
    let context = Context {
        area: Area::Stream,
        status: Some(503),
        ..Default::default()
    };
    assert!(commands::report_renderer_diagnostic(Event::StreamSaveFailed, Some(context)).is_ok());
    assert!(commands::report_renderer_diagnostic(Event::QueueContextMissing, Some(context)).is_ok());
    assert!(commands::report_renderer_diagnostic(Event::SessionStarted, Some(context)).is_err());
    assert!(commands::report_renderer_diagnostic(Event::NativePanic, None).is_err());
    assert!(
        commands::report_renderer_diagnostic(
            Event::RendererError,
            Some(Context {
                line: Some(u32::MAX),
                ..context
            })
        )
        .is_err()
    );
    assert!(
        commands::report_renderer_diagnostic(
            Event::RendererError,
            Some(Context {
                status: Some(999),
                ..context
            })
        )
        .is_err()
    );
    for metadata in [
        serde_json::json!({"area":"stream","message":"private player text"}),
        serde_json::json!({"area":"private player text"}),
        serde_json::json!({"reason":"private token"}),
        serde_json::json!({"path":"/home/private-user/picture.png"}),
        serde_json::json!({"token":"private token"}),
        serde_json::json!({"operation":"/api/players/private-id"}),
        serde_json::json!({"method":"private method"}),
    ] {
        let request = serde_json::json!({"event":"renderer-error","context":metadata});
        assert!(serde_json::from_value::<commands::RendererReport>(request).is_err());
    }
    assert!(serde_json::from_str::<Event>("\"private arbitrary text\"").is_err());
    for context in [
        Context { request_id: Some(9_007_199_254_740_992), ..Context::default() },
        Context { elapsed_ms: Some(86_400_001), ..Context::default() },
        Context { attempt: Some(0), ..Context::default() },
        Context { attempt: Some(3), ..Context::default() },
    ] {
        assert!(commands::report_renderer_diagnostic(Event::LocalRequestFailed, Some(context)).is_err());
    }
    assert_eq!(Event::LocalRequestCancelled.level(), "info");
    assert_eq!(Event::LocalRequestRecovered.level(), "info");
}
