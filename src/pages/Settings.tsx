import { useRef, useState, type ChangeEvent } from 'react';
import { bridgeFetch, isTauri } from '../lib/bridge';
import { loadSettings, saveSettings, type Settings } from '../lib/settings';
import { exportAll, importAll } from '../lib/store';
import { download } from '../lib/charcard';

export default function Settings() {
  const [form, setForm] = useState<Settings>(() => loadSettings());
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const backupRef = useRef<HTMLInputElement>(null);

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

  function onBackupFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file
      .text()
      .then((raw) => {
        if (!window.confirm('导入整包备份将覆盖当前全部本地数据（角色、身份、世界书、戏楼），确定继续？')) return;
        try {
          importAll(raw);
          setResult({ ok: true, text: '整包备份已恢复。' });
        } catch (err) {
          setResult({ ok: false, text: `恢复失败：${err instanceof Error ? err.message : String(err)}` });
        }
      })
      .catch(() => setResult({ ok: false, text: '读取备份文件失败。' }));
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
        <details className="advanced">
          <summary>高级参数（生成）</summary>
          <div className="editor-grid">
            <label className="field">
              <span>Temperature（0–2，越高越发散；对戏常用 0.7–1.0；留空 = 不发送）</span>
              <input
                type="number"
                step="0.05"
                min="0"
                max="2"
                value={form.temperature ?? ''}
                onChange={(e) => update('temperature', e.target.value === '' ? null : Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>max_tokens（留空 = 交给服务商默认）</span>
              <input
                type="number"
                min="1"
                value={form.maxTokens ?? ''}
                onChange={(e) => update('maxTokens', e.target.value ? Number(e.target.value) : null)}
                placeholder="（默认）"
              />
            </label>
          </div>
        </details>
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

      <div className="card">
        <h3>资料备份（整包）</h3>
        <p className="muted">
          角色、玩家身份、世界书、全部戏楼与设置说明一次导出为 JSON；恢复时整体覆盖本机数据。换设备或卸载前建议先备份。
        </p>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => download('yelaishuang-backup.json', exportAll())}>
            导出全部数据
          </button>
          <input ref={backupRef} type="file" accept=".json,application/json" onChange={onBackupFile} hidden />
          <button className="btn" onClick={() => backupRef.current?.click()}>
            恢复整包备份…
          </button>
        </div>
      </div>
    </section>
  );
}
