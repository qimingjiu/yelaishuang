/**
 * 本地优先数据层：全部数据存 localStorage（按仓库约定不上传、不中转）。
 * useSyncExternalStore 供页面订阅；每次变更生成新的 data 引用。
 */
import { useSyncExternalStore } from 'react';
import type { AppData, Character, Floor, Persona, Story, Worldbook } from './types';
import { builtinSeed } from '../content/builtin';

const KEY = 'yfs.data.v1';
const LAST_STORY_KEY = 'yfs.lastStory.v1';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyData(): AppData {
  return { version: 1, characters: [], personas: [], worldbooks: [], stories: [] };
}

let data: AppData = load();
const listeners = new Set<() => void>();

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as AppData;
    return { ...emptyData(), ...parsed };
  } catch {
    return emptyData();
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    console.error('本地保存失败（可能超出存储配额）', err);
  }
}

function commit(next: AppData) {
  data = next;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAppData(): AppData {
  return useSyncExternalStore(subscribe, () => data);
}

export function getData(): AppData {
  return data;
}

/* ---------- 角色 ---------- */

export function upsertCharacter(c: Character) {
  const saved: Character = { ...c, id: c.id || uid(), updatedAt: Date.now() };
  const list = data.characters.filter((x) => x.id !== saved.id);
  list.unshift(saved);
  commit({ ...data, characters: list });
}

export function deleteCharacter(id: string) {
  commit({ ...data, characters: data.characters.filter((c) => c.id !== id) });
}

/* ---------- 玩家身份 ---------- */

export function upsertPersona(p: Persona) {
  const saved: Persona = { ...p, id: p.id || uid(), updatedAt: Date.now() };
  const list = data.personas.filter((x) => x.id !== saved.id);
  list.unshift(saved);
  commit({ ...data, personas: list });
}

export function deletePersona(id: string) {
  commit({ ...data, personas: data.personas.filter((p) => p.id !== id) });
}

/* ---------- 世界书 ---------- */

export function upsertWorldbook(w: Worldbook) {
  const saved: Worldbook = { ...w, id: w.id || uid(), updatedAt: Date.now() };
  const list = data.worldbooks.filter((x) => x.id !== saved.id);
  list.unshift(saved);
  commit({ ...data, worldbooks: list });
}

export function deleteWorldbook(id: string) {
  commit({ ...data, worldbooks: data.worldbooks.filter((w) => w.id !== id) });
}

/* ---------- 戏楼（故事） ---------- */

export function createStory(s: Story) {
  commit({ ...data, stories: [s, ...data.stories] });
  setLastStoryId(s.id);
}

export function updateStory(id: string, patch: Partial<Story>) {
  commit({
    ...data,
    stories: data.stories.map((s) =>
      s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
    ),
  });
}

export function deleteStory(id: string) {
  commit({ ...data, stories: data.stories.filter((s) => s.id !== id) });
  if (getLastStoryId() === id) clearLastStoryId();
}

/** 追加楼层并持久化（自动保存） */
export function appendFloor(storyId: string, floor: Floor) {
  updateStory(storyId, { floors: [...(data.stories.find((s) => s.id === storyId)?.floors ?? []), floor] });
}

export function updateFloor(storyId: string, floorId: string, patch: Partial<Floor>) {
  const story = data.stories.find((s) => s.id === storyId);
  if (!story) return;
  updateStory(storyId, {
    floors: story.floors.map((f) => (f.id === floorId ? { ...f, ...patch } : f)),
  });
}

export function deleteFloor(storyId: string, floorId: string) {
  const story = data.stories.find((s) => s.id === storyId);
  if (!story) return;
  updateStory(storyId, { floors: story.floors.filter((f) => f.id !== floorId) });
}

/** 从某层另开路线：状态、记忆与摘要随分支带走 */
export function branchStory(storyId: string, floorIndex: number): Story | null {
  const src = data.stories.find((s) => s.id === storyId);
  if (!src) return null;
  const branch: Story = {
    ...src,
    id: uid(),
    title: `${src.title} · 分支`,
    floors: src.floors.slice(0, floorIndex + 1).map((f) => ({ ...f, id: uid() })),
    branchedFrom: { storyId: src.id, floorIndex },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  createStory(branch);
  return branch;
}

/* ---------- 上次所在戏楼 ---------- */

export function setLastStoryId(id: string) {
  localStorage.setItem(LAST_STORY_KEY, id);
}

export function getLastStoryId(): string | null {
  return localStorage.getItem(LAST_STORY_KEY);
}

function clearLastStoryId() {
  localStorage.removeItem(LAST_STORY_KEY);
}

/* ---------- 整包备份与恢复 ---------- */

export function exportAll(): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}

/** 恢复整包备份：整体替换当前数据 */
export function importAll(raw: string): void {
  const parsed = JSON.parse(raw) as Partial<AppData>;
  if (!Array.isArray(parsed.characters)) throw new Error('备份文件缺少 characters 字段');
  commit({ ...emptyData(), ...parsed, version: 1 });
}

/* ---------- 首次启动：播撒内置内容 ---------- */

let seeded = false;
export function ensureSeeded() {
  if (seeded || data.characters.length > 0 || data.personas.length > 0) {
    seeded = true;
    return;
  }
  seeded = true;
  const now = Date.now();
  const characters: Character[] = builtinSeed.characters.map((c) => ({
    ...c,
    id: uid(),
    builtin: true,
    createdAt: now,
    updatedAt: now,
  }));
  const worldbooks: Worldbook[] = builtinSeed.worldbooks.map((w) => ({
    ...w,
    id: uid(),
    createdAt: now,
    updatedAt: now,
    entries: w.entries.map((e) => ({ ...e, id: uid() })),
  }));
  const personas: Persona[] = [
    {
      id: uid(),
      name: '过客',
      description: '初到上都的旅人，身份来历可自行与说书人商定。',
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
  commit({ ...data, characters, worldbooks, personas });
}
