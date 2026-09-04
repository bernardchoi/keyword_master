const API_BASE = 'https://keyword-master-delta.vercel.app';
const PENDING_KEY = 'km_pending_keyword';
const MENU_ID = 'km-analyze-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: '"%s" 키워드 마스터로 분석',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID) return;
  const keyword = (info.selectionText ?? '').trim();
  if (!keyword) return;

  await chrome.storage.local.set({ [PENDING_KEY]: keyword });

  // Chrome 127+ 에서만 동작. 실패하면 배지로 "대기 중"만 표시하고
  // 사용자가 툴바 아이콘을 클릭하면 popup.js 가 대기 중인 키워드를 집어 자동 분석한다.
  try {
    await chrome.action.openPopup();
  } catch {
    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  }
});

// 검색 사이트 오버레이(content.js)가 보내는 분석 요청.
// fetch 는 여기(백그라운드)에서 해야 host_permissions 의 CORS 우회가 적용된다 —
// content script 는 페이지 컨텍스트라 대상 사이트의 CSP/CORS 제약을 그대로 받는다.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'KM_ANALYZE') return undefined;

  (async () => {
    const [analyzeRes, trendRes] = await Promise.allSettled([
      fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: msg.keyword, limit: 30 }),
      }).then(async (r) => ({ ok: r.ok, body: await r.json() })),
      fetch(`${API_BASE}/api/trend?keyword=${encodeURIComponent(msg.keyword)}&months=12`).then(
        (r) => r.json(),
      ),
    ]);

    sendResponse({
      analyze:
        analyzeRes.status === 'fulfilled' && analyzeRes.value.ok ? analyzeRes.value.body : null,
      analyzeError:
        analyzeRes.status === 'fulfilled'
          ? analyzeRes.value.ok
            ? null
            : (analyzeRes.value.body?.error ?? '분석에 실패했습니다.')
          : String(analyzeRes.reason),
      trend: trendRes.status === 'fulfilled' ? trendRes.value : null,
    });
  })();

  return true; // 비동기 sendResponse 를 위해 채널을 열어 둔다
});
