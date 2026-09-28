import { useState } from 'react';
import type { Character } from '../lib/types';
import { loadSettings } from '../lib/settings';
import { streamChat } from '../lib/llm';
import { recordUsage } from '../lib/usage';

/**
 * 古风人设向导（总纲第八节 P0）：问答式完成身份、动机、语气与可接戏的开场。
 * 四步问答 + 一步预览；「直接建卡」用模板拼装，「让 AI 扩写」走 BYOK 生成四字段。
 * 产出的卡交回工坊编辑器精修——向导只管起稿，不替用户定稿。
 */

export interface WizardAnswers {
  name: string;
  identity: string;
  goal: string;
  obstacle: string;
  voice: string;
  relation: string;
  scene: string;
}

const VOICE_CHIPS = [
  '冷峻寡言，句短意沉',
  '爽利直率，快人快语',
  '绵里藏针，笑里带刀',
  '文绉绉，好引经据典',
  '市井烟火，俚语不断',
];

const EMPTY: WizardAnswers = { name: '', identity: '', goal: '', obstacle: '', voice: '', relation: '', scene: '' };

function assembleDraft(a: WizardAnswers): Omit<Character, 'id' | 'createdAt' | 'updatedAt' | 'builtin'> {
  const description = [
    a.identity && `【身份】${a.identity}`,
    a.goal && `【眼下动机】${a.goal}`,
    a.obstacle && `【阻力与矛盾】${a.obstacle}`,
    a.relation && `【与{{user}}的初见】${a.relation}`,
    a.voice && `【言行细节】${a.voice}`,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    name: a.name.trim(),
    description,
    personality: a.voice || '',
    scenario: a.scene || '',
    firstMes: a.scene ? `（${a.scene}）\n\n${a.name.trim()}注意到了你的到来。` : '',
    mesExample: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    creator: '本机向导',
    creatorNotes: '由人设向导起稿，可在编辑器中继续打磨。',
    tags: [],
    avatar: undefined,
  };
}

/** 解析 AI 按四小节输出的扩写结果 */
function parseSections(text: string): Partial<Record<'description' | 'personality' | 'scenario' | 'firstMes', string>> {
  const out: Record<string, string> = {};
  const re = /【([^】]+)】\s*([\s\S]*?)(?=【[^】]+】|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out[m[1].trim()] = m[2].trim();
  const pick = (...keys: string[]) => keys.map((k) => out[k]).find((v) => v && v.trim()) ?? '';
  return {
    description: pick('描述', '人物描述'),
    personality: pick('性格', '性格摘要'),
    scenario: pick('情境', '场景'),
    firstMes: pick('开场白', '开场'),
  };
}

export default function CardWizard({
  onCreate,
  onClose,
}: {
  onCreate: (draft: Omit<Character, 'id' | 'createdAt' | 'updatedAt' | 'builtin'>) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0); // 0-3 问答，4 预览
  const [a, setA] = useState<WizardAnswers>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [aiPreview, setAiPreview] = useState<null | ReturnType<typeof parseSections>>(null);

  const set = <K extends keyof WizardAnswers>(k: K, v: string) => setA((s) => ({ ...s, [k]: v }));
  const [hasKey] = useState(() => !!loadSettings().apiKey);

  async function expandByAI() {
    if (busy) return;
    const settings = loadSettings();
    if (!settings.apiKey) {
      setErr('尚未配置模型连接——先去「设置」填 API Base URL 与 Key。');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const ask = [
        '请根据以下设定要点，为中文古风文字角色扮演写一张角色卡的四个字段。要求：',
        '- 【描述】150-350字：身份、经历、眼下动机、行为与能力限制；散文为主，因果完整；用{{user}}指代玩家',
        '- 【性格】50-100字：性格与内在冲突，不重复描述内容',
        '- 【情境】30-60字：只写永久为真的场景设定，不写一时一地的状态',
        `- 【开场白】150-300字：从情境出发，${a.name.trim() || '角色'}做出一个玩家无法不回应的举动，以动作或台词收尾；不代替{{user}}的言行`,
        '',
        '设定要点：',
        `名号：${a.name.trim()}`,
        `身份出身：${a.identity}`,
        `眼下动机：${a.goal}`,
        `阻力与矛盾：${a.obstacle}`,
        `说话方式：${a.voice}`,
        `与玩家初见：${a.relation}`,
        `开场情境：${a.scene}`,
        '',
        '只输出四个【】小节，不要任何多余文字。',
      ].join('\n');
      const handle = streamChat({
        url: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        messages: [{ role: 'user', content: ask }],
        temperature: 0.8,
        maxTokens: settings.maxTokens,
        onDelta: () => {},
      });
      const result = await handle;
      recordUsage(result.usage ?? null);
      const sections = parseSections(result.fullText);
      if (!sections.description && !sections.firstMes) {
        setErr('模型没按格式输出——再试一次，或换个模型。');
        return;
      }
      setAiPreview(sections);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    const base = assembleDraft(a);
    onCreate({
      ...base,
      ...(aiPreview
        ? {
            description: aiPreview.description || base.description,
            personality: aiPreview.personality || base.personality,
            scenario: aiPreview.scenario || base.scenario,
            firstMes: aiPreview.firstMes || base.firstMes,
          }
        : {}),
    });
  }

  const canNext = step === 0 ? a.name.trim() !== '' : true;

  const questions: { title: string; body: React.ReactNode }[] = [
    {
      title: '第一步 · 名号与出身',
      body: (
        <>
          <label className="field">
            <span>他/她叫什么？（同时是对戏时的角色名）</span>
            <input value={a.name} onChange={(e) => set('name', e.target.value)} placeholder="如：谢无咎" spellCheck={false} />
          </label>
          <label className="field">
            <span>什么身份、什么来历？（仙门弟子 / 朝廷命官 / 江湖游侠 / 商贾之女……）</span>
            <textarea
              rows={3}
              value={a.identity}
              onChange={(e) => set('identity', e.target.value)}
              placeholder="青梧山掌门的三弟子，剑修，因一桩旧案被罚下山思过"
            />
          </label>
        </>
      ),
    },
    {
      title: '第二步 · 动机与矛盾',
      body: (
        <>
          <label className="field">
            <span>眼下最想做成什么事？</span>
            <textarea
              rows={3}
              value={a.goal}
              onChange={(e) => set('goal', e.target.value)}
              placeholder="查清师父当年被逐出师门的真相"
            />
          </label>
          <label className="field">
            <span>为什么这件事不容易？（阻碍、顾虑、不能说的苦衷）</span>
            <textarea
              rows={3}
              value={a.obstacle}
              onChange={(e) => set('obstacle', e.target.value)}
              placeholder="线索指向同门，而门规第一条就是不得同门相残"
            />
          </label>
          <p className="muted">好人设的骨架：想要什么 + 什么拦着他。有这一对，戏才有得推。</p>
        </>
      ),
    },
    {
      title: '第三步 · 声口',
      body: (
        <>
          <label className="field">
            <span>他/她怎么说话？（语气、口癖、忌讳）</span>
            <textarea
              rows={3}
              value={a.voice}
              onChange={(e) => set('voice', e.target.value)}
              placeholder="话少，习惯反问；不提师父的名字，被逼急了会拔剑鞘敲桌子"
            />
          </label>
          <div className="chip-row">
            {VOICE_CHIPS.map((c) => (
              <button key={c} className="chip" onClick={() => set('voice', c)}>
                {c}
              </button>
            ))}
          </div>
          <p className="muted">可以点一个再改，这一条会直接决定模型学什么腔调。</p>
        </>
      ),
    },
    {
      title: '第四步 · 关系与开场',
      body: (
        <>
          <label className="field">
            <span>初见玩家时，他/她是什么态度？</span>
            <textarea
              rows={2}
              value={a.relation}
              onChange={(e) => set('relation', e.target.value)}
              placeholder="警惕中带三分好奇——最近打听旧案的外乡人太多了"
            />
          </label>
          <label className="field">
            <span>开场情境：在哪里、什么时刻、正在发生什么？</span>
            <textarea
              rows={3}
              value={a.scene}
              onChange={(e) => set('scene', e.target.value)}
              placeholder="雨夜的山道茶棚，{name}独占一桌，桌上摊着一张被雨水洇了的花名册"
            />
          </label>
          <p className="muted">好开场的诀窍：让角色做出一个玩家无法不回应的举动。</p>
        </>
      ),
    },
  ];

  const preview = assembleDraft(a);

  return (
    <div className="editor wizard">
      <div className="editor-head">
        <h3>人设向导</h3>
        <span className="spacer" />
        <button className="btn slim" onClick={onClose}>
          收起
        </button>
      </div>

      <div className="wizard-progress">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
        <span>第 {step + 1} 步 · 共 5 步</span>
      </div>

      {step < 4 ? (
        <>
          <h4 className="wizard-title">{questions[step].title}</h4>
          {questions[step].body}
          <div className="btn-row">
            {step > 0 && (
              <button className="btn" onClick={() => setStep(step - 1)}>
                上一步
              </button>
            )}
            <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {step === 0 && !a.name.trim() ? '先起个名号' : '下一步'}
            </button>
          </div>
        </>
      ) : (
        <>
          <h4 className="wizard-title">预览 · 可以直接建卡，或先让 AI 把血肉写足</h4>
          <div className="wizard-preview">
            <p>
              <b>描述</b>
              {preview.description || '（空）'}
            </p>
            <p>
              <b>性格</b>
              {preview.personality || '（空）'}
            </p>
            <p>
              <b>情境</b>
              {preview.scenario || '（空）'}
            </p>
            <p>
              <b>开场白</b>
              {preview.firstMes || '（空）'}
            </p>
          </div>
          {aiPreview && (
            <p className="ok">AI 扩写已就绪——下方建卡时将以扩写稿为准，预览仍显示模板稿。</p>
          )}
          {err && <p className="error">{err}</p>}
          <div className="btn-row">
            <button className="btn" onClick={() => setStep(3)}>
              回上一步改
            </button>
            <button className="btn" onClick={expandByAI} disabled={busy || !hasKey} title={hasKey ? '' : '需先在设置中配置模型'}>
              {busy ? '研墨中…' : '让 AI 扩写'}
            </button>
            <button className="btn primary" onClick={finish} disabled={!a.name.trim()}>
              {aiPreview ? '存入工坊（用扩写稿）' : '直接存入工坊'}
            </button>
          </div>
          {!hasKey && <p className="muted">未配置模型连接，「让 AI 扩写」不可用；可直接建卡后到编辑器手写。</p>}
        </>
      )}
    </div>
  );
}
