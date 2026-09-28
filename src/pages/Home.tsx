import { useEffect, useState } from 'react';
import { isTauri } from '../lib/bridge';
import { loadSettings, type Settings } from '../lib/settings';
import { getLastStoryId, useAppData } from '../lib/store';
import BranchInk from '../components/BranchInk';
import CharacterThumb from '../components/CharacterThumb';

export default function Home({ onNavigate }: { onNavigate: (p: 'settings' | 'chat' | 'workshop') => void }) {
  const [env, setEnv] = useState('检测中…');
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const data = useAppData();

  useEffect(() => {
    setEnv(isTauri() ? '桌面端（Tauri）' : '网页端（浏览器 / PWA）');
    const onFocus = () => setSettings(loadSettings());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const lastStory = data.stories.find((s) => s.id === getLastStoryId()) ?? data.stories[0] ?? null;
  const storyCount = data.stories.length;
  const recentChars = [...data.characters].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);

  return (
    <section className="page">
      <div className="folio">
        <div className="folio-left">
          <div className="folio-vertical">
            <h1 className="folio-title">夜来霜</h1>
            <p className="folio-couplet">夜阑霜重 · 晓来桃发</p>
          </div>
          <span className="folio-seal">霜</span>
        </div>

        <div className="folio-right">
          <p className="kicker">OVERNIGHT FROST · 卷首</p>
          <p className="folio-intro">
            古风 AI RP 客户端 —— 创建古风人物、构筑世界、选择自己的身份，与 AI
            持续对戏，并把每一段故事可靠地保存下来。
          </p>

          <div className="act">
            <BranchInk className="act-branch" />
            <p className="act-kicker">第一折</p>
            <h2>入戏</h2>
            <p>
              {lastStory
                ? `上回书说到《${lastStory.title}》——共 ${lastStory.floors.length} 层，接得上。${
                    storyCount > 1 ? `另有 ${storyCount - 1} 座戏楼候场。` : ''
                  }`
                : '一段连续的故事线就是一座戏楼：楼层推进、重说与分支、戏录归档导出。从这里起笔你的第一段对戏。'}
            </p>
            <div className="btn-row">
              <button className="btn primary" onClick={() => onNavigate('chat')}>
                {lastStory ? '回到戏楼' : '开新戏楼'}
              </button>
              <button className="btn" onClick={() => onNavigate('chat')}>
                另起一局
              </button>
            </div>
          </div>

          <div className="pack">
            <h3>初始内容包</h3>
            <p>
              改编自黎棠时《岁除上都雪》的 8 张角色卡、2 个说书人开局与 1 本世界书已就位（工坊内可直接取用）。
            </p>
            <button className="linklike" onClick={() => onNavigate('workshop')}>
              进工坊打理 →
            </button>
          </div>

          {recentChars.length > 0 && (
            <div className="recent">
              <span className="recent-label">最近角色</span>
              {recentChars.map((c) => (
                <button
                  key={c.id}
                  className="recent-char"
                  title="到工坊查看与编辑"
                  onClick={() => {
                    sessionStorage.setItem('yfs.openChar', c.id);
                    onNavigate('workshop');
                  }}
                >
                  <CharacterThumb name={c.name} avatar={c.avatar} size="story" />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="utils">
            <span>
              <i className={settings.apiKey ? 'dot ok' : 'dot'} />
              模型连接{settings.apiKey ? '已配置' : '未配置'}
            </span>
            <span>{env}</span>
            <button className="linklike" onClick={() => onNavigate('settings')}>
              前往设置
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
