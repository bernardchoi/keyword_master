import { GUIDES } from '@/lib/guides';
import { CONTENT_REVIEWED_AT, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';

// 정적 파일이 아니라 라우트로 서빙한다 — GUIDES 배열이 늘어나면 이 목록도 항상 최신으로 따라온다(geo.md).
export function GET() {
  const guideLines = GUIDES.map(
    (g) => `- [${g.question}](${SITE_URL}/guide/${g.slug}): ${g.directAnswer}`,
  ).join('\n');

  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

## 핵심 페이지
- [키워드 마스터 — 도구 홈](${SITE_URL}/): 키워드 검색, 상품명 최적화, 쇼핑 태그 검사, 순위 조회를 실행하는 본체
- [SEO·GEO 무료 진단](${SITE_URL}/audit): 임의의 URL을 입력하면 h1·메타·robots.txt·sitemap.xml·JSON-LD·llms.txt를 서버가 직접 확인해 판정
- [가이드 목록](${SITE_URL}/guide): 아래 질문별 페이지 허브

## 질문별 가이드
${guideLines}

## 데이터 정책
- 출처: 네이버 검색광고 API(검색량·연관 키워드), 네이버 오픈 API(문서수·검색·검색어트렌드), 네이버 쇼핑인사이트(구매층·시즌성)
- 계산은 키워드 마스터가 위 원본 API 응답을 그대로 가공한 결과이며, 자체 추정치를 원본인 것처럼 표시하지 않습니다
- 검색량·문서수 계산 결과는 서버에서 6시간 캐시됩니다(같은 키워드 재조회 시 이전 6시간 내 값을 재사용)
- 마스킹: 네이버가 월간 검색수를 10 미만으로 마스킹한 키워드는 상한값(<10)으로 표시하며, 이를 활용한 지표(경쟁강도 등)는 하한(≥)으로 표시합니다
- 인용 시 표기: ${SITE_URL}
- 기준일: ${CONTENT_REVIEWED_AT} (계산식이 바뀌면 이 문서와 /guide 페이지를 함께 갱신합니다)
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
