use super::*;

#[test]
fn pairing_is_disabled_by_default_and_revocation_discards_credentials_and_pending_commands() {
    let bridge = Bridge::default();
    let key = "ab".repeat(32);
    assert_eq!(bridge.authenticate(&key), None);
    assert_eq!(bridge.local_epoch(), None);
    let (reply, receive) = oneshot::channel();
    {
        let mut inner = bridge.inner.lock().unwrap();
        inner.key = Some(Zeroizing::new(key.clone()));
        inner.epoch = 3;
        inner.pending.insert("3-1".into(), reply);
    }
    assert_eq!(bridge.authenticate(&key), Some(3));
    assert_eq!(bridge.authenticate(&"ac".repeat(32)), None);
    assert_eq!(bridge.authenticate(""), None);
    bridge.stop().unwrap();
    assert_eq!(bridge.authenticate(&key), None);
    assert!(receive.blocking_recv().is_err());
    assert!(bridge.inner.lock().unwrap().pending.is_empty());
    assert_eq!(bridge.local_epoch(), None);
}

#[test]
fn trusted_local_mode_has_an_epoch_and_stop_revokes_it() {
    let bridge = Bridge::default();
    {
        let mut inner = bridge.inner.lock().unwrap();
        inner.local_enabled = true;
        inner.epoch = 5;
    }
    assert_eq!(bridge.local_epoch(), Some(5));
    // An explicitly supplied invalid key never falls back to local mode.
    assert_eq!(bridge.authenticate("wrong"), None);
    bridge.stop().unwrap();
    assert_eq!(bridge.local_epoch(), None);
}

#[test]
fn commands_are_allowlisted_and_acknowledgments_cannot_complete_other_requests() {
    assert!(
        serde_json::from_value::<Request>(serde_json::json!({"id":1,"action":"report-set"}))
            .is_err()
    );
    assert!(
        serde_json::from_value::<Request>(
            serde_json::json!({"id":1,"action":"score-p1-up","token":"secret"})
        )
        .is_err()
    );
    let request: Request = serde_json::from_value(
        serde_json::json!({"id":1,"action":"score-p1-up","expectedVersion":"v1"}),
    )
    .unwrap();
    assert!(request.action.needs_match());
    assert!(Action::ClearQueue.needs_queue());
    for (action, needs_match) in [("stinger-perfect", false), ("stinger-winner", true)] {
        let request: Request = serde_json::from_value(serde_json::json!({"id":2,"action":action})).unwrap();
        assert_eq!(request.action.needs_match(), needs_match);
    }
    let bridge = Bridge::default();
    let (reply, receive) = oneshot::channel();
    bridge
        .inner
        .lock()
        .unwrap()
        .pending
        .insert("1-1".into(), reply);
    bridge.acknowledge("different", Outcome::Completed).unwrap();
    assert_eq!(bridge.inner.lock().unwrap().pending.len(), 1);
    bridge.acknowledge("1-1", Outcome::Blocked).unwrap();
    assert_eq!(receive.blocking_recv().unwrap(), Outcome::Blocked);
}

#[test]
fn confirmation_lifecycle_only_closes_the_matching_dialog() {
    let bridge = Bridge::default();
    let (reply, receive) = oneshot::channel();
    bridge
        .inner
        .lock()
        .unwrap()
        .pending
        .insert("1-dialog".into(), reply);
    bridge
        .acknowledge("1-dialog", Outcome::ConfirmationRequired)
        .unwrap();
    assert_eq!(
        receive.blocking_recv().unwrap(),
        Outcome::ConfirmationRequired
    );
    assert_eq!(bridge.confirmation.borrow().as_deref(), Some("1-dialog"));
    bridge.close_confirmation("old-dialog");
    assert_eq!(bridge.confirmation.borrow().as_deref(), Some("1-dialog"));
    bridge.close_confirmation("1-dialog");
    assert!(bridge.confirmation.borrow().is_none());
    bridge.confirmation.send_replace(Some("new-dialog".into()));
    bridge.close_confirmation("1-dialog");
    assert_eq!(bridge.confirmation.borrow().as_deref(), Some("new-dialog"));
    bridge.stop().unwrap();
    assert!(bridge.confirmation.borrow().is_none());
}

#[test]
fn state_snapshots_contain_only_tile_values_and_queue_progress() {
    let root = std::env::temp_dir().join(format!("jabs-deck-test-{}", std::process::id()));
    let database = crate::database::Database::open(std::path::Path::new(":memory:")).unwrap();
    let runtime = RuntimeState::new(
        database,
        root.join("logos"),
        root.join("sponsors"),
        root.join("players"),
        root.join("games"),
        root.join("custom"),
        root.join("allowlist.txt"),
    )
    .unwrap();
    let state = super::socket::snapshot(&runtime).unwrap();
    assert_eq!(state["protocol"], 1);
    assert_eq!(state["playerOne"]["score"], 0);
    assert_eq!(state["playerTwo"]["score"], 0);
    assert_eq!(state["playerOne"].as_object().unwrap().len(), 2);
    assert_eq!(state.as_object().unwrap().len(), 7);
    assert!(state["confirmationId"].is_null());
    assert!(state.get("token").is_none());
    assert!(state.get("key").is_none());
    assert!(state["playerOne"].get("playerId").is_none());
}

#[test]
fn native_websocket_authenticates_before_state_and_closes_on_revocation() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    async fn connect(port: u16, extra: &str) -> (tokio::net::TcpStream, String) {
        let mut socket = tokio::net::TcpStream::connect((std::net::Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        let request = format!(
            "GET /deck HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n{extra}\r\n"
        );
        socket.write_all(request.as_bytes()).await.unwrap();
        let mut headers = Vec::new();
        while !headers.ends_with(b"\r\n\r\n") {
            headers.push(socket.read_u8().await.unwrap());
            assert!(headers.len() < 4096);
        }
        (socket, String::from_utf8(headers).unwrap())
    }
    async fn hello(socket: &mut tokio::net::TcpStream, key: Option<&str>) {
        let payload = match key {
            Some(key) => serde_json::json!({"type":"hello","protocol":1,"key":key}),
            None => serde_json::json!({"type":"hello","protocol":1}),
        }
        .to_string();
        assert!(payload.len() < 126);
        let mask = [3, 1, 4, 1];
        let mut frame = vec![0x81, 0x80 | payload.len() as u8];
        frame.extend(mask);
        frame.extend(
            payload
                .bytes()
                .enumerate()
                .map(|(i, byte)| byte ^ mask[i % 4]),
        );
        socket.write_all(&frame).await.unwrap();
    }
    async fn frame(socket: &mut tokio::net::TcpStream) -> (u8, Vec<u8>) {
        let opcode = socket.read_u8().await.unwrap() & 15;
        let mut length = (socket.read_u8().await.unwrap() & 127) as usize;
        if length == 126 {
            length = socket.read_u16().await.unwrap() as usize;
        }
        assert!(length < 16_384);
        let mut body = vec![0; length];
        socket.read_exact(&mut body).await.unwrap();
        (opcode, body)
    }
    tokio::runtime::Runtime::new().unwrap().block_on(async {
        let root = std::env::temp_dir().join("jabs-stream-deck-socket-test");
        let database = crate::database::Database::open(std::path::Path::new(":memory:")).unwrap();
        let runtime = Arc::new(
            RuntimeState::new(
                database,
                root.join("logos"),
                root.join("sponsors"),
                root.join("players"),
                root.join("games"),
                root.join("custom"),
                root.join("allowlist.txt"),
            )
            .unwrap(),
        );
        let key = "ab".repeat(32);
        runtime.stream_deck.inner.lock().unwrap().key = Some(Zeroizing::new(key.clone()));
        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let port = listener.local_addr().unwrap().port();
        let app = axum::Router::new()
            .route("/deck", axum::routing::get(super::upgrade))
            .with_state(runtime.clone());
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let (_, missing_header) = connect(port, "").await;
        assert!(missing_header.starts_with("HTTP/1.1 403"));
        let (_, browser) = connect(
            port,
            "X-JABS-Action: renderer-v1\r\nOrigin: http://127.0.0.1\r\n",
        )
        .await;
        assert!(browser.starts_with("HTTP/1.1 403"));
        let (mut invalid, headers) = connect(port, "X-JABS-Action: renderer-v1\r\n").await;
        assert!(headers.starts_with("HTTP/1.1 101"));
        hello(&mut invalid, Some(&"ac".repeat(32))).await;
        let mut byte = [0];
        let closed = tokio::time::timeout(Duration::from_secs(2), invalid.read(&mut byte))
            .await
            .unwrap();
        assert!(closed.is_err() || closed.unwrap() == 0);
        let (mut disabled, _) = connect(port, "X-JABS-Action: renderer-v1\r\n").await;
        hello(&mut disabled, None).await;
        let closed = tokio::time::timeout(Duration::from_secs(2), disabled.read(&mut byte))
            .await
            .unwrap();
        assert!(closed.is_err() || closed.unwrap() == 0);
        let (mut paired, _) = connect(port, "X-JABS-Action: renderer-v1\r\n").await;
        hello(&mut paired, Some(&key)).await;
        assert_eq!(frame(&mut paired).await.0, 1);
        runtime.stream_deck.inner.lock().unwrap().local_enabled = true;
        let (mut wrong_key, _) = connect(port, "X-JABS-Action: renderer-v1\r\n").await;
        hello(&mut wrong_key, Some(&"ac".repeat(32))).await;
        let closed = tokio::time::timeout(Duration::from_secs(2), wrong_key.read(&mut byte))
            .await
            .unwrap();
        assert!(closed.is_err() || closed.unwrap() == 0);
        let (mut valid, _) = connect(port, "X-JABS-Action: renderer-v1\r\n").await;
        hello(&mut valid, None).await;
        let (opcode, body) = tokio::time::timeout(Duration::from_secs(2), frame(&mut valid))
            .await
            .unwrap();
        assert_eq!(opcode, 1);
        let snapshot: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(snapshot["type"], "state");
        assert!(snapshot.get("key").is_none());
        let (reply, _receive) = oneshot::channel();
        runtime
            .stream_deck
            .inner
            .lock()
            .unwrap()
            .pending
            .insert("socket-dialog".into(), reply);
        runtime
            .stream_deck
            .acknowledge("socket-dialog", Outcome::ConfirmationRequired)
            .unwrap();
        let (_, body) = tokio::time::timeout(Duration::from_secs(2), frame(&mut valid))
            .await
            .unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&body).unwrap()["confirmationId"],
            "socket-dialog"
        );
        runtime.stream_deck.close_confirmation("socket-dialog");
        let (_, body) = tokio::time::timeout(Duration::from_secs(2), frame(&mut valid))
            .await
            .unwrap();
        assert!(
            serde_json::from_slice::<serde_json::Value>(&body).unwrap()["confirmationId"].is_null()
        );
        runtime.stream_deck.stop().unwrap();
        tokio::time::timeout(Duration::from_secs(2), async {
            // State frames already sent can arrive before the close frame.
            loop {
                let (opcode, body) = frame(&mut valid).await;
                if opcode == 8 { break; }
                assert_eq!(opcode, 1);
                let state: serde_json::Value = serde_json::from_slice(&body).unwrap();
                assert_eq!(state["type"], "state");
                assert!(state["confirmationId"].is_null());
            }
        }).await.unwrap();
        server.abort();
    });
}
