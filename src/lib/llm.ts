/**
 * BYOK 聊天客户端：OpenAI 兼容 /chat/completions，流式优先。
 * 网页端 fetch 直连（撞 CORS 时用仓库自带本地代理）；桌面端经 Rust 流式转发。
 */
import { isTauri } from './bridge';
import type { ChatMessage } from './context';

interface StreamChatOptions {
  url: string; // 完整 endpoint
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number | null;
  onDelta: (text: string) => void;
}

export interface StreamResult {
  status: number;
  fullText: string;
  interrupted: boolean;
}

export interface StreamHandle extends Promise<StreamResult> {
  cancel: () => void;
}

/** SSE 增量提取器：跨 chunk 拼行，吐出 delta 内容 */
class SseExtractor {
  private buf = '';
  private done = false;

  /** 返回本次新增的文本片段 */
  push(text: string): string[] {
    if (this.done) return [];
    this.buf += text;
    const deltas: string[] = [];
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).replace(/\r$/, '');
      this.buf = this.buf.slice(nl + 1);
      const d = this.handleLine(line);
      if (d) deltas.push(d);
    }
    return deltas;
  }

  /** 流结束：处理剩余缓冲（兼容非流式整包 JSON 响应） */
  flush(): string[] {
    if (this.done) return [];
    const rest = this.buf.trim();
    this.buf = '';
    if (!rest) return [];
    if (rest.startsWith('{')) {
      const d = this.handleJsonObject(rest);
      return d ? [d] : [];
    }
    const d = this.handleLine(rest);
    return d ? [d] : [];
  }

  private handleLine(line: string): string | null {
    if (!line.startsWith('data:')) return null;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') {
      if (payload === '[DONE]') this.done = true;
      return null;
    }
    if (payload.startsWith('{')) return this.handleJsonObject(payload);
    return null;
  }

  private handleJsonObject(json: string): string | null {
    try {
      const obj = JSON.parse(json) as {
        choices?: { delta?: { content?: unknown }; message?: { content?: unknown } }[];
      };
      const choice = obj.choices?.[0];
      const raw = choice?.delta?.content ?? choice?.message?.content;
      return typeof raw === 'string' ? raw : null;
    } catch {
      return null;
    }
  }
}

function endpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

export function requestHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

export function requestBody(o: Pick<StreamChatOptions, 'model' | 'messages' | 'temperature' | 'maxTokens'>): string {
  return JSON.stringify({
    model: o.model,
    messages: o.messages,
    stream: true,
    ...(typeof o.temperature === 'number' ? { temperature: o.temperature } : {}),
    ...(o.maxTokens && o.maxTokens > 0 ? { max_tokens: o.maxTokens } : {}),
  });
}

function friendlyNetError(err: unknown, url: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (isTauri()) return new Error(`请求失败：${msg}`);
  const corsHint = `网页端直连模型 API 可能撞 CORS 墙——可用桌面端，或运行 npm run proxy 后把 API Base URL 指向 http://127.0.0.1:38887/?target=<URL编码的上游地址>（当前请求 ${url}）`;
  return /failed to fetch|networkerror|load failed/i.test(msg) ? new Error(corsHint) : new Error(`请求失败：${msg}`);
}

async function readStatus(res: { status: number; body: string }): Promise<never> {
  const excerpt = res.body.slice(0, 300) || '（无响应体）';
  if (res.status === 401) throw new Error(`HTTP 401：API Key 无效或未授权 —— ${excerpt}`);
  if (res.status === 404) throw new Error(`HTTP 404：接口路径不对，检查 API Base URL —— ${excerpt}`);
  throw new Error(`HTTP ${res.status} —— ${excerpt}`);
}

/** 发起一轮流式对话；cancel() 随时中止（中止后返回已收到的部分，interrupted = true） */
export function streamChat(o: StreamChatOptions): StreamHandle {
  const url = endpoint(o.url);
  const headers = requestHeaders(o.apiKey);
  const body = requestBody(o);
  const extractor = new SseExtractor();

  let fullText = '';
  let status = 0;
  let interrupted = false;
  let cancelImpl: () => void = () => {};

  const emit = (deltas: string[]) => {
    for (const d of deltas) {
      fullText += d;
      o.onDelta(d);
    }
  };

  const promise = (async (): Promise<StreamResult> => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const { Channel } = await import('@tauri-apps/api/core');
      const id = `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      type Event =
        | { type: 'delta'; text: string }
        | { type: 'done'; status: number }
        | { type: 'error'; message: string };
      const channel = new Channel<Event>();
      let streamError: string | null = null;
      channel.onmessage = (msg) => {
        if (msg.type === 'delta') emit(extractor.push(msg.text));
        else if (msg.type === 'error') streamError = msg.message;
      };
      cancelImpl = () => {
        interrupted = true;
        void invoke('cancel_stream', { id });
      };
      try {
        status = (await invoke<number>('http_forward_stream', {
          id,
          req: { url, method: 'POST', headers, body },
          onEvent: channel,
        })) as number;
      } catch (err) {
        if (interrupted || fullText) {
          emit(extractor.flush());
          return { status: 0, fullText, interrupted: true };
        }
        throw friendlyNetError(err, url);
      }
      emit(extractor.flush());
      if (streamError) {
        if (fullText) return { status: 0, fullText, interrupted: true };
        throw new Error(streamError);
      }
      if (status !== 200) await readStatus({ status, body: '' });
      return { status, fullText, interrupted };
    }

    // 网页端：fetch 流式读取
    const controller = new AbortController();
    cancelImpl = () => {
      interrupted = true;
      controller.abort();
    };
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    } catch (err) {
      if (interrupted) return { status: 0, fullText, interrupted: true };
      throw friendlyNetError(err, url);
    }
    status = res.status;
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      await readStatus({ status: res.status, body: text });
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        emit(extractor.push(decoder.decode(value, { stream: true })));
      }
      emit(extractor.push(decoder.decode()));
      emit(extractor.flush());
    } catch (err) {
      if (!interrupted) throw friendlyNetError(err, url);
      emit(extractor.flush());
    }
    return { status, fullText, interrupted };
  })();

  const handle = promise as StreamHandle;
  handle.cancel = () => cancelImpl();
  return handle;
}
