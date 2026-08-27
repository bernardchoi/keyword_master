// 배포 도메인 · 사이트 메타 상수. sitemap.ts, robots.ts, layout.tsx, page.tsx가 전부 이 값을 공유한다 —
// 흩어져 있으면 프리뷰 배포마다 canonical/사이트맵이 서로 다른 값을 가리키는 사고가 난다.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://keyword-master-delta.vercel.app';

export const SITE_NAME = '키워드 마스터';

// 가이드 페이지의 "기준일" — 계산식·정책 수치를 마지막으로 코드와 대조 확인한 날짜.
// 값이 아니라 값의 날짜를 감시하라는 원칙(measure.md)에 따라 갱신할 때마다 이 값도 같이 고친다.
export const CONTENT_REVIEWED_AT = '2026-08-27';

// 네이버 서치어드바이저 사이트 소유확인용 메타 태그 값 (HTML 태그 방식).
// searchadvisor.naver.com에서 도메인당 한 번 발급받는 값이라, 다른 배포/도메인에서는
// 새로 등록해야 한다 — 이 상수만 바꾸면 된다.
export const NAVER_SITE_VERIFICATION = '67bd5c18d46b9d15560d0f3bf97ae865aa4dce6b';

export const SITE_TITLE =
  '네이버 키워드 검색량·경쟁강도 분석 · 상품명 최적화 · 쇼핑 태그 추천 | 키워드 마스터';

export const SITE_DESCRIPTION =
  '네이버 검색광고 API와 오픈 API로 키워드의 PC·모바일 월간 검색량과 경쟁강도를 분석하고, 연관 키워드 추천·상품명 최적화·쇼핑 태그 후보·순위 조회·검색 추이·구매층과 시즌성까지 무료로 확인하는 키워드 마스터. 로그인 없이 바로 쓰고 엑셀로 내보낼 수 있습니다.';

// 페이지의 가시 텍스트(page.tsx)와 JSON-LD(layout.tsx)가 반드시 같은 목록을 참조하게 한다.
// 둘이 따로 관리되면 "화면과 다른 구조화 데이터"가 되어 스팸 판정 리스크가 생긴다.
export const FEATURES = [
  {
    name: '키워드 검색량 조회',
    description: 'PC·모바일·합계 월간 검색수와 모바일 비중을 확인합니다.',
    guideSlug: 'naver-keyword-search-volume',
    icon: '🔍',
  },
  { name: '연관 키워드 추천', description: '검색량 상위 100개를 순위와 함께 보여줍니다.', icon: '🔗' },
  {
    name: '경쟁강도 분석',
    description: '블로그 문서수 ÷ 검색수로 5단계 경쟁강도를 계산합니다.',
    guideSlug: 'naver-blog-competition',
    icon: '⚖️',
  },
  {
    name: '상품명 최적화',
    description: '상품명이 걸리는 검색어를 계산하고 추가할 단어를 A/B로 비교 제안합니다.',
    guideSlug: 'product-name-optimization',
    icon: '✏️',
  },
  {
    name: '쇼핑 태그 최적화',
    description: '태그 슬롯 10개에 넣을 후보를 추천하고 스마트스토어 정책 위반 여부를 검사합니다.',
    guideSlug: 'naver-shopping-tag-count',
    icon: '🏷️',
  },
  {
    name: '다중 상품 일괄 처리',
    description: 'CSV로 여러 상품의 커버리지·태그 후보를 한 번에 계산합니다.',
    icon: '🗂️',
  },
  {
    name: '순위 조회',
    description: '키워드 검색 결과에서 내 블로그·카페 글의 위치를 최대 1000위까지 찾습니다.',
    guideSlug: 'blog-rank-check',
    icon: '📈',
  },
  { name: '검색 추이', description: '최근 12개월 상대 검색 지수를 그래프로 보여줍니다.', icon: '📉' },
  {
    name: '구매층·시즌성',
    description: '구매자 성별·연령 비중과 3년치 월별 추이로 성수기·비수기를 판정합니다.',
    guideSlug: 'keyword-seasonality',
    icon: '🗓️',
  },
] as const;
