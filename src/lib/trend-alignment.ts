import type { TrendPoint } from './types';

/** 같은 완료 월끼리만 비교한다. 누락 월을 0으로 만들어 넣지 않는다. */
export function alignTrends(search: TrendPoint[], shopping: TrendPoint[]) {
  const completed = (points: TrendPoint[]) => new Map(points.filter(p=>!p.partial).map(p=>[p.period.slice(0,7),p]));
  const a = completed(search), b = completed(shopping);
  const periods = [...a.keys()].filter(p=>b.has(p)).sort().slice(-12);
  return {search:periods.map(p=>a.get(p)!),shopping:periods.map(p=>b.get(p)!)};
}
