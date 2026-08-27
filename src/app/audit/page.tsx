import type { Metadata } from 'next';
import Link from 'next/link';
import AuditTool from '@/components/AuditTool';
import { SITE_NAME, SITE_URL } from '@/lib/site';

const TITLE = `무료 SEO·GEO 진단 — 내 스마트스토어·블로그 크롤러 눈 체크 | ${SITE_NAME}`;
const DESCRIPTION =
  '내 스마트스토어·블로그·홈페이지 URL을 입력하면 구글·네이버 크롤러와 ChatGPT 같은 생성 AI의 눈으로 h1·메타·robots.txt·sitemap.xml·JSON-LD·llms.txt를 무료로 진단합니다. 가입 없이 바로 확인하세요.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/audit' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/audit`,
    siteName: SITE_NAME,
    locale: 'ko_KR',
    type: 'website',
  },
};

export default function AuditPage() {
  return (
    <main className="shell">
      <nav className="crumbs" aria-label="breadcrumb">
        <Link href="/">키워드 마스터</Link> <span>›</span> <span aria-current="page">SEO 진단</span>
      </nav>

      <section className="intro">
        <h1>내 사이트 SEO·GEO 무료 진단</h1>
        <p>{DESCRIPTION}</p>
      </section>

      <AuditTool />

      <p className="guide-meta" style={{ marginTop: 18 }}>
        여기서 확인하는 SEO·GEO는 자바스크립트 없이 서버가 직접 읽어 기계적으로 판정할 수 있는
        항목만입니다. 답변엔진(AEO) 인용 여부, 모델이 브랜드를 아는지(LLMO), 네이버 서치어드바이저
        등록 상태(NEO)는 계정 접근이나 실제 AI 질의가 필요해 자동 진단에 포함하지 않았습니다 — 이
        서비스가 자기 자신에게 적용한 전체 다섯 레인 진단은{' '}
        <Link href="/guide">가이드</Link>에서 방법론을 볼 수 있습니다.
      </p>
    </main>
  );
}
