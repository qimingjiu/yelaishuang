use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::State;

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

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum StreamEvent {
    Delta { text: String },
    Done { status: u16 },
    Error { message: String },
}

/// 进行中的流式请求 id 集合：cancel_stream 写入，转发循环发现后中止。
#[derive(Default)]
pub struct StreamCancels(Mutex<HashSet<String>>);

fn build_request(req: &ForwardRequest) -> Result<reqwest::RequestBuilder, String> {
    let method = reqwest::Method::from_bytes(
        req.method
            .clone()
            .unwrap_or_else(|| "GET".to_string())
            .as_bytes(),
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
    Ok(request)
}

fn send_error_message(e: impl std::fmt::Display) -> String {
    if e.to_string().contains("timed out") {
        format!("请求超时: {e}")
    } else {
        format!("请求失败: {e}")
    }
}

/// 模型 API 转发：网页直连各家模型服务会撞 CORS 墙（部分供应商禁止网页跨域调用），
/// 桌面端统一由 Rust 层发起请求，绕开浏览器跨域限制。
#[tauri::command]
async fn http_forward(req: ForwardRequest) -> Result<ForwardResponse, String> {
    let request = build_request(&req)?;
    let response = request.send().await.map_err(send_error_message)?;

    let status = response.status().as_u16();
    let ok = response.status().is_success();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;

    Ok(ForwardResponse { status, ok, body })
}

/// 流式转发：增量经 Channel 回传前端（对戏流式回复、可随时中止）。
/// 每次只回传完整 UTF-8 前缀，避免多字节汉字被 chunk 边界截断。
#[tauri::command]
async fn http_forward_stream(
    id: String,
    req: ForwardRequest,
    on_event: Channel<StreamEvent>,
    cancels: State<'_, StreamCancels>,
) -> Result<u16, String> {
    let request = build_request(&req)?;
    let response = request.send().await.map_err(send_error_message)?;
    let status = response.status().as_u16();

    let mut stream = response.bytes_stream();
    let mut pending: Vec<u8> = Vec::new();
    loop {
        let cancelled = {
            let set = cancels
                .0
                .lock()
                .map_err(|_| "流状态锁不可用".to_string())?;
            set.contains(&id)
        };
        if cancelled {
            break;
        }
        let chunk = match stream.next().await {
            Some(Ok(c)) => c,
            Some(Err(e)) => {
                let message = format!("读取响应流失败: {e}");
                let _ = on_event.send(StreamEvent::Error { message: message.clone() });
                return Err(message);
            }
            None => break,
        };
        pending.extend_from_slice(&chunk);
        let valid = match std::str::from_utf8(&pending) {
            Ok(_) => pending.len(),
            Err(e) => e.valid_up_to(),
        };
        if valid > 0 {
            let text = String::from_utf8_lossy(&pending[..valid]).into_owned();
            pending.drain(..valid);
            if !text.is_empty() {
                on_event
                    .send(StreamEvent::Delta { text })
                    .map_err(|e| format!("回传流数据失败: {e}"))?;
            }
        }
    }

    if !pending.is_empty() {
        let text = String::from_utf8_lossy(&pending).into_owned();
        let _ = on_event.send(StreamEvent::Delta { text });
    }
    let _ = cancels.0.lock().map_err(|_| "流状态锁不可用")?.remove(&id);
    let _ = on_event.send(StreamEvent::Done { status });
    Ok(status)
}

#[tauri::command]
fn cancel_stream(id: String, cancels: State<'_, StreamCancels>) -> Result<(), String> {
    cancels
        .0
        .lock()
        .map_err(|_| "流状态锁不可用")?
        .insert(id);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(StreamCancels::default())
        .invoke_handler(tauri::generate_handler![
            http_forward,
            http_forward_stream,
            cancel_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
