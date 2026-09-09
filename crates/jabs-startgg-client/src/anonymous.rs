use reqwest::{Client, RequestBuilder};
use serde_json::{Value, json};
use crate::{ApiError, api_error};

// The public website has a separate schema/version lifecycle from the developer API.
const ENDPOINT: &str = "https://www.start.gg/api/-/gql";
const CLIENT_VERSION: &str = "20";

pub(super) fn read_request(client: &Client, query: &str, variables: Value) -> Result<RequestBuilder, ApiError> {
    // Only compiled, named read queries are passed here. No operationName is sent,
    // so the server also rejects documents containing multiple operations.
    if !query.trim_start().starts_with("query ") {
        return Err(api_error("A start.gg token is required to report results.", "token-missing"));
    }
    Ok(client.post(ENDPOINT)
        .header("client-version", CLIENT_VERSION)
        .json(&json!({ "query": query, "variables": variables })))
}

pub(super) fn read_error(error: ApiError) -> ApiError {
    match error.code {
        "network" | "timeout" | "rate-limit" | "query-complexity" => error,
        _ => api_error(
            "Public start.gg access could not load this data. Try again, or add a token in Connect start.gg to use authenticated access. Your local overlay controls still work.",
            "anonymous-unavailable",
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn anonymous_reads_never_attach_credentials_or_accept_mutations() {
        let client = Client::new();
        let request = read_request(&client, "query PublicSets { event(id: 1) { id } }", json!({})).unwrap().build().unwrap();
        assert_eq!(request.url().as_str(), ENDPOINT);
        assert_eq!(request.headers()["client-version"], CLIENT_VERSION);
        assert!(!request.headers().contains_key("authorization"));
        assert!(!request.headers().contains_key("cookie"));
        for query in ["mutation Report { reportBracketSet(setId: 1) { id } }", "subscription Updates { id }", "{ event(id: 1) { id } }"] {
            assert!(read_request(&client, query, json!({})).is_err());
        }
        assert_eq!(read_error(api_error("Out of date client", "upstream")).code, "anonymous-unavailable");
        assert_eq!(read_error(api_error("Wait", "rate-limit")).code, "rate-limit");
    }
}
