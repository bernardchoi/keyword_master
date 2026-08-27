'use client';

import { useState } from 'react';
import type { AuditCheck, AuditReport } from '@/lib/audit';

const STATUS_LABEL: Record<AuditCheck['status'], string> = {
  pass: '✅ 통과',
  warn: '⚠️ 확인 필요',
  fail: '❌ 문제',
};

function CheckRow({ c }: { c: AuditCheck }) {
  return (
    <li className={`audit-check audit-check--${c.status}`}>
      <span className="audit-check-status">{STATUS_LABEL[c.status]}</span>
      <span className="audit-check-body">
        <strong>{c.label}</strong>
        <span className="audit-check-detail">{c.detail}</span>
      </span>
    </li>
  );
}

export default function AuditTool() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);

  const run = async () => {
    if (!url.trim()) {
      setError('진단할 URL을 입력해 주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '진단에 실패했습니다.');
      setReport(json as AuditReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : '진단에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-pad">
          <div className="srow">
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="audit-url">진단할 URL</label>
              <input
                id="audit-url"
                className="input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="내 스마트스토어, 블로그, 홈페이지 주소 (예: myshop.com)"
                onKeyDown={(e) => e.key === 'Enter' && run()}
              />
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <button type="button" className="btn primary" onClick={run} disabled={loading}>
                {loading ? '진단 중…' : '진단하기'}
              </button>
            </div>
          </div>
          <p className="footnote" style={{ marginTop: 10 }}>
            자바스크립트 없이 서버가 직접 페이지를 받아 확인합니다(크롤러 눈 기준). 로그인이 필요한
            페이지, 클라이언트 렌더링으로만 채워지는 콘텐츠는 실제보다 낮게 나올 수 있습니다.
          </p>
        </div>
      </div>

      {error && <div className="notice err">{error}</div>}

      {report && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head">
              <div>
                <h2 className="card-title">진단 결과</h2>
                <p className="card-sub">{report.targetUrl}</p>
              </div>
              <span className="spacer" />
              <span className="badge ok">통과 {report.summary.pass}</span>
              <span className="badge warn">확인 {report.summary.warn}</span>
              {report.summary.fail > 0 && <span className="badge err">문제 {report.summary.fail}</span>}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head">
              <h2 className="card-title">SEO</h2>
              <p className="card-sub">구글·네이버 크롤러가 콘텐츠를 읽고 색인할 수 있는가</p>
            </div>
            <ul className="audit-list">
              {report.seo.map((c) => (
                <CheckRow key={c.id} c={c} />
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="card-head">
              <h2 className="card-title">GEO</h2>
              <p className="card-sub">ChatGPT·Perplexity 같은 생성 AI가 브라우징할 때 인용할 수 있는가</p>
            </div>
            <ul className="audit-list">
              {report.geo.map((c) => (
                <CheckRow key={c.id} c={c} />
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
