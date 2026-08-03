'use client';

import type { TrendPoint } from '@/lib/types';

/** 의존성 없이 SVG 로 그리는 월별 상대 검색량 추이 */
export default function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) {
    return <p className="muted" style={{ fontSize: 13, margin: 0 }}>추이 데이터가 없습니다.</p>;
  }

  const W = 720;
  const H = 120;
  const PAD = 6;
  const max = Math.max(...points.map((p) => p.ratio), 1);

  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.ratio).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

  const first = points[0];
  const last = points[points.length - 1];
  const change = first.ratio > 0 ? ((last.ratio - first.ratio) / first.ratio) * 100 : 0;

  return (
    <div>
      <div className="sparkwrap">
        <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
             aria-label="월별 상대 검색량 추이">
          <path d={area} fill="var(--accent)" opacity="0.12" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {points.map((p, i) => (
            <circle key={p.period} cx={x(i)} cy={y(p.ratio)} r="2.5" fill="var(--accent)">
              <title>{`${p.period.slice(0, 7)} · 지수 ${p.ratio}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="srow" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>{first.period.slice(0, 7)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: change >= 0 ? 'var(--g-good)' : 'var(--g-worst)' }}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}%
        </span>
        <span className="muted" style={{ fontSize: 12 }}>{last.period.slice(0, 7)}</span>
      </div>
      <p className="footnote" style={{ marginTop: 4 }}>
        네이버 데이터랩 기준 상대 지수(최고 100)입니다. 절대 검색수가 아닙니다.
      </p>
    </div>
  );
}
