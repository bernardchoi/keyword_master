const API_BASE = 'https://keyword-master-delta.vercel.app';
const HISTORY_KEY = 'km_history';
const PENDING_KEY = 'km_pending_keyword';
const MAX_HISTORY = 8;

const form = document.getElementById('search-form');
const input = document.getElementById('keyword-input');
const historyEl = document.getElementById('history');
const statusEl = document.getElementById('status');
const noticeEl = document.getElementById('notice');
const resultWrap = document.getElementById('result-wrap');
const resultBody = document.getElementById('result-body');
const metaTotal = document.getElementById('meta-total');
const metaTook = document.getElementById('meta-took');

function fmt(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return Math.round(value).toLocaleString('ko-KR');
}

function setStatus(text, isError = false) {
  if (!text) {
    statusEl.hidden = true;
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function setNotice(text) {
  if (!text) {
    noticeEl.hidden = true;
    return;
  }
  noticeEl.hidden = false;
  noticeEl.textContent = text;
}

async function loadHistory() {
  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);
  return history;
}

async function pushHistory(keyword) {
  const history = await loadHistory();
  const next = [keyword, ...history.filter((k) => k !== keyword)].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
  renderHistory(next);
}

function renderHistory(history) {
  historyEl.innerHTML = '';
  for (const kw of history) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = kw;
    btn.addEventListener('click', () => {
      input.value = kw;
      runAnalysis(kw);
    });
    historyEl.appendChild(btn);
  }
}

function renderRows(rows) {
  resultBody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.isSeed) tr.classList.add('seed');

    const grade = row.competition?.grade;
    const docs = row.docs?.blog;

    tr.innerHTML = `
      <td>${row.rank}</td>
      <td>${row.keyword}${row.masked ? ' <10' : ''}</td>
      <td>${fmt(row.pcSearches)}</td>
      <td>${fmt(row.mobileSearches)}</td>
      <td>${fmt(row.totalSearches)}</td>
      <td>${fmt(docs)}</td>
      <td class="grade grade-${grade ?? ''}">${grade ?? '–'}</td>
    `;
    resultBody.appendChild(tr);
  }
}

async function runAnalysis(keywordRaw) {
  const keyword = keywordRaw.trim();
  if (!keyword) return;

  input.value = keyword;
  resultWrap.hidden = true;
  setNotice('');
  setStatus('분석 중…');
  form.querySelector('button').disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, limit: 50 }),
    });
    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error ?? '분석에 실패했습니다.', true);
      return;
    }

    setStatus('');
    setNotice(data.notice);
    metaTotal.textContent = `연관 키워드 ${data.totalRelated.toLocaleString('ko-KR')}개 중 ${data.rows.length}개`;
    metaTook.textContent = `${(data.tookMs / 1000).toFixed(1)}초`;
    renderRows(data.rows);
    resultWrap.hidden = false;

    await pushHistory(keyword);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : '네트워크 오류가 발생했습니다.', true);
  } finally {
    form.querySelector('button').disabled = false;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  runAnalysis(input.value);
});

(async () => {
  chrome.action.setBadgeText({ text: '' });
  renderHistory(await loadHistory());

  // 우클릭 컨텍스트 메뉴로 넘어온 키워드가 있으면 자동 분석
  const { [PENDING_KEY]: pending } = await chrome.storage.local.get(PENDING_KEY);
  if (pending) {
    await chrome.storage.local.remove(PENDING_KEY);
    runAnalysis(pending);
  } else {
    input.focus();
  }
})();
