import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Character, Floor, Persona, Story, Worldbook } from '../lib/types';
import {
  appendFloor,
  branchStory,
  createStory,
  deleteFloor,
  deleteStory,
  getData,
  getLastStoryId,
  setLastStoryId,
  uid,
  updateFloor,
  updateStory,
  upsertPersona,
  useAppData,
} from '../lib/store';
import { loadSettings } from '../lib/settings';
import { buildMessages, defaultStyle, expandMacros, floorName, styleInstruction } from '../lib/context';
import { streamChat, type StreamHandle } from '../lib/llm';
import { download } from '../lib/charcard';
import { recordUsage } from '../lib/usage';
import CharacterThumb from '../components/CharacterThumb';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ============ 开局 ============ */

function StartPanel({
  characters,
  personas,
  worldbooks,
  onStart,
}: {
  characters: Character[];
  personas: Persona[];
  worldbooks: Worldbook[];
  onStart: (story: Story) => void;
}) {
  const [charId, setCharId] = useState('');
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? '');
  const [newPersona, setNewPersona] = useState({ name: '', description: '' });
  const [useNewPersona, setUseNewPersona] = useState(personas.length === 0);
  const [wbIds, setWbIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');

  function toggleWb(id: string) {
    setWbIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function begin() {
    const char = characters.find((c) => c.id === charId);
    if (!char) return;
    const persona = personas.find((p) => p.id === personaId) ?? null;
    const now = Date.now();
    const story: Story = {
      id: uid(),
      title: title.trim() || `与${char.name}对戏`,
      characterId: char.id,
      characterName: char.name,
      personaId: persona?.id ?? '',
      personaName: persona?.name ?? '旅人',
      worldbookIds: wbIds,
      floors: char.firstMes.trim()
        ? [
            {
              id: uid(),
              role: 'assistant',
              name: char.name,
              content: expandMacros(char.firstMes.trim(), char.name, persona?.name ?? '旅人'),
              time: now,
            },
          ]
        : [],
      keyFacts: [],
      summary: '',
      state: { time: '', place: '', present: char.name, goal: '', extras: '' },
      createdAt: now,
      updatedAt: now,
    };
    // 快速新建身份：直接入库并绑定
    if (useNewPersona && newPersona.name.trim()) {
      const p: Persona = {
        id: uid(),
        name: newPersona.name.trim(),
        description: newPersona.description.trim(),
        builtin: false,
        createdAt: now,
        updatedAt: now,
      };
      upsertPersona(p);
      story.personaId = p.id;
      story.personaName = p.name;
    }
    onStart(story);
  }

  return (
    <div className="start">
      <div className="card">
        <h3>开局 · 择角</h3>
        <p className="muted">选一位角色（或一个说书人剧本），带上一份玩家身份，即可开戏。</p>
        <div className="pick-grid">
          {characters.map((c) => (
            <button
              key={c.id}
              className={`pick ${charId === c.id ? 'active' : ''}`}
              onClick={() => setCharId(c.id)}
              title={c.creatorNotes || c.creator}
            >
              <CharacterThumb name={c.name} avatar={c.avatar} size="pick" />
              <span className="pick-text">
                <strong>{c.name}</strong>
                {c.tags.length > 0 && <span className="pick-tags">{c.tags.slice(0, 3).join(' · ')}</span>}
              </span>
            </button>
          ))}
          {characters.length === 0 && <p className="muted">库中还没有角色——先去「人设工坊」导入或新建。</p>}
        </div>
      </div>

      <div className="card">
        <h3>开局 · 我的身份</h3>
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button className={`btn ${!useNewPersona ? 'primary' : ''}`} onClick={() => setUseNewPersona(false)} disabled={personas.length === 0}>
            沿用身份
          </button>
          <button className={`btn ${useNewPersona ? 'primary' : ''}`} onClick={() => setUseNewPersona(true)}>
            临时起一个
          </button>
        </div>
        {!useNewPersona ? (
          <label className="field">
            <span>玩家身份</span>
            <select value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="field">
              <span>身份名</span>
              <input value={newPersona.name} onChange={(e) => setNewPersona((s) => ({ ...s, name: e.target.value }))} placeholder="如：落魄书生" />
            </label>
            <label className="field">
              <span>这局里我是谁（会一并存进身份库）</span>
              <input
                value={newPersona.description}
                onChange={(e) => setNewPersona((s) => ({ ...s, description: e.target.value }))}
                placeholder="初到上都的外乡修士，囊中羞涩，身上有一封荐书"
              />
            </label>
          </>
        )}
      </div>

      <div className="card">
        <h3>开局 · 世界与名目</h3>
        {worldbooks.length > 0 && (
          <div className="wb-checks">
            {worldbooks.map((w) => (
              <label key={w.id} className="check">
                <input type="checkbox" checked={wbIds.includes(w.id)} onChange={() => toggleWb(w.id)} />
                {w.name}（{w.entries.length} 条）
              </label>
            ))}
          </div>
        )}
        <label className="field">
          <span>戏楼名目（可留空，默认「与{characters.find((c) => c.id === charId)?.name ?? '…'}对戏」）</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="" />
        </label>
        <div className="btn-row">
          <button className="btn primary" onClick={begin} disabled={!charId}>
            开戏
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ 右栏：卷宗 / 记忆簿 / 状态 ============ */

function SidePanel({ story, onClose }: { story: Story; onClose: () => void }) {
  const data = useAppData();
  const [tab, setTab] = useState<'卷宗' | '文风' | '记忆簿' | '状态'>('记忆簿');
  const [factDraft, setFactDraft] = useState('');
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
  const [stateDraft, setStateDraft] = useState<Story['state'] | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [err, setErr] = useState('');

  const character = data.characters.find((c) => c.id === story.characterId);
  const persona = data.personas.find((p) => p.id === story.personaId) ?? null;
  const wbs = story.worldbookIds.map((id) => data.worldbooks.find((w) => w.id === id)).filter((w): w is Worldbook => !!w);

  function saveSummary() {
    if (summaryDraft === null) return;
    updateStory(story.id, { summary: summaryDraft });
    setSummaryDraft(null);
  }

  async function aiSummarize() {
    if (summarizing) return;
    setSummarizing(true);
    setErr('');
    try {
      const settings = loadSettings();
      if (!settings.apiKey) throw new Error('尚未配置 API Key');
      if (!character) throw new Error('这座戏楼绑定的角色卡已被删除，无法让 AI 总结。');
      const messages = buildMessages({
        character,
        persona,
        worldbooks: wbs,
        story: { ...story, summary: '' },
        extraInstruction:
          '（现在跳出对戏：请用 200 字以内、条目式的中文，总结目前为止的剧情要点——已发生的关键事件、许诺、秘密、关系变化与悬而未决的线索。只输出摘要正文，不要角色扮演，不要描写。）',
        recentLimit: 60,
      });
      const handle = streamChat({
        url: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        messages,
        temperature: 0.3,
        maxTokens: settings.maxTokens,
        onDelta: () => {},
      });
      const result = await handle;
      recordUsage(result.usage ?? null);
      if (result.fullText.trim()) {
        updateStory(story.id, { summary: result.fullText.trim() });
        setSummaryDraft(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSummarizing(false);
    }
  }

  const state = stateDraft ?? story.state;

  return (
    <div className="sidepanel">
      <div className="panel-tabs">
        <span className="spacer" />
        {(['卷宗', '文风', '记忆簿', '状态'] as const).map((t) => (
          <button key={t} className={tab === t ? 'panel-tab active' : 'panel-tab'} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        <button className="icon-btn panel-close" title="收起" onClick={onClose}>
          ×
        </button>
      </div>

      {tab === '卷宗' && (
        <div className="panel-body">
          <h4>角色</h4>
          <p>{character ? character.name : '（角色卡已被删除）'}</p>
          <h4>我的身份</h4>
          <p>{persona ? `${persona.name}${persona.description ? ` —— ${persona.description}` : ''}` : story.personaName}</p>
          {wbs.length > 0 && (
            <>
              <h4>世界书</h4>
              <p>{wbs.map((w) => w.name).join('、')}</p>
            </>
          )}
          {story.branchedFrom && (
            <>
              <h4>分支来源</h4>
              <p className="muted">自另一座戏楼第 {story.branchedFrom.floorIndex + 1} 层另开。</p>
            </>
          )}
          <h4>导出</h4>
          <button className="btn" onClick={() => exportStory(story)}>
            导出戏录（Markdown）
          </button>
        </div>
      )}

      {tab === '文风' && (
        <div className="panel-body">
          <p className="muted">这座戏楼的文风偏好，随存档保存，每轮生成时注入提示词。</p>
          <StyleRow
            label="语体"
            options={['日常白话', '白话古风', '文白相间', '偏文言']}
            value={(story.style ?? defaultStyle).register}
            onChange={(v) => updateStory(story.id, { style: { ...(story.style ?? defaultStyle), register: v } })}
          />
          <StyleRow
            label="对话与描写"
            options={['多对话', '均衡', '多描写']}
            value={(story.style ?? defaultStyle).dialogue}
            onChange={(v) => updateStory(story.id, { style: { ...(story.style ?? defaultStyle), dialogue: v } })}
          />
          <StyleRow
            label="篇幅"
            options={['短', '中', '长']}
            value={(story.style ?? defaultStyle).length}
            onChange={(v) => updateStory(story.id, { style: { ...(story.style ?? defaultStyle), length: v } })}
          />
          <StyleRow
            label="推进"
            options={['慢炖', '均衡', '快进']}
            value={(story.style ?? defaultStyle).pace}
            onChange={(v) => updateStory(story.id, { style: { ...(story.style ?? defaultStyle), pace: v } })}
          />
        </div>
      )}

      {tab === '记忆簿' && (
        <div className="panel-body">
          <p className="muted">关键事实会每轮注入提示词；阶段摘要可查看、可改、可让 AI 重写。</p>
          <ul className="fact-list">
            {story.keyFacts.map((fact, i) => (
              <li key={i}>
                <input
                  value={fact}
                  onChange={(e) => {
                    const facts = [...story.keyFacts];
                    facts[i] = e.target.value;
                    updateStory(story.id, { keyFacts: facts });
                  }}
                />
                <button
                  className="icon-btn"
                  title="删除"
                  onClick={() => updateStory(story.id, { keyFacts: story.keyFacts.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="fact-add">
            <input
              value={factDraft}
              placeholder="补一条关键事实，如：账册在玩家身上"
              onChange={(e) => setFactDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && factDraft.trim()) {
                  updateStory(story.id, { keyFacts: [...story.keyFacts, factDraft.trim()] });
                  setFactDraft('');
                }
              }}
            />
            <button
              className="btn"
              disabled={!factDraft.trim()}
              onClick={() => {
                updateStory(story.id, { keyFacts: [...story.keyFacts, factDraft.trim()] });
                setFactDraft('');
              }}
            >
              记下
            </button>
          </div>
          <h4>阶段摘要</h4>
          <textarea
            className="summary-box"
            value={summaryDraft ?? story.summary}
            onChange={(e) => setSummaryDraft(e.target.value)}
            onBlur={saveSummary}
            placeholder="尚无摘要。可让 AI 总结，或自己动手写。"
            rows={6}
          />
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={aiSummarize} disabled={summarizing}>
              {summarizing ? '总结中…' : '让 AI 更新摘要'}
            </button>
          </div>
          {err && <p className="error">{err}</p>}
        </div>
      )}

      {tab === '状态' && (
        <div className="panel-body">
          <p className="muted">此刻的局面。可手动修正，会随提示词注入。</p>
          {(
            [
              ['time', '戏内时间'],
              ['place', '所在地点'],
              ['present', '在场人物'],
              ['goal', '当前目标'],
              ['extras', '要务（伤势 / 物品等）'],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                value={state[key]}
                onChange={(e) => setStateDraft({ ...state, [key]: e.target.value })}
                onBlur={() => {
                  if (stateDraft) {
                    updateStory(story.id, { state: stateDraft });
                    setStateDraft(null);
                  }
                }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** 解析模型给出的选项行：容错 A|、A：、A. 等写法；行没分行时在字母标记处补拆，最多取 3 条 */
function parseChoices(text: string): { letter: string; text: string }[] {
  const out: { letter: string; text: string }[] = [];
  const lines: string[] = [];
  for (const raw of text.split(/\n+/)) {
    // 模型偶尔把几行挤成一行：在 B|、C| 等管道式标记前强制断行
    const parts = raw.split(/(?=[A-Da-d]\s*[|｜])/);
    for (const p of parts) {
      const s = p.trim();
      if (s) lines.push(s);
    }
  }
  for (const raw of lines) {
    const m = raw.match(/^([ABCDabcd])\s*[|｜：:.)．、。]\s*(.+)$/);
    if (m) out.push({ letter: m[1].toUpperCase(), text: m[2].trim() });
    if (out.length >= 3) break;
  }
  return out;
}

function StyleRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="style-row">
      <span className="style-label">{label}</span>
      <div className="seg">
        {options.map((o, i) => (
          <button key={o} className={i === value ? 'seg-btn active' : 'seg-btn'} onClick={() => onChange(i)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function exportStory(story: Story) {
  const lines: string[] = [
    `# 《${story.title}》`,
    '',
    `- 角色：${story.characterName}`,
    `- 我的身份：${story.personaName}`,
    `- 导出于：${new Date().toLocaleString('zh-CN')}`,
    '',
    '---',
    '',
  ];
  story.floors.forEach((f, i) => {
    const fallback = f.role === 'assistant' ? story.characterName : story.personaName;
    const label = f.ooc ? `（场外）${f.name || fallback}` : f.name || fallback;
    lines.push(`## 第 ${i + 1} 层 · ${label}${f.interrupted ? '（中断）' : ''}`, '', f.content, '');
  });
  if (story.summary.trim()) lines.push('---', '', '## 前情摘要', '', story.summary.trim(), '');
  download(`${story.title}-戏录.md`, lines.join('\n'), 'text/markdown');
}

/* ============ 戏楼主页面 ============ */

export default function Chat() {
  const data = useAppData();
  const [activeId, setActiveId] = useState<string | null>(() => getLastStoryId());
  const [starting, setStarting] = useState(false);
  const [stream, setStream] = useState<{ storyId: string; text: string } | null>(null);
  const streamRef = useRef<StreamHandle | null>(null);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState('');
  const [ooc, setOoc] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [sideOpen, setSideOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hasKey] = useState(() => !!loadSettings().apiKey); // 页面切换会重挂载，读一次即可
  const [suggesting, setSuggesting] = useState(false);
  const [choices, setChoices] = useState<{ letter: string; text: string }[] | null>(null);
  const [customDraft, setCustomDraft] = useState('');
  const floorsRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true); // 用户贴近底部时才自动跟随滚动

  const stories = useMemo(() => [...data.stories].sort((a, b) => b.updatedAt - a.updatedAt), [data.stories]);
  const activeStory = stories.find((s) => s.id === activeId) ?? null;
  const activeChar = activeStory ? (data.characters.find((c) => c.id === activeStory.characterId) ?? null) : null;
  const streaming = stream?.storyId === activeId;

  useEffect(() => {
    if (activeId) setLastStoryId(activeId);
  }, [activeId]);

  useEffect(() => {
    stickRef.current = true;
    const el = floorsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setChoices(null);
    setCustomDraft('');
  }, [activeId]);

  useEffect(() => {
    const el = floorsRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [activeStory?.floors.length, stream?.text]);

  async function generate(storyId: string, extra?: string, dropLastAssistant = false) {
    if (streamRef.current) {
      setErr('另一座戏楼正在生成中——先等它说完，或点「停止」。');
      return;
    }
    const settings = loadSettings();
    if (!settings.apiKey) {
      setErr('尚未配置模型连接——先去「设置」填 API Base URL 与 Key。');
      return;
    }
    const latest = getData().stories.find((s) => s.id === storyId);
    if (!latest) return;
    const character = getData().characters.find((c) => c.id === latest.characterId);
    if (!character) {
      setErr('这座戏楼绑定的角色卡已被删除，无法继续生成。');
      return;
    }
    const persona = getData().personas.find((p) => p.id === latest.personaId) ?? null;
    const wbs = latest.worldbookIds
      .map((id) => getData().worldbooks.find((w) => w.id === id))
      .filter((w): w is Worldbook => !!w);
    // 重说：只在内存里拿掉最后一条 AI 楼层用于组装上下文；
    // 等请求成功拿到新文本后连同新楼层一次性写入——失败时原楼层原封不动。
    const lastFloor = latest.floors[latest.floors.length - 1];
    const dropped = dropLastAssistant && !!lastFloor && lastFloor.role === 'assistant' && !lastFloor.ooc;
    const floors = dropped ? latest.floors.slice(0, -1) : latest.floors;
    const messages = buildMessages({
      character,
      persona,
      worldbooks: wbs,
      story: { ...latest, floors },
      extraInstruction: [styleInstruction(latest.style), extra].filter(Boolean).join('\n'),
    });
    setErr('');
    setStream({ storyId, text: '' });
    try {
      const handle = streamChat({
        url: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        messages,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        onDelta: (t) => setStream((s) => (s ? { ...s, text: s.text + t } : s)),
      });
      streamRef.current = handle;
      const result = await handle;
      recordUsage(result.usage ?? null);
      const text = result.fullText.trim();
      if (text) {
        const floor: Floor = {
          id: uid(),
          role: 'assistant',
          name: latest.characterName,
          content: text,
          time: Date.now(),
          interrupted: result.interrupted || undefined,
        };
        if (dropped) updateStory(storyId, { floors: [...floors, floor] });
        else appendFloor(storyId, floor);
      } else if (result.interrupted) {
        setErr('（已停止，这一轮没有收到内容。）');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      streamRef.current = null;
      setStream(null);
    }
  }

  async function onSend() {
    const story = activeStory;
    if (!story) return;
    if (streamRef.current) {
      setErr('另一座戏楼正在生成中——先等它说完，或点「停止」。');
      return;
    }
    const text = draft.trim();
    if (!text) return;
    appendFloor(story.id, {
      id: uid(),
      role: 'user',
      name: story.personaName,
      content: text,
      time: Date.now(),
      ooc: ooc || undefined,
    });
    setDraft('');
    setOoc(false);
    await generate(story.id);
  }

  function onStop() {
    streamRef.current?.cancel();
  }

  function onRegen() {
    if (!activeStory) return;
    void generate(activeStory.id, undefined, true);
  }

  function onContinue() {
    if (!activeStory) return;
    void generate(activeStory.id, '（请接着上文自然地继续推进剧情。不要重复上文内容。）');
  }

  /** 讨主意：让模型荐 3 个行动选项，玩家点选或自定义 D 项填入落笔框 */
  async function onSuggest() {
    if (!activeStory || suggesting) return;
    const settings = loadSettings();
    if (!settings.apiKey) {
      setErr('尚未配置模型连接——先去「设置」填 API Base URL 与 Key。');
      return;
    }
    const latest = getData().stories.find((s) => s.id === activeStory.id);
    if (!latest) return;
    const character = getData().characters.find((c) => c.id === latest.characterId);
    if (!character) {
      setErr('这座戏楼绑定的角色卡已被删除。');
      return;
    }
    const persona = getData().personas.find((p) => p.id === latest.personaId) ?? null;
    const wbs = latest.worldbookIds
      .map((id) => getData().worldbooks.find((w) => w.id === id))
      .filter((w): w is Worldbook => !!w);
    setErr('');
    setChoices(null);
    setSuggesting(true);
    try {
      const messages = buildMessages({
        character,
        persona,
        worldbooks: wbs,
        story: latest,
        extraInstruction:
          '（现在请跳出对戏：站在玩家立场，针对当前局面给出 3 个风格不同的下一步行动建议——一个稳妥、一个冒险、一个出人意料。每行严格按如下格式输出：\nA|行动内容\nB|行动内容\nC|行动内容\n行动内容以玩家第一人称书写、10 到 30 字、具体可执行。只输出这三行，不要编号以外的任何文字。）',
        recentLimit: 40,
      });
      const handle = streamChat({
        url: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        messages,
        temperature: 0.8,
        maxTokens: settings.maxTokens,
        onDelta: () => {},
      });
      const result = await handle;
      recordUsage(result.usage ?? null);
      const opts = parseChoices(result.fullText);
      if (opts.length === 0) setErr('模型没给出有效的选项——再试一次，或换个模型。');
      else setChoices(opts);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  }

  function adoptChoice(text: string) {
    setDraft(text);
    setChoices(null);
    setCustomDraft('');
  }

  function onBranch(index: number) {
    if (!activeStory) return;
    const branch = branchStory(activeStory.id, index);
    if (branch) {
      setActiveId(branch.id);
      setSideOpen(false);
    }
  }

  function startStory(story: Story) {
    createStory(story);
    setActiveId(story.id);
    setStarting(false);
    setErr('');
  }

  const busy = streaming;
  const canRegen =
    !!activeStory && !busy && activeStory.floors.length > 0 && activeStory.floors[activeStory.floors.length - 1].role === 'assistant';

  return (
    <section className="page chat-page">
      <div className={`chat-layout ${starting || !activeStory ? 'starting' : ''}`}>
        {/* 左：戏楼列表（抽屉） */}
        <aside className={`drawer drawer-left ${sideOpen ? 'open' : ''}`}>
          {sideOpen ? (
            <div className="drawer-inner">
              <div className="drawer-head">
                <span>戏楼列表</span>
                <button className="icon-btn" title="收起" onClick={() => setSideOpen(false)}>
                  ×
                </button>
              </div>
              <button
                className="btn primary slim"
                onClick={() => {
                  setStarting(true);
                  setSideOpen(false);
                }}
              >
                新开一局
              </button>
              <ul className="story-list">
            {stories.map((s) => (
              <li key={s.id}>
                <button
                  className={`story-item ${s.id === activeId ? 'active' : ''}`}
                  onClick={() => {
                    setActiveId(s.id);
                    setStarting(false);
                    setSideOpen(false);
                  }}
                >
                  <CharacterThumb
                    name={s.characterName}
                    avatar={data.characters.find((c) => c.id === s.characterId)?.avatar}
                    size="story"
                  />
                  <span className="story-text">
                    <strong>{s.title}</strong>
                    <span className="muted">
                      {s.characterName} · {fmtTime(s.updatedAt)}
                      {s.branchedFrom ? ' · 分支' : ''}
                    </span>
                  </span>
                </button>
                <button
                  className="icon-btn"
                  title="销毁这座戏楼"
                  onClick={() => {
                    if (window.confirm(`销毁《${s.title}》？楼层将一并删除，且无法恢复。`)) {
                      deleteStory(s.id);
                      if (activeId === s.id) setActiveId(null);
                    }
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
            </div>
          ) : (
            <button className="drawer-strip" onClick={() => setSideOpen(true)}>
              戏楼 {stories.length} 座
            </button>
          )}
        </aside>

        {/* 中：楼层与输入 */}
        <div className="chat-main">
          {starting || !activeStory ? (
            <StartPanel characters={data.characters} personas={data.personas} worldbooks={data.worldbooks} onStart={startStory} />
          ) : (
            <>
              <div className="chat-head">
                <CharacterThumb name={activeStory.characterName} avatar={activeChar?.avatar} size="head" />
                <h2>{activeStory.title}</h2>
                <span className="muted">
                  {activeStory.characterName} × {activeStory.personaName}
                </span>
                <span className="spacer" />
                <input
                  className="floor-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="检索楼层…"
                  spellCheck={false}
                />
              </div>
              <div
                className="floors"
                ref={floorsRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
              >
                {(() => {
                  const q = query.trim();
                  const list = activeStory.floors
                    .map((f, i) => ({ f, i }))
                    .filter(({ f }) => !q || f.content.includes(q));
                  return (
                    <>
                      {q && <p className="muted center">「{q}」命中 {list.length} 层</p>}
                      {list.map(({ f, i }) => (
                        <FloorItem
                          key={f.id}
                          floor={f}
                          index={i}
                          mark={q}
                          name={floorName(f, activeStory)}
                          editing={editingId === f.id}
                          editDraft={editDraft}
                          onEditDraft={setEditDraft}
                          onStartEdit={() => {
                            setEditingId(f.id);
                            setEditDraft(f.content);
                          }}
                          onSaveEdit={() => {
                            if (editingId) updateFloor(activeStory.id, editingId, { content: editDraft });
                            setEditingId(null);
                          }}
                          onCancelEdit={() => setEditingId(null)}
                          onDelete={() => {
                            if (window.confirm('删除这一层？')) deleteFloor(activeStory.id, f.id);
                          }}
                          onBranch={() => onBranch(i)}
                        />
                      ))}
                    </>
                  );
                })()}
                {streaming && (
                  <article className="floor assistant streaming">
                    <span className="floor-seal">{activeStory.characterName.slice(0, 2)}</span>
                    <div className="floor-body">
                      <header>
                        <span className="floor-name">{activeStory.characterName}</span>
                      </header>
                      <div className="floor-text">
                        <p className="speech">
                          {stream?.text}
                          <span className="cursor">▍</span>
                        </p>
                      </div>
                    </div>
                  </article>
                )}
                {activeStory.floors.length === 0 && !streaming && (
                  <p className="muted center">这座戏楼还没有楼层——写第一笔，或点「续写」让角色开场。</p>
                )}
              </div>

              {err && (
                <p className="error chat-err">
                  {err}{' '}
                  <button className="linklike" onClick={() => setErr('')}>
                    知道了
                  </button>
                </p>
              )}

              <div className="composer">
                {choices && choices.length > 0 && (
                  <div className="choices">
                    {choices.map((c) => (
                      <button key={c.letter} className="choice" onClick={() => adoptChoice(c.text)}>
                        <i>{c.letter}</i>
                        <span>{c.text}</span>
                      </button>
                    ))}
                    <div className="choice custom">
                      <i>D</i>
                      <input
                        value={customDraft}
                        placeholder="自定一步：写你想做的事…（Enter 采纳）"
                        onChange={(e) => setCustomDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customDraft.trim()) adoptChoice(customDraft.trim());
                        }}
                      />
                      <button className="slim-link" disabled={!customDraft.trim()} onClick={() => adoptChoice(customDraft.trim())}>
                        用这句
                      </button>
                    </div>
                    <button className="icon-btn choices-close" title="收起" onClick={() => setChoices(null)}>
                      ×
                    </button>
                  </div>
                )}
                <textarea
                  value={draft}
                  rows={3}
                  placeholder={ooc ? '场外指导：如「放慢节奏，先写屋外雪景」…' : '落笔于此（Ctrl+Enter 发送）'}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void onSend();
                  }}
                />
                <div className="composer-row">
                  <label className="check">
                    <input type="checkbox" checked={ooc} onChange={(e) => setOoc(e.target.checked)} />
                    场外（不计剧情）
                  </label>
                  <span className="spacer" />
                  {streaming ? (
                    <button className="btn" onClick={onStop}>
                      停止
                    </button>
                  ) : (
                    <>
                      <button className="slim-link" onClick={onSuggest} disabled={suggesting || !hasKey} title="让模型荐三个行动，D 可自定义">
                        {suggesting ? '推敲中…' : '讨主意'}
                      </button>
                      <button className="slim-link" onClick={onContinue} disabled={!hasKey}>
                        续写
                      </button>
                      <button className="slim-link" onClick={onRegen} disabled={!canRegen}>
                        重说
                      </button>
                      <button
                        className="seal-btn"
                        onClick={onSend}
                        disabled={!draft.trim()}
                        title="发送（Ctrl+Enter）"
                      >
                        落笔
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 右：卷宗 / 记忆簿 / 状态（抽屉） */}
        {activeStory && !starting && (
          <aside className={`drawer drawer-right ${panelOpen ? 'open' : ''}`}>
            {panelOpen ? (
              <div className="drawer-inner">
                <SidePanel story={activeStory} onClose={() => setPanelOpen(false)} />
              </div>
            ) : (
              <button className="drawer-strip" onClick={() => setPanelOpen(true)}>
                卷宗 · 记忆 · 状态
              </button>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

function FloorItem({
  floor,
  index,
  name,
  mark,
  editing,
  editDraft,
  onEditDraft,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onBranch,
}: {
  floor: Floor;
  index: number;
  name: string;
  mark?: string;
  editing: boolean;
  editDraft: string;
  onEditDraft: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onBranch: () => void;
}) {
  return (
    <article className={`floor ${floor.role} ${floor.ooc ? 'ooc' : ''}`}>
      <span className="floor-seal" aria-hidden="true">
        {name.slice(0, 2)}
      </span>
      <div className="floor-body">
        <header>
          <span className="floor-name">{name}</span>
          <span className="floor-no">第 {index + 1} 层</span>
          {floor.ooc && <span className="floor-flag">场外</span>}
          {floor.interrupted && <span className="floor-flag">中断</span>}
          <span className="spacer" />
          {editing ? (
            <>
              <button className="icon-btn" title="保存" onClick={onSaveEdit}>
                存
              </button>
              <button className="icon-btn" title="取消" onClick={onCancelEdit}>
                ×
              </button>
            </>
          ) : (
            <>
              <button className="icon-btn" title="编辑这一层" onClick={onStartEdit}>
                改
              </button>
              <button className="icon-btn" title="从这层另开分支" onClick={onBranch}>
                枝
              </button>
              <button className="icon-btn" title="删除这一层" onClick={onDelete}>
                ×
              </button>
            </>
          )}
        </header>
        {editing ? (
          <textarea className="floor-edit" value={editDraft} rows={6} onChange={(e) => onEditDraft(e.target.value)} autoFocus />
        ) : (
          <FloorText text={floor.content} mark={mark} />
        )}
      </div>
    </article>
  );
}

/**
 * 折子剧本排版：含引号（「『“）的段落视为对白（如唱词），
 * 其余视为旁白环境（如小注：缩进、淡墨、稍小）。
 * mark：检索词高亮。
 */
function FloorText({ text, mark }: { text: string; mark?: string }) {
  const q = (mark ?? '').trim();
  const paras = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paras.length === 0) paras.push(text.trim());
  return (
    <div className="floor-text">
      {paras.map((p, i) => (
        <p key={i} className={/「|『|“/.test(p) ? 'speech' : 'aside'}>
          {q ? marked(p, q) : p}
        </p>
      ))}
    </div>
  );
}

/** 检索命中包 <mark>；split 保留空段避免相邻命中粘连 */
function marked(text: string, q: string): ReactNode[] {
  const parts = text.split(q);
  const out: React.ReactNode[] = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push(<mark key={`m${i}`}>{q}</mark>);
    if (p) out.push(p);
  });
  return out;
}
