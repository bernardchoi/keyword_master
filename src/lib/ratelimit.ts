/**
 * NAVER API HUB 호출 게이트.
 *
 * 한도는 **API 키 단위 50 RPS** 라서 검색·데이터랩·쇼핑인사이트가 한 통에 담긴다.
 * 예전에는 쇼핑인사이트만 스스로 속도를 줄였는데, 키워드 분석(블로그 문서수)과
 * 카테고리 분류가 겹쳐 돌면 합계가 한도를 넘었다.
 *
 * 실측 (2026-08, 블로그 검색 동시 호출):
 *   40 병렬 → 40 성공
 *   120 병렬 → 83 성공 / 37 실패 `429 {"errorCode":"420","message":"Rate Limited"}`
 *
 * 429 는 조용히 값을 비우는 게 아니라 재시도해야 한다. 문서수가 빠지면
 * 표가 통째로 `–` 가 되고, 카테고리 추정에서는 엉뚱한 분야가 1위로 올라온다.
 */

/** 호출 시작 간격. 1000/40 = 25 RPS — 한도의 절반. */
const MIN_GAP_MS = 40;

let gate: Promise<void> = Promise.resolve();
let lastStart = 0;

/** 모든 API HUB 호출이 이 문을 지나 최소 간격을 두고 나간다. */
export function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const slot = gate.then(async () => {
    const wait = lastStart + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
  });
  // 앞 호출이 터져도 줄은 계속 서야 한다.
  gate = slot.catch(() => undefined);
  return slot.then(fn);
}

const RETRY_DELAYS_MS = [400, 1200];

/** 429·5xx 면 물러섰다가 다시 시도한다. `shouldRetry` 가 참인 응답만 대상. */
export async function withRetry(
  send: () => Promise<Response>,
  shouldRetry: (res: Response) => boolean = (res) =>
    res.status === 429 || res.status >= 500,
): Promise<Response> {
  let res = await schedule(send);

  for (const delay of RETRY_DELAYS_MS) {
    if (!shouldRetry(res)) return res;
    await new Promise((r) => setTimeout(r, delay));
    res = await schedule(send);
  }
  return res;
}
