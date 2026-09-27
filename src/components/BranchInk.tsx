interface BloomProps {
  x: number;
  y: number;
  s: number;
  rot?: number;
  wash?: boolean;
}

const PETAL = 'M0 0 C -7 -9 -8 -21 0 -27 C 8 -21 7 -9 0 0';
const ANGLES = [0, 72, 144, 216, 288];

/** 白描桃花：五片勾线花瓣 + 细蕊 */
function Bloom({ x, y, s, rot = 0, wash = false }: BloomProps) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      {ANGLES.map((a) => (
        <path
          key={a}
          d={PETAL}
          transform={`rotate(${a})`}
          fill={wash ? 'rgba(182, 94, 96, 0.09)' : 'none'}
          stroke="currentColor"
          strokeWidth="1.1"
        />
      ))}
      {[-30, -10, 12, 32].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <line x1="0" y1="0" x2="0" y2="-9" stroke="currentColor" strokeWidth="0.7" />
          <circle cx="0" cy="-10.5" r="1.1" fill="currentColor" stroke="none" />
        </g>
      ))}
    </g>
  );
}

/** 单色白描折枝：淡墨勾线，一角疏落 */
export default function BranchInk({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 260 200" fill="none" aria-hidden="true">
      {/* 枝干 */}
      <g stroke="currentColor" strokeLinecap="round" fill="none">
        <path d="M254 4 C 210 28, 176 56, 148 88 C 124 115, 104 146, 88 184" strokeWidth="2.4" />
        <path d="M196 44 C 184 36, 170 32, 156 32" strokeWidth="1.3" />
        <path d="M148 88 C 138 82, 126 78, 112 78" strokeWidth="1.2" />
        <path d="M114 120 C 104 114, 92 112, 80 114" strokeWidth="1.1" />
      </g>
      {/* 叶：单线勾筋 */}
      <g stroke="currentColor" strokeWidth="1" fill="none">
        <path d="M156 32 C 146 22, 132 18, 120 22 C 130 30, 144 34, 156 32 Z" />
        <path d="M120 22 C 134 25, 146 29, 156 32" strokeWidth="0.6" />
        <path d="M88 152 C 82 164, 82 176, 88 188 C 96 178, 96 162, 88 152 Z" />
        <path d="M88 152 C 88 164, 88 176, 88 188" strokeWidth="0.6" />
      </g>
      {/* 花与苞 */}
      <Bloom x={210} y={46} s={0.95} rot={-12} wash />
      <Bloom x={152} y={94} s={1.15} rot={16} />
      <Bloom x={104} y={128} s={0.8} rot={-26} />
      <g stroke="currentColor" strokeWidth="1" fill="none">
        <path d="M234 24 C 229 18, 229 10, 234 4 C 239 10, 239 18, 234 24 Z" />
        <path d="M66 104 C 61 98, 61 90, 66 84 C 71 90, 71 98, 66 104 Z" />
      </g>
    </svg>
  );
}
