use super::secure_json;
use axum::{
    Json,
    body::Body,
    http::{StatusCode, Uri, header},
    response::Response,
};
use std::{sync::LazyLock, time::Duration};

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(5))
        .build()
        .expect("static Vite client configuration must be valid")
});

pub(super) async fn response(uri: Uri) -> Response {
    proxy(&CLIENT, "http://127.0.0.1:5173", &uri).await
}

// Keep OBS on the native origin so refreshing still works after switching builds.
// The upstream address is fixed; incoming hosts and query parameters cannot select it.
async fn proxy(client: &reqwest::Client, upstream: &str, uri: &Uri) -> Response {
    let path = uri.path_and_query().map_or("/", |value| value.as_str());
    let result = async {
        let upstream = client.get(format!("{upstream}{path}")).send().await?;
        let status = upstream.status();
        let content_type = upstream.headers().get(header::CONTENT_TYPE).cloned();
        let bytes = upstream.bytes().await?;
        let mut response = Response::new(Body::from(bytes));
        *response.status_mut() = status;
        if let Some(value) = content_type {
            response.headers_mut().insert(header::CONTENT_TYPE, value);
        }
        Ok::<_, reqwest::Error>(secure_json(response))
    }
    .await;
    result.unwrap_or_else(|_| {
        secure_json((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": "The JABS development web server is unavailable." })),
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, routing::get};

    #[tokio::test]
    async fn dev_pages_and_font_bytes_stay_on_the_native_origin() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream = format!("http://{}", listener.local_addr().unwrap());
        let app = Router::new()
            .route(
                "/overlay/stingers",
                get(|| async { axum::response::Html("<main>stingers</main>") }),
            )
            .route(
                "/src/font.ttf",
                get(|| async { ([(header::CONTENT_TYPE, "font/ttf")], b"\0\x01\0\0font") }),
            );
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        for (path, mime, body) in [
            (
                "/overlay/stingers?apiPort=4279",
                "text/html; charset=utf-8",
                &b"<main>stingers</main>"[..],
            ),
            ("/src/font.ttf", "font/ttf", &b"\0\x01\0\0font"[..]),
        ] {
            let response = proxy(&CLIENT, &upstream, &path.parse().unwrap()).await;
            assert_eq!(response.status(), StatusCode::OK);
            assert!(!response.headers().contains_key(header::LOCATION));
            assert_eq!(response.headers()[header::CONTENT_TYPE], mime);
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
            assert_eq!(
                axum::body::to_bytes(response.into_body(), 1024)
                    .await
                    .unwrap()
                    .as_ref(),
                body
            );
        }
        server.abort();
    }
}
