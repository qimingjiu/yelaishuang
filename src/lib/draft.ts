/**
 * 编辑器草稿自动保存（总纲：丢稿 = 退圈级事故）：
 * 表单每次变更防抖落盘，重开编辑器自动恢复；保存成功才清稿。
 */
const PREFIX = 'yfs.draft.';

export function loadDraft<T>(key: string): { data: T; time: number } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: T; time?: number };
    if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) return null;
    return { data: parsed.data as T, time: typeof parsed.time === 'number' ? parsed.time : 0 };
  } catch {
    return null;
  }
}

export function saveDraft<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, time: Date.now() }));
  } catch {
    // 草稿写不进（配额满等）不挡编辑
  }
}

export function clearDraft(key: string): void {
  localStorage.removeItem(PREFIX + key);
}
