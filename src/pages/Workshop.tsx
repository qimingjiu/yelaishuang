import { useRef, useState, type ChangeEvent } from 'react';

interface ParsedCard {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMes: string;
  tags: string[];
  spec: string;
  creator: string;
  bookEntries: number;
}

function parseV2(raw: string): ParsedCard {
  const json: unknown = JSON.parse(raw);
  const obj = json as { spec?: string; data?: Record<string, unknown> };
  const data = obj?.spec === 'chara_card_v2' ? obj.data : (obj as Record<string, unknown>);
  if (!data || typeof data.name !== 'string' || !data.name) {
    throw new Error('不是有效的角色卡：缺少 name 字段');
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const book = data.character_book as { entries?: unknown[] } | null | undefined;
  return {
    name: data.name,
    description: str(data.description),
    personality: str(data.personality),
    scenario: str(data.scenario),
    firstMes: str(data.first_mes),
    tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : [],
    spec: obj?.spec === 'chara_card_v2' ? 'Character Card V2' : 'V1（扁平字段）',
    creator: str(data.creator),
    bookEntries: book?.entries?.length ?? 0,
  };
}

export default function Workshop() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [card, setCard] = useState<ParsedCard | null>(null);
  const [error, setError] = useState('');

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setCard(null);
    file
      .text()
      .then((raw) => setCard(parseV2(raw)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '解析失败'));
    e.target.value = '';
  }

  return (
    <section className="page">
      <h2>人设工坊</h2>
      <p className="muted">
        角色编辑器尚未开工。当前提供 Character Card V2 导入解析预览——可直接选用仓库 cards/ 下的初始卡试试。
      </p>
      <div className="card">
        <input ref={inputRef} type="file" accept=".json,application/json" onChange={onFile} hidden />
        <button className="btn" onClick={() => inputRef.current?.click()}>
          导入角色卡（V2 JSON）
        </button>
        {error && <p className="error">{error}</p>}
        {card && (
          <div className="card-preview">
            <h3>{card.name}</h3>
            <p className="muted">
              {card.spec} · {card.creator || '佚名'}
              {card.bookEntries > 0 && ` · 内嵌世界书 ${card.bookEntries} 条`}
            </p>
            {card.tags.length > 0 && (
              <p>
                {card.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </p>
            )}
            {card.description && (
              <>
                <h4>描述</h4>
                <p className="pre">{card.description}</p>
              </>
            )}
            {card.personality && (
              <>
                <h4>性格</h4>
                <p className="pre">{card.personality}</p>
              </>
            )}
            {card.scenario && (
              <>
                <h4>情境</h4>
                <p className="pre">{card.scenario}</p>
              </>
            )}
            {card.firstMes && (
              <>
                <h4>开场白</h4>
                <p className="pre">{card.firstMes}</p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
