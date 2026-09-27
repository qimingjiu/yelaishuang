/**
 * Character Card V2 导入导出（JSON 为基线，识别 V1 扁平字段；PNG 解析 tEXt/zTXt 的 chara 块）。
 * PNG 导出暂不提供（需合成卡图），导出一律 V2 JSON。
 */
import type { Character } from './types';

interface CardData {
  name?: unknown;
  description?: unknown;
  personality?: unknown;
  scenario?: unknown;
  first_mes?: unknown;
  mes_example?: unknown;
  system_prompt?: unknown;
  post_history_instructions?: unknown;
  creator?: unknown;
  creator_notes?: unknown;
  tags?: unknown;
  character_book?: { entries?: unknown } | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function parseCardObject(json: unknown): Character {
  const obj = json as { spec?: string; data?: CardData } & CardData;
  const d: CardData = obj?.spec === 'chara_card_v2' || obj?.spec === 'chara_card_v3' ? (obj.data ?? {}) : (obj ?? {});
  if (!d || typeof d.name !== 'string' || !d.name.trim()) {
    throw new Error('不是有效的角色卡：缺少 name 字段');
  }
  const tags = Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : [];
  const now = Date.now();
  return {
    id: '',
    name: d.name.trim(),
    description: str(d.description),
    personality: str(d.personality),
    scenario: str(d.scenario),
    firstMes: str(d.first_mes),
    mesExample: str(d.mes_example),
    systemPrompt: str(d.system_prompt),
    postHistoryInstructions: str(d.post_history_instructions),
    creator: str(d.creator),
    creatorNotes: str(d.creator_notes),
    tags,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function parseCardJson(raw: string): Character {
  return parseCardObject(JSON.parse(raw));
}

/** 内置内容包里的卡对象直接入库时复用同一套归一化 */
export function normalizeCard(json: unknown): Omit<Character, 'id' | 'createdAt' | 'updatedAt' | 'builtin'> {
  const c = parseCardObject(json);
  const { id: _id, createdAt: _c, updatedAt: _u, builtin: _b, ...rest } = c;
  return rest;
}

/* ---------- PNG 卡导入 ---------- */

interface TextChunk {
  keyword: string;
  value: string;
}

/** 解析 PNG 的 tEXt / zTXt（zlib 压缩）文本块 */
async function readPngTextChunks(buf: ArrayBuffer): Promise<TextChunk[]> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 || sig.some((b, i) => bytes[i] !== b)) {
    throw new Error('不是有效的 PNG 文件');
  }
  const chunks: TextChunk[] = [];
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const dataStart = off + 8;
    if (type === 'tEXt') {
      const seg = bytes.subarray(dataStart, dataStart + len);
      const nul = seg.indexOf(0);
      if (nul > 0) {
        chunks.push({
          keyword: new TextDecoder('latin1').decode(seg.subarray(0, nul)),
          value: new TextDecoder('utf-8').decode(seg.subarray(nul + 1)),
        });
      }
    } else if (type === 'zTXt') {
      const seg = bytes.subarray(dataStart, dataStart + len);
      const nul = seg.indexOf(0);
      if (nul > 0 && seg[nul + 1] === 0) {
        // compression method 0 = zlib/deflate
        const keyword = new TextDecoder('latin1').decode(seg.subarray(0, nul));
        const inflated = await inflate(seg.subarray(nul + 2));
        chunks.push({ keyword, value: new TextDecoder('utf-8').decode(inflated) });
      }
    } else if (type === 'IEND') {
      break;
    }
    off = dataStart + len + 4; // 跳过 CRC
  }
  return chunks;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('此环境不支持压缩卡（zTXt），请改用 JSON 卡');
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readCardJsonFromPng(buf: ArrayBuffer): Promise<unknown> {
  const chunks = await readPngTextChunks(buf);
  for (const keyword of ['chara', 'ccv3']) {
    const chunk = chunks.find((c) => c.keyword === keyword);
    if (!chunk) continue;
    try {
      const json = atob(chunk.value.replace(/\s/g, ''));
      const bytes = Uint8Array.from(json, (ch) => ch.charCodeAt(0));
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (err) {
      if (keyword === 'ccv3') continue;
      throw new Error(`卡数据块损坏：${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error('这张 PNG 里没有嵌入角色卡数据（缺少 chara 文本块）');
}

/** 图片压成角色形象 data URL（最长边 384px，webp——控制 localStorage 体积） */
export async function fileToAvatar(source: Blob, max = 384): Promise<string> {
  const bmp = await createImageBitmap(source);
  try {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const cx = cv.getContext('2d');
    if (!cx) return '';
    cx.drawImage(bmp, 0, 0, w, h);
    return cv.toDataURL('image/webp', 0.82);
  } finally {
    bmp.close();
  }
}

/** 导入入口：按扩展名分发（PNG 卡 = 立绘即卡，立绘一并存为角色形象） */
export async function parseCardFile(file: File): Promise<{ card: Character; spec: string }> {
  if (/\.png$/i.test(file.name) || file.type === 'image/png') {
    const card = parseCardObject(await readCardJsonFromPng(await file.arrayBuffer()));
    try {
      card.avatar = await fileToAvatar(file);
    } catch {
      // 立绘读取失败不挡导入
    }
    return { card, spec: 'Character Card（PNG 嵌入）' };
  }
  return { card: parseCardJson(await file.text()), spec: '' };
}

/* ---------- 导出 ---------- */

export function toCardV2Json(c: Character): string {
  const data = {
    name: c.name,
    description: c.description,
    personality: c.personality,
    scenario: c.scenario,
    first_mes: c.firstMes,
    mes_example: c.mesExample,
    creator_notes: c.creatorNotes,
    system_prompt: c.systemPrompt,
    post_history_instructions: c.postHistoryInstructions,
    tags: c.tags,
    creator: c.creator,
    character_version: '',
    alternate_greetings: [],
    extensions: {},
  };
  return JSON.stringify({ spec: 'chara_card_v2', spec_version: '2.0', data, ...data }, null, 2);
}

export function download(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
