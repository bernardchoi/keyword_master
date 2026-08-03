'use client';

import type { AnalyzeResponse } from '@/lib/types';
import { compact, n, pct, ratio } from '@/lib/format';

export default function SummaryCards({ data }: { data: AnalyzeResponse }) {
  const seed = data.seed;
  const totalVolume = data.rows.reduce((sum, r) => sum + r.totalSearches, 0);
  const good = data.rows.filter(
    (r) => r.competition && (r.competition.grade === '최고' || r.competition.grade === '좋음'),
  ).length;

  return (
    <div className="stats">
      <div className="stat">
        <div className="stat-label">월간 검색수</div>
        <div className="stat-value">{seed ? n(seed.totalSearches) : '-'}</div>
        <div className="stat-sub">
          {seed ? `PC ${compact(seed.pcSearches)} · 모바일 ${compact(seed.mobileSearches)}` : '조회 키워드 없음'}
        </div>
      </div>

      <div className="stat">
        <div className="stat-label">모바일 비중</div>
        <div className="stat-value">{seed ? pct(seed.mobileShare, 0) : '-'}</div>
        <div className="stat-sub">
          {seed && seed.mobileShare > 0.75 ? '모바일 중심 키워드' : '검색 기기 분포'}
        </div>
      </div>

      <div className="stat">
        <div className="stat-label">블로그 문서수</div>
        <div className="stat-value">{seed?.docs ? compact(seed.docs.blog) : '-'}</div>
        <div className="stat-sub">
          {seed?.docs && seed.docs.shop !== null
            ? `쇼핑 상품 ${compact(seed.docs.shop)}개`
            : '쇼핑 상품수 조회 불가'}
        </div>
      </div>

      <div className="stat">
        <div className="stat-label">경쟁강도</div>
        <div className="stat-value">
          {seed?.competition ? ratio(seed.competition.ratio) : '-'}{' '}
          {seed?.competition && (
            <span className={`grade ${seed.competition.grade}`} style={{ fontSize: 12, verticalAlign: 'middle' }}>
              {seed.competition.grade}
            </span>
          )}
        </div>
        <div className="stat-sub">문서수 ÷ 검색수 · 낮을수록 유리</div>
      </div>

      <div className="stat">
        <div className="stat-label">연관 키워드</div>
        <div className="stat-value">{n(data.rows.length)}</div>
        <div className="stat-sub">총 검색량 {compact(totalVolume)}</div>
      </div>

      <div className="stat">
        <div className="stat-label">노려볼 만한 키워드</div>
        <div className="stat-value">{n(good)}</div>
        <div className="stat-sub">경쟁등급 좋음 이상</div>
      </div>
    </div>
  );
}
