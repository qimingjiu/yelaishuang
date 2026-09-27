/**
 * 本地冒烟测试用 mock：模拟 OpenAI 兼容接口（GET /v1/models + POST /v1/chat/completions 流式）。
 * 用法：node tools/mock-llm.mjs [端口]（默认 38999）
 * 回复会把收到的最后一条用户消息回显，便于验证上下文组装是否正确。
 */
import http from 'node:http';

const port = Number(process.argv[2]) || 38999;

const REPLY = (lastUser) =>
  `雪压着檐角，更漏声里，他抬眼打量来人。\n\n「${lastUser}——」他把这三个字在舌尖滚了一遍，忽而笑了，「好，我便信你这一句。」\n\n炭盆里的火苗矮下去，他伸手拨了拨，屋外风声正紧。（回显收到：${lastUser}）`;

const server = http.createServer((req, res) => {
  // CORS：允许网页端直连测试
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url?.endsWith('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'mock-gufeng' }, { id: 'mock-shusheng' }] }));
    return;
  }

  if (req.method === 'POST' && req.url?.endsWith('/chat/completions')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let lastUser = '（无用户消息）';
      let temperature = null;
      try {
        const parsed = JSON.parse(body);
        const users = (parsed.messages ?? []).filter((m) => m.role === 'user');
        if (users.length) lastUser = users[users.length - 1].content.split('\n').pop();
        temperature = parsed.temperature ?? null;
      } catch {
        /* ignore */
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const full = REPLY(String(lastUser)) + (temperature !== null ? `\n（temperature=${temperature}）` : '');
      // 故意按字节切，把汉字切成两半，验证前端跨 chunk 的 UTF-8/SSE 解析
      const bytes = Buffer.from(full, 'utf8');
      const cuts = [0, 9, 17, 40, 88, 130, bytes.length];
      let i = 0;
      const tick = () => {
        if (i >= cuts.length - 1) {
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        const piece = bytes.subarray(cuts[i], cuts[i + 1]);
        i += 1;
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece.toString('utf8') } }] })}\n\n`);
        setTimeout(tick, 50);
      };
      tick();
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'mock: not found' } }));
});

server.listen(port, '127.0.0.1', () => console.log(`mock-llm listening on http://127.0.0.1:${port}/v1`));
