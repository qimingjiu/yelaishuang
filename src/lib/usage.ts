/**
 * 用量累计（总纲教训 4：BYOK 也要用量透明）：
 * 服务商返回 usage 则记实际 tokens；未返回只计次数，展示时如实区分。
 */
export interface UsageTotals {
  calls: number; // 返回了 usage 的调用次数
  prompt: number; // 提示 tokens（实际值累计）
  completion: number; // 补全 tokens
  uncounted: number; // 未返回 usage 的调用次数
}

const KEY = 'yfs.usage.v1';

export function getUsage(): UsageTotals {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { calls: 0, prompt: 0, completion: 0, uncounted: 0 };
    const p = JSON.parse(raw) as Partial<UsageTotals>;
    return {
      calls: p.calls ?? 0,
      prompt: p.prompt ?? 0,
      completion: p.completion ?? 0,
      uncounted: p.uncounted ?? 0,
    };
  } catch {
    return { calls: 0, prompt: 0, completion: 0, uncounted: 0 };
  }
}

export function recordUsage(u: { prompt: number; completion: number } | null): void {
  const t = getUsage();
  if (u) {
    t.calls += 1;
    t.prompt += u.prompt;
    t.completion += u.completion;
  } else {
    t.uncounted += 1;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // 统计写不进不影响对戏
  }
}

export function resetUsage(): void {
  localStorage.removeItem(KEY);
}
