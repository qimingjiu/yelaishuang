/**
 * 随仓库内容包：构建时把 cards/ 打进应用，首次启动播撒进本地库。
 * 角色 / 开局剧本 = Character Card V2；世界书 = yfs-worldbook-v1（条目结构对齐 V2 character_book）。
 */
import { normalizeCard } from '../lib/charcard';
import type { Character, Worldbook, WorldbookEntry } from '../lib/types';

const cardModules = import.meta.glob('../../cards/**/*.json', { eager: true, import: 'default' }) as Record<
  string,
  unknown
>;

function pick(dir: string): { file: string; json: unknown }[] {
  return Object.entries(cardModules)
    .filter(([path]) => path.includes(`cards/${dir}/`))
    .map(([path, json]) => ({ file: path, json }));
}

export const builtinCharacters: Omit<Character, 'id' | 'createdAt' | 'updatedAt' | 'builtin'>[] = [
  ...pick('characters'),
  ...pick('scenarios'),
].map(({ file, json }) => {
  const card = normalizeCard(json);
  // 说书人类开局剧本补上标签，便于在角色列表里区分玩法
  if (file.includes('/scenarios/') && !card.tags.includes('开局剧本')) {
    card.tags = [...card.tags, '开局剧本'];
  }
  return card;
});

interface YfsWorldbookFile {
  format?: string;
  name?: string;
  source?: string;
  entries?: {
    comment?: unknown;
    keys?: unknown;
    content?: unknown;
    constant?: unknown;
    enabled?: unknown;
    insertion_order?: unknown;
  }[];
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export const builtinWorldbooks: Omit<Worldbook, 'id' | 'createdAt' | 'updatedAt'>[] = pick('worldbooks').map(
  ({ json }) => {
    const wb = json as YfsWorldbookFile;
    const entries: WorldbookEntry[] = (wb.entries ?? []).map((e, i) => ({
      id: `builtin-${i}`,
      comment: str(e.comment) || `条目 ${i + 1}`,
      keys: Array.isArray(e.keys) ? e.keys.filter((k): k is string => typeof k === 'string') : [],
      content: str(e.content),
      constant: e.constant === true,
      enabled: e.enabled !== false,
      insertionOrder: typeof e.insertion_order === 'number' ? e.insertion_order : 100,
    }));
    return { name: str(wb.name) || '未命名世界书', source: str(wb.source), entries };
  },
);

export const builtinSeed = { characters: builtinCharacters, worldbooks: builtinWorldbooks };
