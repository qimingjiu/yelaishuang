import { useEffect, useRef } from 'react';

/**
 * 全屏环境画布（pointer-events: none）：
 * 底部马远《水图》式白描水纹 + 阵风驱动的花瓣雨。
 * 花瓣自右上向左下飘落，落水后随波逐流，至左下墨化消散；
 * 起风时通过 body.gusting 类让折枝微颤，不画任何风的线条。
 */

type PetalState = 'fall' | 'float' | 'dissolve';

interface Petal {
  x: number;
  y: number;
  depth: number; // 0.35 远 → 1 近（影响大小/速度/透明度/虚化）
  size: number;
  vx: number; // px/s，负值 = 向左
  vy: number; // px/s
  rot: number; // 度
  rotV: number; // 度/s
  flip: number; // 翻转相位（模拟 rotateY）
  flipV: number; // rad/s
  sway: number; // 横摆相位
  swayAmp: number; // px/s
  opacity: number;
  state: PetalState;
  fade: number; // dissolve 进度 0→1
  tint: number; // 0→1 控制粉/茜之间的色差
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  max: number;
}

interface WaterLine {
  off: number; // 距视口底部 px
  amp: number;
  len: number; // 波长 px
  period: number; // s
  alpha: number;
  phase: number;
}

const INK = '180, 140, 135'; // 极淡茜灰，水纹与涟漪共用
const WATER_LINES: WaterLine[] = [
  { off: 28, amp: 3, len: 340, period: 6.2, alpha: 0.07, phase: 0 },
  { off: 54, amp: 4.5, len: 260, period: 7.4, alpha: 0.1, phase: 2.1 },
  { off: 82, amp: 6, len: 430, period: 6.8, alpha: 0.13, phase: 4.2 },
  { off: 112, amp: 7.5, len: 310, period: 7.9, alpha: 0.16, phase: 1.3 },
];

const MAX_FALLING = 8;
const MAX_FLOATING = 6;

function petalPath(ctx: CanvasRenderingContext2D, s: number) {
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.6, -s * 0.7, s * 0.75, s * 0.05, s * 0.35, s * 0.6);
  ctx.bezierCurveTo(s * 0.14, s * 0.9, -s * 0.14, s * 0.9, -s * 0.35, s * 0.6);
  ctx.bezierCurveTo(-s * 0.75, s * 0.05, -s * 0.6, -s * 0.7, 0, -s);
}

export default function AmbientCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    let raf = 0;
    let last = performance.now();
    let time = 0;
    let measureTimer = 0;

    const petals: Petal[] = [];
    const ripples: Ripple[] = [];
    let obstacles: DOMRect[] = [];

    // 风的状态机：calm（平时偶有单片） ↔ gust（一阵风连落数片）
    let wind: 'calm' | 'gust' = 'calm';
    let windTimer = 6 + Math.random() * 6;
    let gustLeft = 0;
    let calmSpawn = 2.5;
    let gustClassTimer = 0;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const measure = () => {
      obstacles = Array.from(
        document.querySelectorAll('.folio-title, .folio-couplet, .act'),
      ).map((el) => el.getBoundingClientRect());
    };

    const resize = () => {
      // DPR 上限 1.5：全屏画布在 2x 屏上像素量翻倍，是卡顿主因之一
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      measure();
    };

    const waveY = (line: WaterLine, x: number, t: number) =>
      h - line.off + line.amp * Math.sin((x / line.len) * Math.PI * 2 + (t / line.period) * Math.PI * 2 + line.phase);

    // 花瓣接触的水面：取第二组线的高度
    const surfaceY = (x: number, t: number) => waveY(WATER_LINES[1], x, t);

    const spawnPetal = (airborne: boolean) => {
      if (petals.filter((p) => p.state === 'fall').length >= MAX_FALLING) return;
      const depth = 0.35 + Math.random() * 0.65;
      petals.push({
        x: airborne ? w * (0.5 + Math.random() * 0.55) : w * (0.25 + Math.random() * 0.7),
        y: airborne ? -20 - Math.random() * 30 : Math.random() * h * 0.45,
        depth,
        size: 4.5 + depth * 8,
        vx: -(30 + depth * 55) * (0.8 + Math.random() * 0.5),
        vy: (28 + depth * 40) * (0.8 + Math.random() * 0.5),
        rot: Math.random() * 360,
        rotV: (Math.random() - 0.5) * 90,
        flip: Math.random() * Math.PI * 2,
        flipV: 1.2 + Math.random() * 1.6,
        sway: Math.random() * Math.PI * 2,
        swayAmp: 20 + Math.random() * 26,
        opacity: 0.4 + depth * 0.3,
        state: 'fall',
        fade: 0,
        tint: Math.random(),
      });
    };

    const setGusting = () => {
      document.body.classList.remove('gusting');
      void document.body.offsetWidth; // 重新触发枝颤动画
      document.body.classList.add('gusting');
      window.clearTimeout(gustClassTimer);
      gustClassTimer = window.setTimeout(() => document.body.classList.remove('gusting'), 2400);
    };

    const petalColor = (p: Petal, a: number) => {
      const r = Math.round(222 - p.tint * 36);
      const g = Math.round(164 - p.tint * 48);
      const b = Math.round(164 - p.tint * 44);
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    };

    const drawPetal = (p: Petal, alphaMul: number) => {
      const scaleX = Math.max(Math.abs(Math.cos(p.flip)), 0.08);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.scale(scaleX, 1);
      const a = p.opacity * alphaMul;
      // 前景花瓣：用更大更淡的外晕模拟虚焦（ctx.filter 的 blur 在大画布上极耗性能，禁用）
      const near = p.depth > 0.85;
      ctx.beginPath();
      petalPath(ctx, p.size * (near ? 1.7 : 1.3));
      ctx.fillStyle = petalColor(p, a * (near ? 0.14 : 0.22));
      ctx.fill();
      ctx.beginPath();
      petalPath(ctx, p.size);
      ctx.fillStyle = petalColor(p, a);
      ctx.fill();
      ctx.restore();
    };

    const tick = (now: number) => {
      // 环境动效 30fps 已足够顺滑，渲染频率减半直接省一半开销
      if (now - last < 33) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt;
      ctx.clearRect(0, 0, w, h);

      measureTimer += dt;
      if (measureTimer > 2) {
        measureTimer = 0;
        measure();
      }

      // —— 风 ——
      windTimer -= dt;
      if (wind === 'calm') {
        calmSpawn -= dt;
        if (calmSpawn <= 0) {
          spawnPetal(true);
          calmSpawn = 3 + Math.random() * 2;
        }
        if (windTimer <= 0) {
          wind = 'gust';
          windTimer = 2 + Math.random();
          gustLeft = 3 + Math.floor(Math.random() * 2);
          setGusting();
        }
      } else {
        if (gustLeft > 0 && Math.random() < dt * 5) {
          spawnPetal(true);
          gustLeft -= 1;
        }
        if (windTimer <= 0) {
          wind = 'calm';
          windTimer = 9 + Math.random() * 6;
        }
      }

      // —— 水纹 ——
      ctx.lineWidth = 1;
      for (const line of WATER_LINES) {
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 14) {
          const y = waveY(line, x, time);
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${INK}, ${line.alpha})`;
        ctx.stroke();
      }

      // —— 涟漪 ——
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += dt * 26;
        const life = 1 - rp.r / rp.max;
        if (life <= 0) {
          ripples.splice(i, 1);
          continue;
        }
        for (const k of [1, 0.6]) {
          ctx.beginPath();
          ctx.ellipse(rp.x, rp.y, rp.r * k, rp.r * k * 0.32, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${INK}, ${0.16 * life * (k === 1 ? 1 : 0.7)})`;
          ctx.stroke();
        }
      }

      // —— 花瓣 ——
      let floating = 0;
      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i];

        if (p.state === 'fall') {
          p.flip += p.flipV * dt;
          p.sway += dt * 1.6;
          p.rot += p.rotV * dt;
          const lift = 0.55 + 0.45 * Math.sin(p.flip); // 翻转时的空气托举
          let vx = p.vx + Math.sin(p.sway) * p.swayAmp * (wind === 'gust' ? 1.5 : 1);
          let vy = p.vy * lift;
          for (const r of obstacles) {
            if (p.x > r.left - 8 && p.x < r.right + 8 && p.y > r.top - 8 && p.y < r.bottom + 8) {
              vx *= 0.45; // 被纸面墨迹阻滞一瞬
              vy *= 0.5;
              break;
            }
          }
          p.x += vx * dt;
          p.y += vy * dt;
          if (p.y >= surfaceY(p.x, time) - 2) {
            if (floating >= MAX_FLOATING || p.x < w * 0.08) {
              petals.splice(i, 1); // 水面挤满了或贴近左缘：直接化掉
              continue;
            }
            p.state = 'float';
            floating += 1;
          }
          if (p.x < -40) {
            petals.splice(i, 1);
            continue;
          }
          drawPetal(p, 1);
        } else if (p.state === 'float') {
          floating += 1;
          p.flip += p.flipV * 0.25 * dt;
          p.rot += (78 - p.rot) * dt * 2; // 在水面渐渐躺平
          p.x -= (18 + p.depth * 14) * dt; // 随波逐流
          p.y = surfaceY(p.x, time) - 1;
          if (p.x < w * 0.22) {
            p.state = 'dissolve';
            p.fade = 0;
          }
          drawPetal(p, 1);
        } else {
          p.fade += dt / 1.5;
          if (p.fade >= 1) {
            petals.splice(i, 1);
            continue;
          }
          drawPetal(p, Math.max(0, 1 - p.fade * 1.3));
          ctx.beginPath(); // 淡粉墨晕在水里化开
          ctx.ellipse(
            p.x,
            p.y,
            p.size * (1 + p.fade * 2.4),
            p.size * (0.45 + p.fade * 1.1),
            0,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = petalColor(p, p.opacity * 0.3 * (1 - p.fade));
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(tick);
    };

    // —— 鼠标划过底部，激起一两圈细涟漪 ——
    let lastRippleAt = 0;
    let lastRX = -999;
    let lastRY = -999;
    const onMove = (e: MouseEvent) => {
      if (e.clientY < h - 150) return;
      const nowMs = performance.now();
      if (nowMs - lastRippleAt < 700) return;
      if (Math.hypot(e.clientX - lastRX, e.clientY - lastRY) < 60) return;
      if (ripples.length >= 2) return;
      ripples.push({
        x: e.clientX,
        y: Math.min(Math.max(e.clientY, h - 110), h - 20),
        r: 4,
        max: 40 + Math.random() * 14,
      });
      lastRippleAt = nowMs;
      lastRX = e.clientX;
      lastRY = e.clientY;
    };

    resize();
    window.addEventListener('resize', resize);

    if (reduced) {
      // 静帧：只画一次水纹，不起风不落花
      time = 3;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (const line of WATER_LINES) {
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 14) {
          const y = waveY(line, x, time);
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${INK}, ${line.alpha})`;
        ctx.stroke();
      }
    } else {
      for (let i = 0; i < 3; i++) spawnPetal(false); // 开场即有几片在空中
      window.addEventListener('mousemove', onMove);
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.clearTimeout(gustClassTimer);
      document.body.classList.remove('gusting');
    };
  }, []);

  return <canvas ref={ref} className="ambient-canvas" aria-hidden="true" />;
}
