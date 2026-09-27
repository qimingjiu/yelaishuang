/**
 * 六层上下文组装（总纲 7.1）：
 * 稳定角色设定 → 世界规则（世界书）→ 本局关键事实 → 当前状态 → 阶段摘要 → 最近对话。
 * 世界书回答"背景规则是什么"，记忆簿回答"发生过什么"，状态栏回答"此刻什么情况"。
 */
import type { Character, Floor, Persona, Story, Worldbook } from './types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** {{char}} / {{user}} 宏展开 */
export function expandMacros(text: string, charName: string, userName: string): string {
  return text
    .replace(/\{\{char\}\}/gi, charName)
    .replace(/\{\{user\}\}/gi, userName)
    .replace(/<BOT>/g, charName)
    .replace(/<USER>/g, userName);
}

export const GLOBAL_RULES = [
  '你正在与用户进行一场中文古风文字角色扮演。',
  '你扮演故事中的角色（含必要的旁白与配角），以第三人称叙述动作与环境，以直接引语呈现对话。',
  '白话古风的语感：器物、称谓、礼仪贴合所选时代与世界；克制堆砌辞藻。',
  '不代替用户行动：不描写用户的台词、内心与决定，把回应的空间留给用户。',
  '角色可以有秘密、可以说谎；未在场的人物不知道密谈内容。',
  '伤势、消耗与承诺要有延续性：已确立的事实不因换段而无故消失。',
  '每次推进一个可回应的变化，篇幅与用户最近一轮相当，不以提问敷衍收尾。',
].join('\n');

const OOC_TAG = '[场外备注：这不是剧情内容，是给你的演出指导，不要当作玩家在故事里的言行]';

/** 世界书条目触发：constant 恒注入；其余按关键词命中最近对话文本（中文不做整词匹配） */
export function triggerEntries(
  worldbooks: Worldbook[],
  visibleText: string,
): Worldbook['entries'] {
  const out: Worldbook['entries'] = [];
  for (const wb of worldbooks) {
    for (const e of wb.entries) {
      if (!e.enabled || !e.content.trim()) continue;
      if (e.constant || (e.keys.length > 0 && e.keys.some((k) => k && visibleText.includes(k)))) {
        out.push(e);
      }
    }
  }
  return out.sort((a, b) => a.insertionOrder - b.insertionOrder);
}

export interface BuildContextOptions {
  character: Character;
  persona: Persona | null;
  worldbooks: Worldbook[];
  story: Story;
  /** 临时演出指导（续写 / 重说引导等），不写入存档 */
  extraInstruction?: string;
  /** 参与最近对话的最大楼层数 */
  recentLimit?: number;
}

export function buildMessages(o: BuildContextOptions): ChatMessage[] {
  const { character, persona, worldbooks, story, extraInstruction } = o;
  const recentLimit = o.recentLimit ?? 40;
  const charName = story.characterName || character.name;
  const userName = persona?.name || '旅人';

  // 最近对话文本参与世界书关键词触发（含场外楼层）
  const visibleFloors = story.floors.slice(-recentLimit);
  const visibleText = visibleFloors.map((f) => f.content).join('\n');
  const triggered = triggerEntries(worldbooks, visibleText);
  const constantEntries = triggered.filter((e) => e.constant);
  const keywordEntries = triggered.filter((e) => !e.constant);

  const worldBlock = constantEntries.map((e) => `【世界·${e.comment}】\n${e.content}`).join('\n\n');
  const keywordBlock = keywordEntries.map((e) => `【设定·${e.comment}】\n${e.content}`).join('\n\n');

  const memoryBlock = story.keyFacts.length
    ? `【已确认的关键事实（必须遵守，不得无故推翻）】\n${story.keyFacts.map((f) => `- ${f}`).join('\n')}`
    : '';
  const stateBlock = [
    ['时间', story.state.time],
    ['地点', story.state.place],
    ['在场', story.state.present],
    ['当前目标', story.state.goal],
    ['要务（伤势/物品等）', story.state.extras],
  ]
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${k}：${v}`)
    .join('\n');
  const summaryBlock = story.summary.trim() ? `【前情摘要】\n${story.summary.trim()}` : '';

  const globalSystem = [GLOBAL_RULES, worldBlock, keywordBlock].filter(Boolean).join('\n\n');
  const systemPrompt = character.systemPrompt.trim()
    ? expandMacros(
        character.systemPrompt.replace(/\{\{original\}\}/gi, globalSystem),
        charName,
        userName,
      )
    : globalSystem;

  const charBlock = [
    `【你扮演的角色】${charName}`,
    character.description && `【描述】\n${character.description}`,
    character.personality && `【性格】\n${character.personality}`,
    character.scenario && `【情境】\n${expandMacros(character.scenario, charName, userName)}`,
    character.mesExample &&
      `【对话示例（学习文风与篇幅，勿照抄内容）】\n${expandMacros(character.mesExample, charName, userName)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const roleBlock = persona?.description.trim()
    ? `【用户的身份】${expandMacros(persona.description, charName, userName)}`
    : '';

  const system = [
    expandMacros(systemPrompt, charName, userName),
    charBlock,
    roleBlock,
    memoryBlock,
    summaryBlock,
    stateBlock && `【当前状态】\n${stateBlock}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const messages: ChatMessage[] = [{ role: 'system', content: system }];
  for (const f of visibleFloors) {
    const role = f.role === 'assistant' ? 'assistant' : 'user';
    // 楼层里的 {{char}}/{{user}} 宏兜底展开（旧存档 / 导入数据可能带原文）
    const body = expandMacros(f.content, charName, userName);
    messages.push({ role, content: f.ooc ? `${OOC_TAG}\n${body}` : body });
  }
  if (extraInstruction?.trim()) {
    messages.push({ role: 'system', content: expandMacros(extraInstruction, charName, userName) });
  }
  // 卡片收束指令（UJB 位置）：置于最后，权重最高
  if (character.postHistoryInstructions.trim()) {
    messages.push({
      role: 'system',
      content: expandMacros(character.postHistoryInstructions, charName, userName),
    });
  }
  return messages;
}

/** 楼层 → 提示词里的显示名 */
export function floorName(f: Floor, story: Story): string {
  if (f.role === 'assistant') return f.name || story.characterName;
  return f.name || story.personaName;
}
