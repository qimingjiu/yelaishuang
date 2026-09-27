use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

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
    /// 非 2xx：把上游错误体整体带回，前端能展示具体原因（配额不足、内容审核等）
    HttpError { status: u16, body: String },
    Done { status: u16 },
    Error { message: String },
}

/// 进行中的流式请求 id 集合：cancel_stream 写入，转发循环发现后中止。
#[derive(Default)]
pub struct StreamCancels(Mutex<HashSet<String>>);

/// 共享 HTTP 客户端：复用连接池（避免每个请求重做 TLS 握手），并设连接超时。
fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .build()
            .expect("构建 HTTP 客户端失败")
    })
}

fn build_request(req: &ForwardRequest) -> Result<reqwest::RequestBuilder, String> {
    let method = reqwest::Method::from_bytes(
        req.method
            .clone()
            .unwrap_or_else(|| "GET".to_string())
            .as_bytes(),
    )
    .map_err(|e| format!("无效的 HTTP 方法: {e}"))?;

    let mut request = client().request(method, &req.url);
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

    // 非 2xx：没有可流式的内容，读完整错误体一次性回传
    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        let _ = on_event.send(StreamEvent::HttpError { status, body });
        let _ = on_event.send(StreamEvent::Done { status });
        return Ok(status);
    }

    let mut stream = response.bytes_stream();
    let mut pending: Vec<u8> = Vec::new();
    // 取消轮询与读 chunk 并行竞争：上游迟迟不吐下一段时，「停止」也能及时生效
    let mut cancel_tick = tokio::time::interval(Duration::from_millis(250));
    loop {
        tokio::select! {
            chunk = stream.next() => {
                match chunk {
                    Some(Ok(c)) => {
                        pending.extend_from_slice(&c);
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
                    Some(Err(e)) => {
                        let message = format!("读取响应流失败: {e}");
                        let _ = on_event.send(StreamEvent::Error { message: message.clone() });
                        return Err(message);
                    }
                    None => break,
                }
            }
            _ = cancel_tick.tick() => {
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
