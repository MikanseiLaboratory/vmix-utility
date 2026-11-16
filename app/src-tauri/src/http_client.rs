use crate::app_log;
use crate::types::{Input, Inputs, VmixXml};
use anyhow::Result;
use std::collections::HashMap;
use std::time::Duration;
use vmix_rs::http::HttpVmixClient;

/// vMix functions whose `Value` is a position in milliseconds.
const MILLISECOND_FUNCTIONS: [&str; 1] = ["SetPosition"];

// HTTP Wrapper for HttpVmixClient to include host information
#[derive(Debug, Clone)]
pub struct VmixClientWrapper {
    client: HttpVmixClient,
    /// Plain HTTP client used for function calls, so the vMix error text can be
    /// read back instead of only the status code.
    http: reqwest::Client,
    host: String,
    port: u16,
}

impl VmixClientWrapper {
    pub fn new(host: &str, port: u16) -> Self {
        let client = HttpVmixClient::new_with_host_port(host, port, Duration::from_secs(10));
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default();
        Self {
            client,
            http,
            host: host.to_string(),
            port,
        }
    }

    pub async fn get_status(&self) -> Result<bool> {
        Ok(self.client.is_connected().await)
    }

    pub async fn get_active_input(&self) -> Result<i32> {
        let active = self.client.get_active_input().await?;
        Ok(active as i32)
    }

    pub async fn get_preview_input(&self) -> Result<i32> {
        let preview = self.client.get_preview_input().await?;
        Ok(preview as i32)
    }

    pub async fn send_function(
        &self,
        function_name: &str,
        params: &HashMap<String, String>,
    ) -> Result<()> {
        let params = normalize_function_params(function_name, params);

        app_log!(
            info,
            "Sending vMix function: {} to {} with params: {:?}",
            function_name,
            self.host(),
            params
        );

        let mut query: Vec<(&str, &str)> = Vec::with_capacity(params.len() + 1);
        query.push(("Function", function_name));
        for (key, value) in &params {
            query.push((key.as_str(), value.as_str()));
        }

        let response = self
            .http
            .get(format!("http://{}:{}/api", self.host, self.port))
            .query(&query)
            .send()
            .await?;

        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = body.trim();

        if !status.is_success() {
            app_log!(
                error,
                "vMix rejected function {} with HTTP {}: {}",
                function_name,
                status.as_u16(),
                detail
            );
            return Err(anyhow::anyhow!(
                "vMix API returned HTTP {}{}",
                status.as_u16(),
                if detail.is_empty() {
                    String::new()
                } else {
                    format!(": {}", detail)
                }
            ));
        }

        app_log!(
            info,
            "Successfully sent vMix function: {} to {}",
            function_name,
            self.host()
        );
        Ok(())
    }

    pub async fn get_vmix_data(&self) -> Result<VmixXml> {
        let vmix_state = self.client.get_xml_state().await?;
        // Convert vmix-rs Vmix struct to our VmixXml format
        Ok(VmixXml {
            version: vmix_state.version,
            edition: vmix_state.edition,
            preset: vmix_state.preset,
            inputs: Inputs {
                input: vmix_state
                    .inputs
                    .input
                    .into_iter()
                    .map(|input| Input {
                        key: input.key,
                        number: input.number.to_string(),
                        title: input.title.clone(),
                        short_title: Some(input.short_title),
                        input_type: Some(input.input_type),
                        state: Some(match input.state {
                            vmix_rs::models::State::Running => "Running".to_string(),
                            vmix_rs::models::State::Paused => "Paused".to_string(),
                            vmix_rs::models::State::Completed => "Completed".to_string(),
                        }),
                    })
                    .collect(),
            },
            active: Some(vmix_state.active),
            preview: Some(vmix_state.preview),
        })
    }

    // Get raw vmix-rs state for VideoList processing
    pub async fn get_raw_vmix_state(&self) -> Result<vmix_rs::models::Vmix> {
        self.client.get_xml_state().await
    }

    // Get raw XML string for debugging
    pub async fn get_raw_xml(&self) -> Result<String> {
        let url = format!("http://{}:{}/api", self.host, self.port);
        let response = reqwest::get(&url).await?;
        let xml_text = response.text().await?;
        Ok(xml_text)
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}

/// vMix parses `SetPosition` values as whole milliseconds and answers HTTP 500
/// for anything else, which is easy to hit because a frame is 1000/30 ms.
/// Round the numeric part here so no caller can send a fractional position.
fn normalize_function_params(
    function_name: &str,
    params: &HashMap<String, String>,
) -> HashMap<String, String> {
    let mut normalized = params.clone();

    if !MILLISECOND_FUNCTIONS
        .iter()
        .any(|name| name.eq_ignore_ascii_case(function_name))
    {
        return normalized;
    }

    let correction = normalized
        .get("Value")
        .and_then(|value| round_millis(value).map(|rounded| (value.clone(), rounded)))
        .filter(|(value, rounded)| value != rounded);

    if let Some((value, rounded)) = correction {
        app_log!(
            debug,
            "Rounded {} Value from {:?} to {:?} for vMix",
            function_name,
            value,
            rounded
        );
        normalized.insert("Value".to_string(), rounded);
    }

    normalized
}

/// Round a millisecond argument while keeping vMix's relative prefix
/// (`+=`, `-=`, `+`, `-`). Returns `None` when the value is not a number.
fn round_millis(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let (prefix, number) = split_sign(trimmed);
    let parsed = number.trim().parse::<f64>().ok()?;

    if !parsed.is_finite() {
        return None;
    }

    Some(format!("{}{}", prefix, parsed.round() as i64))
}

fn split_sign(value: &str) -> (&str, &str) {
    for prefix in ["+=", "-=", "+", "-"] {
        if let Some(rest) = value.strip_prefix(prefix) {
            return (prefix, rest);
        }
    }
    ("", value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn params(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    /// Serve one HTTP request so the client code sees a real response.
    /// Returns the port and a receiver for the raw request bytes.
    async fn spawn_mock_vmix(
        status: u16,
        reason: &'static str,
        body: &'static str,
    ) -> (u16, tokio::sync::oneshot::Receiver<String>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (tx, rx) = tokio::sync::oneshot::channel();

        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0u8; 8192];
            let read = socket.read(&mut buffer).await.unwrap_or(0);
            let request = String::from_utf8_lossy(&buffer[..read]).to_string();
            let _ = tx.send(request);

            let response = format!(
                "HTTP/1.1 {} {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                status,
                reason,
                body.len(),
                body
            );
            let _ = socket.write_all(response.as_bytes()).await;
            let _ = socket.shutdown().await;
        });

        (port, rx)
    }

    #[test]
    fn rounds_fractional_set_position_values() {
        let normalized = normalize_function_params(
            "SetPosition",
            &params(&[("Input", "abc"), ("Value", "20920.666666666668")]),
        );

        assert_eq!(normalized.get("Value").map(String::as_str), Some("20921"));
        assert_eq!(normalized.get("Input").map(String::as_str), Some("abc"));
    }

    #[test]
    fn keeps_relative_prefixes_when_rounding() {
        let plus = normalize_function_params("SetPosition", &params(&[("Value", "+=12.6")]));
        let minus = normalize_function_params("SetPosition", &params(&[("Value", "-=33.333")]));

        assert_eq!(plus.get("Value").map(String::as_str), Some("+=13"));
        assert_eq!(minus.get("Value").map(String::as_str), Some("-=33"));
    }

    #[test]
    fn leaves_integers_and_other_functions_untouched() {
        let integer = normalize_function_params("SetPosition", &params(&[("Value", "20954")]));
        let other = normalize_function_params("SetRate", &params(&[("Value", "0.25")]));
        let invalid = normalize_function_params("SetPosition", &params(&[("Value", "abc")]));

        assert_eq!(integer.get("Value").map(String::as_str), Some("20954"));
        assert_eq!(other.get("Value").map(String::as_str), Some("0.25"));
        assert_eq!(invalid.get("Value").map(String::as_str), Some("abc"));
    }

    #[tokio::test]
    async fn never_sends_a_fractional_position_over_http() {
        let (port, request) = spawn_mock_vmix(500, "Internal Server Error", "Invalid Value").await;
        let client = VmixClientWrapper::new("127.0.0.1", port);

        let error = client
            .send_function(
                "SetPosition",
                &params(&[("Input", "abc"), ("Value", "20920.666666666668")]),
            )
            .await
            .unwrap_err()
            .to_string();

        let request = request.await.unwrap();
        assert!(
            request.starts_with("GET /api?"),
            "unexpected request: {}",
            request
        );
        assert!(
            request.contains("Value=20921"),
            "rounded value missing from request: {}",
            request
        );
        assert!(
            !request.contains("20920.666"),
            "fractional value reached vMix: {}",
            request
        );
        // The vMix body is what explains a 500 to the user, so it must survive.
        assert!(
            error.contains("500"),
            "status missing from error: {}",
            error
        );
        assert!(
            error.contains("Invalid Value"),
            "body missing from error: {}",
            error
        );
    }

    #[tokio::test]
    async fn returns_ok_for_successful_function_calls() {
        let (port, _request) = spawn_mock_vmix(200, "OK", "OK").await;
        let client = VmixClientWrapper::new("127.0.0.1", port);

        client
            .send_function(
                "SetPosition",
                &params(&[("Input", "abc"), ("Value", "33.333")]),
            )
            .await
            .unwrap();
    }
}
