# SEO·AEO·GEO·LLMO·NEO 측정 루프

`fire-your-seo-agency` 스킬(Phase 5, [measure.md](../.claude/skills/fire-your-seo-agency/references/measure.md))에
따라 작성. **"고쳤다"로 끝나는 보고는 실패다** — 재측정 날짜까지가 완료 조건이다.

## 기준선 — 2026-08-27 (Phase 1~4 작업 직전 상태)

### 기술 기준선 (코드로 확인 가능, `curl` 재현 가능)

Phase 1 작업 전 프로덕션(`https://keyword-master-delta.vercel.app`)에서 직접 측정:

| 지표 | 값 |
|---|---|
| `<h1>` 개수 | 0 |
| `robots.txt` | 404 |
| `sitemap.xml` | 404 |
| `llms.txt` | 404 |
| JSON-LD 개수 | 0 |
| 사이트맵 URL 수 | — (없음) |
| title 길이 | 31자 |
| description 길이 | 79자 |

### Phase 1~4 작업 후 — 같은 항목 재측정 (✅ 프로덕션에서 직접 확인, 2026-08-27 배포)

| 지표 | 값 |
|---|---|
| `<h1>` 개수 | 1 (홈) + 가이드 페이지마다 1 |
| `robots.txt` | 200, AI 크롤러(GPTBot·PerplexityBot·ClaudeBot·Yeti) 명시 허용 |
| `sitemap.xml` | 200, URL 8개 (홈 1 + 가이드 허브 1 + 가이드 상세 6) |
| `llms.txt` | 200, 가이드 6종 + 데이터 정책 포함 |
| JSON-LD | 홈: WebApplication 1건. 가이드 상세: WebPage + FAQPage 각 1건(총 6쌍), 가시 텍스트와 대조 확인 |
| title 길이 | 50자 |
| description 길이 | 150자 |
| 404 처리 | 정상 404 (soft-404 아님) |
| 기존 기능 회귀 | `/api/status` 200, 키워드 분석 실행 시 `/api/analyze` 정상 응답 (실측: "여름원피스" 월간 검색수 34,570 반환) |

배포: `npx vercel --prod` → `https://keyword-master-delta.vercel.app` (dpl_2Bzq1jDNcjWFHrgJxsPQsqdd3vEh).
위 표는 로컬이 아니라 **이 프로덕션 도메인에 직접 `curl`·브라우저로 확인한 값**이다.

```bash
URL="https://keyword-master-delta.vercel.app"
curl -sL "$URL" | grep -o "<h1[^>]*>.*</h1>"
curl -s -o /dev/null -w '%{http_code}\n' "$URL/robots.txt"
curl -s -o /dev/null -w '%{http_code}\n' "$URL/sitemap.xml"
curl -s -o /dev/null -w '%{http_code}\n' "$URL/llms.txt"
curl -sL "$URL/sitemap.xml" | grep -c "<loc>"
```

### 외부 지표 기준선 — 에이전트가 대신 찍을 수 없는 것 (사용자 계정 필요)

아래는 계정 소유자만 접근 가능해 이 세션에서 값을 채우지 못했다. **사용자가 지금 값을 찍어야
14일 뒤 비교가 가능하다:**

- [ ] Google Search Console: 최근 28일 노출·클릭·평균 순위 (도메인 소유 확인 필요)
- [ ] 네이버 서치어드바이저: 콘텐츠 노출/클릭, 검색어 Top 목록 (미등록 상태로 추정 — 아래 "필요한 사용자 조치" 참고)
- [ ] AI 인용 확인: 아래 질문 6개를 Perplexity·ChatGPT(검색 모드)·네이버 AI 브리핑에 실제로 던져 출처 인용 여부 O/X 기록
  - 네이버 키워드 검색량 어떻게 조회하나요?
  - 네이버 블로그 경쟁강도는 어떻게 계산하나요?
  - 네이버 쇼핑 상품명 최적화는 어떻게 하나요?
  - 네이버 쇼핑 태그는 몇 개까지 등록할 수 있나요?
  - 내 블로그 글 네이버 검색 순위 확인하는 법
  - 키워드 시즌성(성수기 비수기) 확인하는 법
- [ ] 색인 수: `site:keyword-master-delta.vercel.app` 구글 검색 결과 수

## 필요한 사용자 조치 (에이전트가 대신할 수 없음)

1. **Google Search Console**: 프로퍼티 등록 → 소유 확인(DNS 또는 메타 태그) → `sitemap.xml` 제출
2. **네이버 서치어드바이저** (searchadvisor.naver.com): 사이트 등록 → 소유 확인 → 사이트맵 제출 →
   신규 가이드 페이지 6종 수동 수집 요청 (등록 직후 색인 가속)
3. 두 도구 모두 등록 후 **주 1회** 노출/클릭 스냅샷을 이 문서 하단 "재측정 로그"에 추가

## 재측정 예약

- **1차 재측정: 2026-09-10** (변경일 2026-08-27 + 14일, 집계 지연 감안해 최근 2~3일은 비교에서 제외)
- 이후 GSC·서치어드바이저 지표는 주 1회, AI 인용 확인은 분기 1회(LLMO 특성상 느리게 쌓임)

## 재측정 로그

```
[기준선] 2026-08-27: 노출 — (GSC 미등록) · 클릭 — (GSC 미등록) · AI 인용 0/6 (미확인, 위 질문 미실행)
[변경] 2026-08-27: h1·메타 확장·JSON-LD·sitemap·robots·llms.txt·가이드 랜딩 6종·FAQ LD
[재측정 예약] 2026-09-10
[재측정 결과] (여기에 채운다 — 이게 나와야 완료)
```

## 하지 않은 것과 이유

- **네이버 서치어드바이저·GSC 등록**: 사용자 네이버·구글 계정 소유 확인이 필요해 에이전트가 대신할 수 없다.
- **OG 이미지**: `public/`에 실제 이미지 자산이 없어 존재하지 않는 파일을 메타에 넣지 않았다.
- **블로그 투트랙(inside/outside, NEO §3)**: 네이버 블로그 채널 자체가 없어(브랜드 블로그 미보유)
  이번 스프린트 범위 밖. 필요하면 별도로 논의.
- **위키류·뉴스 표면(LLMO §2)**: 실재하지 않는 위키 문서·보도자료를 지어내 링크하지 않았다. 실제
  작성 시 [layout.tsx](../src/app/layout.tsx)의 `sameAs`에 추가한다.
