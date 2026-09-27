import { useState } from 'react';
import { bridgeFetch, isTauri } from '../lib/bridge';
import { loadSettings, saveSettings, type Settings } from '../lib/settings';

export default function Settings() {
  const [form, setForm] = useState<Settings>(() => loadSettings());
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSave() {
    saveSettings(form);
    setResult({ ok: true, text: '已保存到本机。' });
  }

  async function onTest() {
    saveSettings(form);
    setTesting(true);
    setResult(null);
    const base = form.baseUrl.replace(/\/+$/, '');
    try {
      const res = await bridgeFetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${form.apiKey}` },
      });
      if (res.ok) {
        let count = '?';
        try {
          const data = (JSON.parse(res.body) as { data?: unknown[] }).data;
          if (Array.isArray(data)) count = String(data.length);
        } catch {
          // 响应体不是预期 JSON 时保留 '?'
        }
        setResult({ ok: true, text: `连接成功（HTTP ${res.status}），可用模型 ${count} 个。` });
      } else {
        setResult({
          ok: false,
          text: `连接失败：HTTP ${res.status} —— ${res.body.slice(0, 300) || '（无响应体）'}`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({
        ok: false,
        text: isTauri()
          ? `请求失败：${msg}`
          : `请求失败：${msg}。网页端直连模型 API 可能撞 CORS 墙——请先用桌面端测试，或启动仓库自带的本地代理：npm run proxy`,
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="page">
      <h2>设置</h2>
      <div className="card">
        <h3>模型连接（BYOK）</h3>
        <p className="muted">
          API Key 与所有数据只保存在本机，不上传、不经过任何服务器。桌面端请求经 Rust 层转发；
          网页端直连（受 CORS 限制，可用 <code>npm run proxy</code> 启动本地代理后把 Base URL 指向 <code>http://127.0.0.1:38887/?target=&lt;上游地址&gt;</code>）。
        </p>
        <label className="field">
          <span>API Base URL</span>
          <input
            value={form.baseUrl}
            onChange={(e) => update('baseUrl', e.target.value)}
            placeholder="https://api.openai.com/v1"
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span>API Key</span>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => update('apiKey', e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span>模型名称</span>
          <input
            value={form.model}
            onChange={(e) => update('model', e.target.value)}
            placeholder="gpt-4o-mini"
            spellCheck={false}
          />
        </label>
        <div className="btn-row">
          <button className="btn" onClick={onSave}>
            保存
          </button>
          <button className="btn primary" onClick={onTest} disabled={testing || !form.apiKey}>
            {testing ? '测试中…' : '测试连接（GET /models）'}
          </button>
        </div>
        {result && <p className={result.ok ? 'ok' : 'error'}>{result.text}</p>}
      </div>
    </section>
  );
}
