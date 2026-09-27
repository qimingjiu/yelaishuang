export interface Settings {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** null = 不发送该参数，交给服务商默认（输入框清空即为此态） */
  temperature: number | null;
  maxTokens: number | null;
}

const KEY = 'yfs.settings.v1';

export const defaultSettings: Settings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.9,
  maxTokens: null,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}
