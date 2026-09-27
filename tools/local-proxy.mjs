#!/usr/bin/env node
// 夜来霜 · 本地小代理（网页版可选）
// 用途：网页端直连模型 API 会撞 CORS 墙（部分供应商禁止网页跨域调用）时，用本代理中转。
// 启动：npm run proxy（默认 http://127.0.0.1:38887，可用 PORT 环境变量改端口）
// 用法：把上游地址 URL 编码后作为 ?target= 参数传入，例如
//   http://127.0.0.1:8787/?target=https%3A%2F%2Fapi.openai.com%2Fv1%2Fmodels
import http from 'node:http';

const PORT = Number(process.env.PORT || 38887);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

const STRIP_REQUEST = new Set([
  'host', 'origin', 'referer', 'connection', 'keep-alive',
  'transfer-encoding', 'upgrade', 'content-length', 'accept-encoding',
]);

const STRIP_RESPONSE = new Set([
  'content-encoding', 'content-length', 'transfer-encoding',
]);

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const target = url.searchParams.get('target');

  if (!target) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', ...CORS });
    res.end(
      JSON.stringify({
        ok: true,
        name: 'yelaishuang-local-proxy',
        usage: '/?target=<url-encoded upstream url>',
      }),
    );
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    res.writeHead(400, CORS);
    res.end('invalid ?target=');
    return;
  }
  if (targetUrl.protocol !== 'https:' && targetUrl.protocol !== 'http:') {
    res.writeHead(400, CORS);
    res.end('target protocol must be http(s)');
    return;
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!STRIP_REQUEST.has(k.toLowerCase()) && v != null) headers[k] = v;
  }
  headers['user-agent'] ??= 'yelaishuang-local-proxy/0.1';

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(120_000),
    });
    const out = { ...CORS };
    upstream.headers.forEach((v, k) => {
      if (!STRIP_RESPONSE.has(k.toLowerCase()) && !k.toLowerCase().startsWith('access-control-')) {
        out[k] = v;
      }
    });
    res.writeHead(upstream.status, out);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8', ...CORS });
    res.end(`上游请求失败: ${err instanceof Error ? err.message : String(err)}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`夜来霜本地代理已启动: http://127.0.0.1:${PORT}`);
  console.log('用法: 把上游地址 URL 编码后作为 ?target= 参数传入');
});
