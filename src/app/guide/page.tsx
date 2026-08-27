import type { Metadata } from 'next';
import Link from 'next/link';
import { GUIDES } from '@/lib/guides';
import { SITE_NAME, SITE_URL } from '@/lib/site';

const TITLE = `네이버 키워드 · 쇼핑 최적화 가이드 | ${SITE_NAME}`;
const DESCRIPTION =
  '검색량 조회, 경쟁강도 계산, 상품명 최적화, 쇼핑 태그 개수, 블로그 순위 조회, 키워드 시즌성까지 — 키워드 마스터가 실제로 계산하는 방식을 질문 단위로 정리했습니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/guide' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/guide`,
    siteName: SITE_NAME,
    locale: 'ko_KR',
    type: 'website',
  },
};

export default function GuideIndexPage() {
  return (
    <main className="shell">
      <nav className="crumbs" aria-label="breadcrumb">
        <Link href="/">키워드 마스터</Link> <span>›</span> <span aria-current="page">가이드</span>
      </nav>

      <section className="intro">
        <h1>네이버 키워드 · 쇼핑 최적화 가이드</h1>
        <p>{DESCRIPTION}</p>
      </section>

      <ul className="guide-list">
        {GUIDES.map((g) => (
          <li key={g.slug} className="card guide-list-item">
            <Link href={`/guide/${g.slug}`} className="card-pad guide-list-link">
              <h2 className="card-title">{g.question}</h2>
              <p className="card-sub">{g.directAnswer}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
