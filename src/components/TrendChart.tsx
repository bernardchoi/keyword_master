'use client';

import type { TrendPoint } from '@/lib/types';

/**
 * 의존성 없이 SVG 로 그리는 월별 상대 검색량 추이.
 *
 * 마지막 점은 대개 '진행 중인 달'이라 며칠치만 집계된 값이다. 그대로 이으면
 * 검색량이 폭락한 것처럼 보이므로(실측: `수영복` 7월 47.7 → 8월 7일 기준 9.9)
 * 점선으로 끊어 그리고 증감률 계산에서도 뺀다.
 */
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
  const at = (i: number) => `${x(i).toFixed(1)},${y(points[i].ratio).toFixed(1)}`;

  // 확정된 구간과 진행 중인 마지막 구간을 나눠 그린다.
  const firstPartial = points.findIndex((p) => p.partial);
  const solidEnd = firstPartial === -1 ? points.length - 1 : firstPartial - 1;

  const solid =
    solidEnd >= 1
      ? points.slice(0, solidEnd + 1).map((_, i) => `${i === 0 ? 'M' : 'L'}${at(i)}`).join(' ')
      : '';
  const dashed =
    solidEnd >= 0 && solidEnd < points.length - 1
      ? points.slice(solidEnd).map((_, i) => `${i === 0 ? 'M' : 'L'}${at(solidEnd + i)}`).join(' ')
      : '';
  const area = solid
    ? `${solid} L${x(solidEnd).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`
    : '';

  // 증감률은 확정된 달끼리만 비교한다.
  const settled = points.filter((p) => !p.partial);
  const first = settled[0] ?? points[0];
  const last = settled[settled.length - 1] ?? points[points.length - 1];
  const change = first.ratio > 0 ? ((last.ratio - first.ratio) / first.ratio) * 100 : 0;
  const partialCount = points.length - settled.length;

  return (
    <div>
      <div className="sparkwrap">
        <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
             aria-label="월별 상대 검색량 추이">
          {area && <path d={area} fill="var(--accent)" opacity="0.12" />}
          {solid && (
            <path d={solid} fill="none" stroke="var(--accent)" strokeWidth="2"
                  strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
          {dashed && (
            <path d={dashed} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 4"
                  opacity="0.5" strokeLinejoin="round" strokeLinecap="round"
                  vectorEffect="non-scaling-stroke" />
          )}
          {points.map((p, i) => (
            <circle
              key={p.period}
              cx={x(i)}
              cy={y(p.ratio)}
              r="2.5"
              // 진행 중인 달은 속 빈 점 — 카드 배경색으로 채운다
              fill={p.partial ? 'var(--surface)' : 'var(--accent)'}
              stroke="var(--accent)"
              strokeWidth={p.partial ? 1.5 : 0}
              vectorEffect="non-scaling-stroke"
            >
              <title>
                {`${p.period.slice(0, 7)} · 지수 ${p.ratio}${p.partial ? ' (진행 중 — 이번 달 일부만 집계)' : ''}`}
              </title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="srow" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>{points[0].period.slice(0, 7)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: change >= 0 ? 'var(--g-good)' : 'var(--g-worst)' }}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}%
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          {points[points.length - 1].period.slice(0, 7)}
        </span>
      </div>
      <p className="footnote" style={{ marginTop: 4 }}>
        네이버 데이터랩 기준 상대 지수(최고 100)입니다. 절대 검색수가 아닙니다.
        {partialCount > 0 && (
          <>
            {' '}점선 구간({last.period.slice(0, 7)} 이후)은 아직 끝나지 않은 달이라 값이 낮게 잡히며,
            증감률 {Math.abs(change).toFixed(0)}% 는 {first.period.slice(0, 7)} → {last.period.slice(0, 7)} 기준입니다.
          </>
        )}
      </p>
    </div>
  );
}
