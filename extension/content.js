// 검색 포털·쇼핑몰 검색결과 페이지에 떠 있는 플로팅 버튼 → 클릭 시 분석 패널.
// 페이지 로드 시 자동으로 API 를 부르지 않는다 (버튼을 눌러야 fetch 발생) — 쿼터 절약.
(() => {
  if (window.__kmOverlayInjected) return;
  window.__kmOverlayInjected = true;

  const WEB_BASE = 'https://keyword-master-delta.vercel.app';

  // 일부 사이트(11번가 확인됨)는 쿼리 파라미터 값을 이중으로 URL 인코딩해서 내려준다.
  // URLSearchParams 는 한 겹만 디코드하므로, 남은 한 겹은 여기서 걷어낸다.
  // "%XX%XX..." 형태로만 이루어진 문자열일 때만 디코드해서, 키워드에 실제로
  // '%' 가 들어있는 경우(예: "20% 할인")까지 잘못 건드리지 않는다.
  function decodeExtra(v) {
    if (v && /^(%[0-9A-Fa-f]{2})+$/.test(v)) {
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
    return v;
  }

  function extractKeyword() {
    const { hostname, pathname, search } = location;
    const p = new URLSearchParams(search);
    if (hostname === 'search.naver.com' && pathname.startsWith('/search.naver')) return p.get('query');
    if (hostname.endsWith('shopping.naver.com')) return p.get('query');
    if (hostname === 'www.coupang.com' && pathname.startsWith('/np/search')) return p.get('q');
    if (hostname === 'www.gmarket.co.kr' && pathname.startsWith('/n/search')) return p.get('keyword');
    if (hostname === 'search.11st.co.kr' && pathname.startsWith('/pc/total-search')) return p.get('kwd');
    return null;
  }

  let keyword = decodeExtra((extractKeyword() ?? '').trim()).trim();
  if (!keyword) return;

  const cache = new Map();

  function fmt(v) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '–';
    return Math.round(v).toLocaleString('ko-KR');
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) node.appendChild(c);
    return node;
  }

  // ── shadow root: 페이지 CSS 로부터 완전히 격리 ─────────────────────
  const hostEl = document.createElement('div');
  hostEl.id = 'km-ext-host';
  hostEl.style.all = 'initial';
  document.documentElement.appendChild(hostEl);
  const root = hostEl.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host, * { box-sizing: border-box; }
    .km-fab {
      all: initial;
      position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
      font: 600 13px/1 -apple-system, "Segoe UI", system-ui, sans-serif;
      background: #2563eb; color: #fff; padding: 11px 16px; border-radius: 999px;
      box-shadow: 0 4px 14px rgba(0,0,0,.25); cursor: pointer; user-select: none;
    }
    .km-fab:hover { background: #1d4ed8; }
    .km-fab[hidden] { display: none; }
    .km-fab.active { background: #1e40af; }
    .km-panel {
      all: initial;
      position: fixed; right: 20px; bottom: 70px; z-index: 2147483647;
      width: 320px; max-height: 70vh; overflow-y: auto;
      background: #fff; color: #1a1a1a; border-radius: 10px;
      box-shadow: 0 8px 30px rgba(0,0,0,.3); border: 1px solid #e5e7eb;
      font: 13px/1.45 -apple-system, "Segoe UI", system-ui, sans-serif;
      padding: 12px;
    }
    .km-panel[hidden] { display: none; }
    @media (prefers-color-scheme: dark) {
      .km-panel { background: #18181b; color: #f4f4f5; border-color: #3f3f46; }
    }
    .km-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .km-head strong { font-size: 14px; }
    .km-close { all: initial; cursor: pointer; color: #9ca3af; font-size: 13px; padding: 2px 4px; }
    .km-close:hover { color: #ef4444; }
    .km-status { color: #6b7280; padding: 10px 2px; }
    .km-status.km-error { color: #dc2626; }
    .km-notice {
      background: rgba(37,99,235,.08); border: 1px solid rgba(37,99,235,.25);
      border-radius: 6px; padding: 6px 8px; font-size: 11px; color: #6b7280; margin-bottom: 8px;
    }
    .km-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
    .km-stat { display: flex; flex-direction: column; align-items: center; background: rgba(127,127,127,.08); border-radius: 6px; padding: 6px 2px; }
    .km-stat-value { font-weight: 700; font-size: 13px; }
    .km-stat-label { font-size: 10px; color: #6b7280; margin-top: 2px; }
    .km-grade-최고 .km-stat-value { color: #059669; }
    .km-grade-좋음 .km-stat-value { color: #16a34a; }
    .km-grade-보통 .km-stat-value { color: #ca8a04; }
    .km-grade-나쁨 .km-stat-value { color: #dc2626; }
    .km-grade-최악 .km-stat-value { color: #991b1b; }
    .km-section-title { font-size: 11px; color: #6b7280; font-weight: 600; margin: 10px 0 5px; }
    .km-spark { width: 100%; height: 56px; display: block; }
    .km-spark-line { fill: none; stroke: #2563eb; stroke-width: 1.8; }
    .km-spark-dot { fill: #2563eb; }
    .km-bars { display: flex; flex-direction: column; gap: 5px; }
    .km-bar-row { position: relative; height: 22px; border-radius: 4px; overflow: hidden; background: rgba(127,127,127,.08); }
    .km-bar { position: absolute; inset: 0 auto 0 0; background: rgba(37,99,235,.25); border-radius: 4px; }
    .km-bar-label { position: absolute; left: 6px; top: 3px; font-size: 11px; z-index: 1; }
    .km-bar-value { position: absolute; right: 6px; top: 3px; font-size: 11px; color: #6b7280; z-index: 1; }
    .km-footer-link {
      all: initial; display: block; text-align: center; margin-top: 10px; padding-top: 8px;
      border-top: 1px solid rgba(127,127,127,.2); color: #2563eb; font-size: 11.5px; cursor: pointer;
    }
    .km-footer-link:hover { text-decoration: underline; }
  `;
  root.appendChild(style);

  const toggleBtn = el('button', { class: 'km-fab', type: 'button', text: '📊 키워드 분석' });
  root.appendChild(toggleBtn);

  const panel = el('div', { class: 'km-panel' });
  panel.hidden = true;
  root.appendChild(panel);

  let open = false;
  // SPA 검색도 새 URL의 검색어를 따른다. 패널을 열기 전에는 API를 호출하지 않는다.
  setInterval(() => {
    const next = decodeExtra((extractKeyword() ?? '').trim()).trim();
    if (next === keyword) return;
    keyword = next;
    toggleBtn.hidden = !keyword;
    if (!keyword) { open = false; panel.hidden = true; toggleBtn.classList.remove('active'); }
    else if (open) void loadData();
  }, 1000);
  toggleBtn.addEventListener('click', () => {
    open = !open;
    panel.hidden = !open;
    toggleBtn.classList.toggle('active', open);
    if (open) loadData();
  });

  function closeBtn() {
    const b = el('button', { class: 'km-close', type: 'button', text: '✕' });
    b.addEventListener('click', () => {
      open = false;
      panel.hidden = true;
      toggleBtn.classList.remove('active');
    });
    return b;
  }

  function head() {
    return el('div', { class: 'km-head' }, [el('strong', { text: keyword }), closeBtn()]);
  }

  function renderLoading() {
    panel.innerHTML = '';
    panel.appendChild(head());
    panel.appendChild(el('div', { class: 'km-status', text: '분석 중…' }));
  }

  function renderError(message) {
    panel.innerHTML = '';
    panel.appendChild(head());
    panel.appendChild(el('div', { class: 'km-status km-error', text: message }));
  }

  const pending = new Map();
  async function loadData() {
    const requestedKeyword = keyword;
    if (cache.has(keyword)) {
      render(cache.get(keyword));
      return;
    }
    renderLoading();
    let res;
    try {
      if (!pending.has(requestedKeyword)) pending.set(requestedKeyword, chrome.runtime.sendMessage({ type: 'KM_ANALYZE', keyword: requestedKeyword }));
      res = await pending.get(requestedKeyword);
    } catch {
      if (keyword === requestedKeyword) renderError('확장이 새로고침된 것 같습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
      return;
    } finally {
      pending.delete(requestedKeyword);
    }
    if (res?.analyze) cache.set(requestedKeyword, res);
    if (keyword === requestedKeyword) render(res);
  }

  function statBox(label, value, gradeClass) {
    const box = el('div', { class: 'km-stat' }, [
      el('span', { class: 'km-stat-value', text: String(value) }),
      el('span', { class: 'km-stat-label', text: label }),
    ]);
    if (gradeClass) box.classList.add(gradeClass);
    return box;
  }

  function sparkline(points) {
    const w = 296;
    const h = 56;
    const pad = 4;
    const vals = points.map((p) => p.ratio);
    const max = Math.max(...vals, 1);
    const min = Math.min(...vals, 0);
    const range = max - min || 1;
    const stepX = (w - pad * 2) / Math.max(points.length - 1, 1);
    const coords = points.map((p, i) => [
      pad + i * stepX,
      h - pad - ((p.ratio - min) / range) * (h - pad * 2),
    ]);
    const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const [lx, ly] = coords[coords.length - 1];

    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('class', 'km-spark');
    const pathEl = document.createElementNS(svgNs, 'path');
    pathEl.setAttribute('d', path);
    pathEl.setAttribute('class', 'km-spark-line');
    svg.appendChild(pathEl);
    const dot = document.createElementNS(svgNs, 'circle');
    dot.setAttribute('cx', String(lx));
    dot.setAttribute('cy', String(ly));
    dot.setAttribute('r', '2.5');
    dot.setAttribute('class', 'km-spark-dot');
    svg.appendChild(dot);
    return svg;
  }

  function footerLink() {
    return el('a', {
      class: 'km-footer-link',
      href: `${WEB_BASE}/?q=${encodeURIComponent(keyword)}`,
      target: '_blank',
      rel: 'noopener',
      text: '전체 화면에서 분석 열기 ↗',
    });
  }

  function render(res) {
    panel.innerHTML = '';
    panel.appendChild(head());

    if (!res?.analyze) {
      panel.appendChild(
        el('div', { class: 'km-status km-error', text: res?.analyzeError ?? '데이터를 가져오지 못했습니다.' }),
      );
      panel.appendChild(footerLink());
      return;
    }

    const { analyze, trend } = res;
    const seed = analyze.seed ?? null;

    if (analyze.notice) {
      panel.appendChild(el('div', { class: 'km-notice', text: analyze.notice }));
    }

    if (seed) {
      const grade = seed.competition?.grade;
      const summary = el('div', { class: 'km-summary' }, [
        statBox('PC', fmt(seed.pcSearches)),
        statBox('모바일', fmt(seed.mobileSearches)),
        statBox('합계', `${seed.masked ? '< ' : ''}${fmt(seed.totalSearches)}`),
        statBox('경쟁강도', grade ?? '–', grade ? `km-grade-${grade}` : undefined),
      ]);
      panel.appendChild(summary);
    } else {
      panel.appendChild(el('div', { class: 'km-notice', text: '입력한 키워드의 정확한 검색수는 제공되지 않았습니다.' }));
    }

    // 마지막 달이 진행 중(partial)이면 며칠치만 집계된 값이라 그대로 이으면
    // 검색량이 폭락한 것처럼 보인다 (웹앱 TrendChart 와 동일한 이유로 제외).
    const settledPoints = (trend?.points ?? []).filter((p) => !p.partial);
    if (settledPoints.length > 1) {
      panel.appendChild(el('div', { class: 'km-section-title', text: '최근 검색 추이 (진행 중인 달 제외)' }));
      panel.appendChild(sparkline(settledPoints));
    }

    const rows = analyze.rows.filter((r) => !r.isSeed).slice(0, 8);
    if (rows.length) {
      panel.appendChild(el('div', { class: 'km-section-title', text: `연관 키워드 TOP ${rows.length}` }));
      const max = Math.max(...rows.map((r) => r.totalSearches), 1);
      const list = el('div', { class: 'km-bars' });
      for (const r of rows) {
        const bar = el('div', { class: 'km-bar' });
        bar.style.width = `${Math.max(4, (r.totalSearches / max) * 100)}%`;
        list.appendChild(
          el('div', { class: 'km-bar-row' }, [
            bar,
            el('span', { class: 'km-bar-label', text: r.keyword }),
            el('span', { class: 'km-bar-value', text: `${r.masked ? '< ' : ''}${fmt(r.totalSearches)}` }),
          ]),
        );
      }
      panel.appendChild(list);
    }

    panel.appendChild(footerLink());
  }
})();
