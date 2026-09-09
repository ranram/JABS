use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::time::Duration;
use tokio::{sync::Mutex, time::Instant};

const ENDPOINT: &str = "https://api.start.gg/gql/alpha";
mod anonymous;
pub const REFILL_INTERVAL: Duration = Duration::from_millis(800);
pub const BURST_CAPACITY: f64 = 4.0;

struct RequestBudget {
    available: f64,
    last_refill: Instant,
}

pub struct StartggClient {
    client: Client,
    request_budget: Mutex<RequestBudget>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub error: String,
    pub code: &'static str,
}

#[derive(Deserialize)]
struct GraphqlEnvelope<T> {
    data: Option<T>,
    errors: Option<Vec<GraphqlError>>,
    success: Option<bool>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct GraphqlError {
    message: Option<String>,
}

impl Default for StartggClient {
    fn default() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(15))
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .expect("static start.gg client configuration must be valid"),
            request_budget: Mutex::new(RequestBudget {
                available: BURST_CAPACITY,
                last_refill: Instant::now(),
            }),
        }
    }
}

impl StartggClient {
    pub async fn request<T: DeserializeOwned>(
        &self,
        token: &str,
        query: &str,
        variables: Value,
    ) -> Result<T, ApiError> {
        let request = self.client
            .post(ENDPOINT)
            .bearer_auth(token)
            .json(&json!({ "query": query, "variables": variables }));
        self.send(request).await
    }

    pub async fn request_anonymous<T: DeserializeOwned>(
        &self, query: &str, variables: Value,
    ) -> Result<T, ApiError> {
        let request = anonymous::read_request(&self.client, query, variables)?;
        self.send(request).await.map_err(anonymous::read_error)
    }

    async fn send<T: DeserializeOwned>(&self, request: reqwest::RequestBuilder) -> Result<T, ApiError> {
        self.throttle().await;
        let response = request
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    api_error("start.gg did not respond in time. Check the connection and try again.", "timeout")
                } else {
                    api_error("Unable to reach start.gg. Check the internet connection and try again.", "network")
                }
            })?;
        let status = response.status();
        if !status.is_success() {
            return Err(http_error(status));
        }
        let envelope = response.json::<GraphqlEnvelope<T>>().await
            .map_err(|_| api_error("start.gg returned an invalid response.", "invalid-response"))?;
        if envelope.success == Some(false) {
            return Err(classify_message(envelope.message.as_deref().unwrap_or("start.gg rejected the request.")));
        }
        if let Some(errors) = envelope.errors.filter(|errors| !errors.is_empty()) {
            let message = errors.into_iter().filter_map(|error| error.message).collect::<Vec<_>>().join("; ");
            return Err(classify_message(if message.is_empty() {
                "start.gg returned an error without a readable message."
            } else {
                &message
            }));
        }
        envelope.data.ok_or_else(|| api_error("start.gg response did not include data.", "invalid-response"))
    }

    async fn throttle(&self) {
        loop {
            let wait = {
                let mut budget = self.request_budget.lock().await;
                let now = Instant::now();
                let replenished = budget.available
                    + now.duration_since(budget.last_refill).as_secs_f64() / REFILL_INTERVAL.as_secs_f64();
                budget.available = replenished.min(BURST_CAPACITY);
                budget.last_refill = now;
                if budget.available >= 1.0 {
                    budget.available -= 1.0;
                    None
                } else {
                    Some(REFILL_INTERVAL.mul_f64(1.0 - budget.available))
                }
            };
            match wait {
                Some(wait) => tokio::time::sleep(wait).await,
                None => return,
            }
        }
    }
}

pub fn api_error(message: &str, code: &'static str) -> ApiError {
    ApiError { error: message.to_owned(), code }
}

pub fn classify_message(message: &str) -> ApiError {
    let normalized = message.to_lowercase();
    if normalized.contains("rate limit") || normalized.contains("too many requests") {
        api_error("start.gg rate limit reached. Wait about a minute before trying again.", "rate-limit")
    } else if normalized.contains("query complexity") {
        api_error("start.gg rejected the request because it returned too many objects. Narrow the bracket view and try again.", "query-complexity")
    } else if normalized.contains("unauth") || normalized.contains("invalid token") || normalized.contains("expired token") {
        api_error("start.gg rejected the token. It may be invalid or expired.", "authentication")
    } else if normalized.contains("forbidden") || normalized.contains("permission") {
        api_error("This start.gg token does not have permission for the requested tournament operation.", "permission")
    } else {
        api_error(message, "graphql")
    }
}

fn http_error(status: StatusCode) -> ApiError {
    match status.as_u16() {
        401 => api_error("start.gg rejected the token. Check that it is current, then save it again.", "authentication"),
        403 => api_error("This start.gg token does not have permission for the requested tournament operation.", "permission"),
        429 => api_error("start.gg rate limit reached. Wait about a minute before trying again.", "rate-limit"),
        value if value >= 500 => api_error("start.gg is temporarily unavailable. Try again shortly.", "upstream"),
        _ => api_error("start.gg request failed.", "upstream"),
    }
}

#[cfg(test)]
mod tests {
    use super::classify_message;

    #[test]
    fn classifies_common_startgg_failures() {
        assert_eq!(classify_message("rate limit exceeded").code, "rate-limit");
        assert_eq!(classify_message("query complexity is too high").code, "query-complexity");
        assert_eq!(classify_message("invalid token").code, "authentication");
        assert_eq!(classify_message("permission denied").code, "permission");
    }
}
