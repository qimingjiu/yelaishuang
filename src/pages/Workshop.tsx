import { useRef, useState, type ChangeEvent } from 'react';
import type { Character, Persona, Worldbook, WorldbookEntry } from '../lib/types';
import { deleteCharacter, deletePersona, deleteWorldbook, uid, upsertCharacter, upsertPersona, upsertWorldbook, useAppData } from '../lib/store';
import { download, parseCardFile, toCardV2Json } from '../lib/charcard';

/* 永久 token 粗查：中文约 0.6–0.7 token/字，2000 token ≈ 3000 字上下，此处按字符数预警 */
function warnPermanent(c: Character): string | null {
  const chars = c.description.length + c.personality.length + c.scenario.length;
  if (chars > 3600) return `永久字段合计 ${chars} 字，约 ${Math.round(chars / 1.5)} token——超过 2000 token 红线，建议精简`;
  return null;
}

function newCharacter(): Character {
  const now = Date.now();
  return {
    id: '',
    name: '',
    description: '',
    personality: '',
    scenario: '',
    firstMes: '',
    mesExample: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    creator: '',
    creatorNotes: '',
    tags: [],
    builtin: false,
    createdAt: now,
    updatedAt: now,
  };
}

/* ============ 角色编辑器 ============ */

function CharacterEditor({ card, onClose }: { card: Character; onClose: () => void }) {
  const [form, setForm] = useState<Character>({ ...card });
  const set = <K extends keyof Character>(k: K, v: Character[K]) => setForm((f) => ({ ...f, [k]: v }));
  const warn = form.name ? warnPermanent(form) : null;

  function save() {
    if (!form.name.trim()) return;
    upsertCharacter({ ...form, name: form.name.trim() });
    onClose();
  }

  return (
    <div className="editor">
      <div className="editor-head">
        <h3>{card.id ? `编辑 · ${card.name}` : '新建角色'}</h3>
        <span className="spacer" />
        <button className="btn slim" onClick={save} disabled={!form.name.trim()}>
          保存
        </button>
        <button className="btn slim" onClick={onClose}>
          收起
        </button>
      </div>
      {card.id && card.builtin && <p className="muted">这是随仓库发布的内容卡，修改将另存为你的副本。</p>}
      {warn && <p className="error">{warn}</p>}
      <div className="editor-grid">
        <label className="field">
          <span>名字（同时是 {'{{char}}'} 宏展开值）</span>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} spellCheck={false} />
        </label>
        <label className="field">
          <span>标签（逗号分隔，不进提示词）</span>
          <input value={form.tags.join(', ')} onChange={(e) => set('tags', e.target.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean))} spellCheck={false} />
        </label>
        <label className="field">
          <span>作者</span>
          <input value={form.creator} onChange={(e) => set('creator', e.target.value)} spellCheck={false} />
        </label>
      </div>
      <label className="field">
        <span>描述 —— 主定义：身份、外貌、经历、动机、能力与限制（每轮注入，越精炼越好）</span>
        <textarea rows={8} value={form.description} onChange={(e) => set('description', e.target.value)} />
      </label>
      <label className="field">
        <span>性格 —— 精炼性格与冲突，不重复描述</span>
        <textarea rows={4} value={form.personality} onChange={(e) => set('personality', e.target.value)} />
      </label>
      <label className="field">
        <span>情境 —— 只写「永久为真」的设定，不写每天变化的位置伤势</span>
        <textarea rows={3} value={form.scenario} onChange={(e) => set('scenario', e.target.value)} />
      </label>
      <label className="field">
        <span>开场白 —— 模型从这里学文风与篇幅最多；给玩家留回应空间</span>
        <textarea rows={6} value={form.firstMes} onChange={(e) => set('firstMes', e.target.value)} />
      </label>
      <label className="field">
        <span>示例对话 —— {'<START>'} 分隔，锁声线防漂移；至少含一次冷场/拒绝示例</span>
        <textarea rows={5} value={form.mesExample} onChange={(e) => set('mesExample', e.target.value)} />
      </label>
      <div className="editor-grid">
        <label className="field">
          <span>系统提示（非空则替换全局规则；{'{{original}}'} 指代被替换的全局规则）</span>
          <textarea rows={3} value={form.systemPrompt} onChange={(e) => set('systemPrompt', e.target.value)} />
        </label>
        <label className="field">
          <span>收束指令（置于对话最末，权重最高，如「不代写用户言行」）</span>
          <textarea rows={3} value={form.postHistoryInstructions} onChange={(e) => set('postHistoryInstructions', e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>作者附注 —— 仅供使用者阅读，不进提示词</span>
        <textarea rows={2} value={form.creatorNotes} onChange={(e) => set('creatorNotes', e.target.value)} />
      </label>
      <div className="btn-row">
        <button className="btn primary" onClick={save} disabled={!form.name.trim()}>
          保存
        </button>
        {card.id && (
          <>
            <button className="btn" onClick={() => download(`${form.name}.card.v2.json`, toCardV2Json(form))}>
              导出 V2 JSON
            </button>
            <button
              className="btn"
              onClick={() => {
                if (window.confirm(`删除角色「${card.name}」？已有戏楼不受影响，但无法再从中生成。`)) {
                  deleteCharacter(card.id);
                  onClose();
                }
              }}
            >
              删除
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ============ 角色库 ============ */

function CharactersTab() {
  const data = useAppData();
  const [editing, setEditing] = useState<Character | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const { card, spec } = await parseCardFile(file);
      upsertCharacter(card);
      setEditing(card);
      if (spec) setError(`${spec} 导入成功`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    }
  }

  const list = [...data.characters].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div>
      <div className="tab-actions">
        <button className="btn primary" onClick={() => setEditing(newCharacter())}>
          新建角色
        </button>
        <input ref={fileRef} type="file" accept=".json,.png,application/json,image/png" onChange={onFile} hidden />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          导入角色卡（V2 JSON / PNG）
        </button>
      </div>
      {error && <p className={error.endsWith('成功') ? 'ok' : 'error'}>{error}</p>}
      {editing && <CharacterEditor card={editing} onClose={() => setEditing(null)} />}
      <ul className="lib-list">
        {list.map((c) => (
          <li key={c.id}>
            <button className="lib-item" onClick={() => setEditing({ ...c })}>
              <strong>{c.name}</strong>
              <span className="muted">
                {c.builtin ? '内置 · ' : ''}
                {c.creator || '佚名'}
                {c.tags.length ? ` · ${c.tags.join(' / ')}` : ''}
              </span>
            </button>
            <button className="icon-btn" title="导出 V2 JSON" onClick={() => download(`${c.name}.card.v2.json`, toCardV2Json(c))}>
              ↓
            </button>
          </li>
        ))}
        {list.length === 0 && <p className="muted">还没有角色。可导入仓库 cards/ 下的初始卡，或新建。</p>}
      </ul>
    </div>
  );
}

/* ============ 玩家身份 ============ */

function PersonasTab() {
  const data = useAppData();
  const [editing, setEditing] = useState<Persona | null>(null);

  return (
    <div>
      <div className="tab-actions">
        <button
          className="btn primary"
          onClick={() =>
            setEditing({ id: '', name: '', description: '', builtin: false, createdAt: Date.now(), updatedAt: Date.now() })
          }
        >
          新建身份
        </button>
      </div>
      {editing && (
        <div className="editor">
          <div className="editor-head">
            <h3>{editing.id ? `编辑 · ${editing.name}` : '新建玩家身份'}</h3>
            <span className="spacer" />
            <button className="btn slim" onClick={() => setEditing(null)}>
              收起
            </button>
          </div>
          <label className="field">
            <span>名号</span>
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="如：落魄书生"
            />
          </label>
          <label className="field">
            <span>这局里我是谁（出身、来历、随身之物、目的）</span>
            <textarea
              rows={4}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="初到上都的外乡修士，囊中羞涩，身上有一封荐书，想查一位故人的下落"
            />
          </label>
          <div className="btn-row">
            <button
              className="btn primary"
              disabled={!editing.name.trim()}
              onClick={() => {
                upsertPersona({ ...editing, name: editing.name.trim() });
                setEditing(null);
              }}
            >
              保存
            </button>
          </div>
        </div>
      )}
      <ul className="lib-list">
        {[...data.personas].sort((a, b) => b.updatedAt - a.updatedAt).map((p) => (
          <li key={p.id}>
            <button className="lib-item" onClick={() => setEditing({ ...p })}>
              <strong>{p.name}</strong>
              <span className="muted">{p.description || '（无描述）'}</span>
            </button>
            <button
              className="icon-btn"
              title="删除"
              onClick={() => {
                if (window.confirm(`删除身份「${p.name}」？`)) deletePersona(p.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============ 世界书 ============ */

function newEntry(): WorldbookEntry {
  return { id: uid(), comment: '', keys: [], content: '', constant: false, enabled: true, insertionOrder: 100 };
}

function WorldbookEditor({ book, onClose }: { book: Worldbook; onClose: () => void }) {
  const [form, setForm] = useState<Worldbook>({ ...book });
  const setEntry = (i: number, patch: Partial<WorldbookEntry>) =>
    setForm((f) => ({ ...f, entries: f.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));

  function save() {
    if (!form.name.trim()) return;
    upsertWorldbook({ ...form, name: form.name.trim() });
    onClose();
  }

  return (
    <div className="editor">
      <div className="editor-head">
        <h3>{book.id ? `编辑 · ${book.name}` : '新建世界书'}</h3>
        <span className="spacer" />
        <button className="btn slim" onClick={save} disabled={!form.name.trim()}>
          保存
        </button>
        <button className="btn slim" onClick={onClose}>
          收起
        </button>
      </div>
      <div className="editor-grid">
        <label className="field">
          <span>世界书名</span>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label className="field">
          <span>出处（改编来源等，仅展示）</span>
          <input value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
        </label>
      </div>
      <p className="muted">
        条目内容必须自包含；关键词命中即注入（中文不做整词匹配，记得收录名、字、职衔等别称）；勾「恒注入」则每轮必带。
      </p>
      {form.entries.map((e, i) => (
        <div className="wb-entry" key={e.id}>
          <div className="wb-entry-row">
            <input
              className="wb-comment"
              value={e.comment}
              placeholder="条目名"
              onChange={(ev) => setEntry(i, { comment: ev.target.value })}
            />
            <input
              className="wb-keys"
              value={e.keys.join(', ')}
              placeholder="触发词，逗号分隔"
              onChange={(ev) => setEntry(i, { keys: ev.target.value.split(/[,，]/).map((k) => k.trim()).filter(Boolean) })}
            />
            <input
              className="wb-order"
              type="number"
              value={e.insertionOrder}
              title="插入顺序，小 = 靠前"
              onChange={(ev) => setEntry(i, { insertionOrder: Number(ev.target.value) || 0 })}
            />
            <button className="icon-btn" title="删除条目" onClick={() => setForm((f) => ({ ...f, entries: f.entries.filter((_, j) => j !== i) }))}>
              ×
            </button>
          </div>
          <textarea
            rows={3}
            value={e.content}
            placeholder="条目内容（自包含的一段设定）"
            onChange={(ev) => setEntry(i, { content: ev.target.value })}
          />
          <div className="wb-entry-row checks">
            <label className="check">
              <input type="checkbox" checked={e.constant} onChange={(ev) => setEntry(i, { constant: ev.target.checked })} />
              恒注入
            </label>
            <label className="check">
              <input type="checkbox" checked={e.enabled} onChange={(ev) => setEntry(i, { enabled: ev.target.checked })} />
              启用
            </label>
          </div>
        </div>
      ))}
      <div className="btn-row">
        <button className="btn" onClick={() => setForm((f) => ({ ...f, entries: [...f.entries, newEntry()] }))}>
          加一条
        </button>
        <button className="btn primary" onClick={save} disabled={!form.name.trim()}>
          保存
        </button>
        {book.id && (
          <>
            <button
              className="btn"
              onClick={() =>
                download(
                  `${form.name}.worldbook.json`,
                  JSON.stringify(
                    {
                      format: 'yfs-worldbook-v1',
                      name: form.name,
                      version: '1.0',
                      source: form.source,
                      entries: form.entries.map((e) => ({
                        comment: e.comment,
                        keys: e.keys,
                        secondary_keys: [],
                        constant: e.constant,
                        selective: false,
                        enabled: e.enabled,
                        insertion_order: e.insertionOrder,
                        position: 'before_char',
                        content: e.content,
                      })),
                    },
                    null,
                    2,
                  ),
                )
              }
            >
              导出 JSON
            </button>
            <button
              className="btn"
              onClick={() => {
                if (window.confirm(`删除世界书「${book.name}」？已有戏楼的绑定会一并失效。`)) {
                  deleteWorldbook(book.id);
                  onClose();
                }
              }}
            >
              删除
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function WorldbooksTab() {
  const data = useAppData();
  const [editing, setEditing] = useState<Worldbook | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const wb = JSON.parse(await file.text()) as {
        name?: string;
        source?: string;
        entries?: { comment?: string; keys?: string[]; content?: string; constant?: boolean; enabled?: boolean; insertion_order?: number }[];
      };
      const now = Date.now();
      const book: Worldbook = {
        id: uid(),
        name: wb.name?.trim() || '导入的世界书',
        source: wb.source ?? '',
        entries: (wb.entries ?? []).map((en, i) => ({
          id: uid(),
          comment: en.comment ?? `条目 ${i + 1}`,
          keys: Array.isArray(en.keys) ? en.keys : [],
          content: en.content ?? '',
          constant: en.constant === true,
          enabled: en.enabled !== false,
          insertionOrder: typeof en.insertion_order === 'number' ? en.insertion_order : 100,
        })),
        createdAt: now,
        updatedAt: now,
      };
      upsertWorldbook(book);
      setEditing(book);
      setError(`导入成功：${book.entries.length} 条`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败：不是有效的世界书 JSON');
    }
  }

  return (
    <div>
      <div className="tab-actions">
        <button
          className="btn primary"
          onClick={() =>
            setEditing({ id: '', name: '', source: '', entries: [newEntry()], createdAt: Date.now(), updatedAt: Date.now() })
          }
        >
          新建世界书
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} hidden />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          导入世界书 JSON
        </button>
      </div>
      {error && <p className="ok">{error}</p>}
      {editing && <WorldbookEditor book={editing} onClose={() => setEditing(null)} />}
      <ul className="lib-list">
        {[...data.worldbooks].sort((a, b) => b.updatedAt - a.updatedAt).map((w) => (
          <li key={w.id}>
            <button className="lib-item" onClick={() => setEditing({ ...w })}>
              <strong>{w.name}</strong>
              <span className="muted">
                {w.entries.length} 条{w.source ? ` · ${w.source}` : ''}
              </span>
            </button>
            <button
              className="icon-btn"
              title="删除"
              onClick={() => {
                if (window.confirm(`删除世界书「${w.name}」？`)) deleteWorldbook(w.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============ 工坊主页面 ============ */

type Tab = '角色' | '玩家身份' | '世界书';

export default function Workshop() {
  const [tab, setTab] = useState<Tab>('角色');
  return (
    <section className="page">
      <h2>人设工坊</h2>
      <div className="tab-bar">
        {(['角色', '玩家身份', '世界书'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <p className="muted">
        角色卡以 Character Card V2 为基线（JSON / PNG 嵌入导入，V1 自动识别）；导出 V2 JSON。所有数据只存在本机。
      </p>
      {tab === '角色' && <CharactersTab />}
      {tab === '玩家身份' && <PersonasTab />}
      {tab === '世界书' && <WorldbooksTab />}
    </section>
  );
}
