import { useEffect, useState } from 'react';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Workshop from './pages/Workshop';
import Settings from './pages/Settings';
import AmbientCanvas from './components/AmbientCanvas';
import { ensureSeeded } from './lib/store';

type Page = 'home' | 'chat' | 'workshop' | 'settings';

const NAV: { id: Page; label: string; hint: string }[] = [
  { id: 'home', label: '首页', hint: '总览' },
  { id: 'chat', label: '戏楼', hint: '对戏 · 楼层推进' },
  { id: 'workshop', label: '人设工坊', hint: '角色 · 玩家身份 · 世界书' },
  { id: 'settings', label: '设置', hint: '模型连接 · 备份' },
];

export default function App() {
  const [page, setPage] = useState<Page>('home');

  useEffect(() => {
    ensureSeeded(); // 首次启动播撒随仓库内容包
  }, []);

  return (
    <div className="app">
      <AmbientCanvas />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">霜</span>
          <span className="brand-name">
            夜来霜 <em>Overnight Frost</em>
          </span>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setPage(item.id)}
              title={item.hint}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="main">
        {page === 'home' && <Home onNavigate={setPage} />}
        {page === 'chat' && <Chat />}
        {page === 'workshop' && <Workshop />}
        {page === 'settings' && <Settings />}
      </main>
      <footer className="footer">
        <span>夜阑对戏，笔落成霜 · 官方内容全年龄 · BYOK · 本地优先</span>
      </footer>
    </div>
  );
}
