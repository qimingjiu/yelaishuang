/**
 * 领域对象模型（见 research/02 第三节）：
 * 世界（世界书）/ AI 角色原型 / 玩家身份 Persona / 故事存档（戏楼）/ 楼层。
 * 「开始新故事」不写回角色卡——旧存档保留各自快照。
 */

export interface WorldbookEntry {
  id: string;
  comment: string; // 条目名（不进提示词）
  keys: string[]; // 触发关键词，含别称；中文不做整词匹配
  content: string; // 必须自包含
  constant: boolean; // 恒注入（不靠关键词）
  enabled: boolean;
  insertionOrder: number; // 小 = 靠前
}

export interface Worldbook {
  id: string;
  name: string;
  source: string;
  entries: WorldbookEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMes: string;
  mesExample: string; // <START> 分隔
  systemPrompt: string; // 非空时替换全局系统提示（支持 {{original}}）
  postHistoryInstructions: string; // 非空时替换全局收束指令
  creator: string;
  creatorNotes: string;
  tags: string[];
  avatar?: string; // 角色形象（data URL，仅展示、不进提示词）
  builtin: boolean; // 来自随仓库内容包
  createdAt: number;
  updatedAt: number;
}

export interface Persona {
  id: string;
  name: string;
  description: string; // 我在故事里是谁
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Floor {
  id: string;
  role: 'user' | 'assistant';
  name: string; // 显示名：角色名 / 身份名 / 说书人
  content: string;
  time: number;
  ooc?: boolean; // 场外（水楼）：给模型的指导，不计为剧情台词
  interrupted?: boolean; // 被手动停止/出错的残篇
}

/** 简版状态面板：允许手动修正 */
export interface StoryState {
  time: string; // 戏内时间
  place: string; // 所在地点
  present: string; // 在场人物
  goal: string; // 当前目标
  extras: string; // 伤势 / 物品等重要事项
}

/** 文风偏好（总纲第八节 P0 文风控制）：随戏楼存档，每轮生成注入 */
export interface StoryStyle {
  register: number; // 语体：0 日常白话 · 1 白话古风 · 2 文白相间 · 3 偏文言
  dialogue: number; // 配比：0 多对话 · 1 均衡 · 2 多描写
  length: number; // 篇幅：0 短 · 1 中 · 2 长
  pace: number; // 推进：0 慢炖 · 1 均衡 · 2 快进
}

export interface Story {
  id: string;
  title: string;
  characterId: string;
  characterName: string; // 快照：之后改角色卡不影响旧楼显示
  personaId: string;
  personaName: string;
  worldbookIds: string[];
  floors: Floor[];
  keyFacts: string[]; // 记忆簿：锁定的关键事实
  summary: string; // 记忆簿：阶段摘要（可编辑）
  state: StoryState;
  style?: StoryStyle; // 文风偏好（无则均衡默认）
  branchedFrom?: { storyId: string; floorIndex: number };
  createdAt: number;
  updatedAt: number;
}

export interface AppData {
  version: number;
  characters: Character[];
  personas: Persona[];
  worldbooks: Worldbook[];
  stories: Story[];
}
