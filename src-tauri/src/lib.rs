use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct ForwardRequest {
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
}

#[derive(Serialize)]
pub struct ForwardResponse {
    status: u16,
    ok: bool,
    body: String,
}

/// 模型 API 转发：网页直连各家模型服务会撞 CORS 墙（部分供应商禁止网页跨域调用），
/// 桌面端统一由 Rust 层发起请求，绕开浏览器跨域限制。
#[tauri::command]
async fn http_forward(req: ForwardRequest) -> Result<ForwardResponse, String> {
    let method = reqwest::Method::from_bytes(
        req.method.unwrap_or_else(|| "GET".to_string()).as_bytes(),
    )
    .map_err(|e| format!("无效的 HTTP 方法: {e}"))?;

    let client = reqwest::Client::new();
    let mut request = client.request(method, &req.url);
    if let Some(headers) = &req.headers {
        for (key, value) in headers {
            request = request.header(key, value);
        }
    }
    if let Some(body) = &req.body {
        request = request.body(body.clone());
    }

    let response = request.send().await.map_err(|e| {
        if e.is_connect() {
            format!("无法连接到上游（网络或代理问题）: {e}")
        } else if e.is_timeout() {
            format!("请求超时: {e}")
        } else {
            format!("请求失败: {e}")
        }
    })?;

    let status = response.status().as_u16();
    let ok = response.status().is_success();
    let body = response.text().await.map_err(|e| format!("读取响应失败: {e}"))?;

    Ok(ForwardResponse { status, ok, body })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![http_forward])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
