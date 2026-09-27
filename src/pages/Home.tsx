import { useEffect, useState } from 'react';
import { isTauri } from '../lib/bridge';
import { loadSettings, type Settings } from '../lib/settings';

export default function Home({ onNavigate }: { onNavigate: (p: 'settings' | 'chat' | 'workshop') => void }) {
  const [env, setEnv] = useState('检测中…');
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    setEnv(isTauri() ? '桌面端（Tauri）' : '网页端（浏览器 / PWA）');
    const onFocus = () => setSettings(loadSettings());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return (
    <section className="page">
      <div className="hero">
        <h1>夜来霜</h1>
        <p className="slogan">夜阑对戏，笔落成霜。</p>
        <p className="sub">
          古风 AI RP 客户端 —— 创建古风人物、构筑世界、选择自己的身份，与 AI 持续对戏，
          并把每一段故事可靠地保存下来。
        </p>
      </div>
      <div className="grid2">
        <div className="card">
          <h3>运行环境</h3>
          <p>{env}</p>
          <p className="muted">一份代码，两种形态：网页版可在浏览器里直接「安装」为 PWA；桌面安装包见 GitHub Releases。</p>
        </div>
        <div className="card">
          <h3>模型连接（BYOK）</h3>
          {settings.apiKey ? (
            <p>
              已配置：<code>{settings.baseUrl}</code>
              <br />
              模型：<code>{settings.model}</code>
            </p>
          ) : (
            <p className="muted">尚未配置 API Key。</p>
          )}
          <button className="btn" onClick={() => onNavigate('settings')}>
            前往设置
          </button>
        </div>
        <div className="card">
          <h3>戏楼</h3>
          <p className="muted">一段连续的故事线就是一座戏楼：楼层推进、重说与分支、戏录归档导出。</p>
          <button className="btn" onClick={() => onNavigate('chat')}>
            查看规划
          </button>
        </div>
        <div className="card">
          <h3>初始内容包</h3>
          <p className="muted">
            改编自黎棠时《岁除上都雪》的 8 张角色卡、2 个开局剧本与 1 本世界书已随仓库发布（cards/ 目录）。
          </p>
          <button className="btn" onClick={() => onNavigate('workshop')}>
            导入试用
          </button>
        </div>
      </div>
    </section>
  );
}
