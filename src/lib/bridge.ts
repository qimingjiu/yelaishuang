export interface BridgeResponse {
  status: number;
  ok: boolean;
  body: string;
}

export interface ForwardInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * 模型 API 请求统一走这里：桌面端经 Rust 层转发（绕开 CORS）；
 * 网页端直连——可能撞 CORS 墙，此时需启动仓库自带的本地代理：npm run proxy
 */
export async function bridgeFetch(url: string, init: ForwardInit = {}): Promise<BridgeResponse> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<BridgeResponse>('http_forward', {
      req: {
        url,
        method: init.method ?? 'GET',
        headers: init.headers ?? null,
        body: init.body ?? null,
      },
    });
  }
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: init.headers,
    body: init.body ?? undefined,
  });
  return { status: res.status, ok: res.ok, body: await res.text() };
}
