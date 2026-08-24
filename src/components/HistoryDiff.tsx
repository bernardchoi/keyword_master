'use client';

import type { HistoryDiffResult } from '@/lib/history';
import { relativeTimeLabel } from '@/lib/history';
import { pct } from '@/lib/format';

/**
 * "지난 조회 대비" 배너. 같은 키워드를 다시 분석했을 때만 뜬다
 * (page.tsx 가 이력 훅에서 이전 스냅샷을 찾아 diff 를 만들어 내려준다).
 */
export default function HistoryDiff({ diff }: { diff: HistoryDiffResult }) {
  const { previous, current, searchChangePct, gradeChanged } = diff;

  const parts: string[] = [];

  if (searchChangePct === null) {
    parts.push('검색수 마스킹(< 10)이 섞여 있어 변화율은 계산하지 않음');
  } else if (Math.abs(searchChangePct) < 0.01) {
    parts.push('검색수 변화 거의 없음');
  } else {
    const arrow = searchChangePct > 0 ? '▲' : '▼';
    parts.push(`검색수 ${arrow} ${pct(Math.abs(searchChangePct), 0)}`);
  }

  if (gradeChanged) {
    parts.push(`경쟁강도 ${previous.grade} → ${current.grade}`);
  }

  if (previous.rowCount !== current.rowCount) {
    parts.push(`연관 키워드 ${previous.rowCount}개 → ${current.rowCount}개`);
  }

  return (
    <div className="notice info">
      <span>🕓</span>
      <span>
        <strong>{relativeTimeLabel(previous.at)}</strong> 조회 대비 {parts.join(' · ')}
      </span>
    </div>
  );
}
