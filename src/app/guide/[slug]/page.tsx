import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GUIDES, getGuide } from '@/lib/guides';
import { CONTENT_REVIEWED_AT, SITE_NAME, SITE_URL } from '@/lib/site';

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  return {
    title: `${guide.question} | ${SITE_NAME}`,
    description: guide.directAnswer,
    alternates: { canonical: `/guide/${guide.slug}` },
    openGraph: {
      title: guide.question,
      description: guide.directAnswer,
      url: `${SITE_URL}/guide/${guide.slug}`,
      siteName: SITE_NAME,
      locale: 'ko_KR',
      type: 'article',
    },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const pageUrl = `${SITE_URL}/guide/${guide.slug}`;

  // FAQPage JSON-LD — 아래 <dl className="faq">가 렌더링하는 질문·답변과 글자까지 동일해야 한다.
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: guide.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  // WebPage — 이 페이지가 무엇에 대한 1차 설명인지, 어느 조직이 만들었는지 선언.
  // @id는 layout.tsx의 Organization/WebApplication 선언과 같은 값을 참조한다(엔티티 통일).
  const webPageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${pageUrl}#webpage`,
    url: pageUrl,
    name: guide.question,
    description: guide.directAnswer,
    inLanguage: 'ko-KR',
    dateModified: CONTENT_REVIEWED_AT,
    isPartOf: { '@id': `${SITE_URL}/#webapp` },
    about: { '@id': `${SITE_URL}/#webapp` },
  };

  return (
    <main className="shell">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      <nav className="crumbs" aria-label="breadcrumb">
        <Link href="/">키워드 마스터</Link> <span>›</span>{' '}
        <Link href="/guide">가이드</Link> <span>›</span> <span aria-current="page">{guide.shortTitle}</span>
      </nav>

      <article className="guide">
        <h1>{guide.question}</h1>
        <p className="guide-answer">{guide.directAnswer}</p>

        <dl className="fact-grid">
          {guide.facts.map((f) => (
            <div className="fact-row" key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>

        {guide.sections.map((s) => (
          <section key={s.heading} className="guide-section">
            <h2>{s.heading}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {s.table && (
              <div className="table-scroll">
                <table className="guide-table">
                  <thead>
                    <tr>
                      {s.table.headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.table.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}

        <section className="guide-section">
          <h2>자주 묻는 질문</h2>
          <dl className="faq">
            {guide.faqs.map((f) => (
              <div key={f.q} className="faq-item">
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="guide-meta">기준일 {CONTENT_REVIEWED_AT} · 코드의 실제 계산식과 대조 확인</p>

        <Link href="/" className="btn primary guide-cta">
          {guide.ctaLabel} →
        </Link>
      </article>
    </main>
  );
}
