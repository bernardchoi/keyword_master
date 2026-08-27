import type { Metadata } from 'next';
import './globals.css';
import {
  FEATURES,
  NAVER_SITE_VERIFICATION,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  // 네이버 서치어드바이저 소유확인(HTML 태그 방식) — <head>에 naver-site-verification 메타 태그로 렌더된다.
  verification: { other: { 'naver-site-verification': NAVER_SITE_VERIFICATION } },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: 'ko_KR',
    type: 'website',
  },
};

// WebApplication 구조화 데이터. FEATURES는 page.tsx의 가시 텍스트와 같은 배열(src/lib/site.ts)을
// 참조한다 — 화면에 없는 내용을 LD에 넣지 않기 위해서다.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  '@id': `${SITE_URL}/#webapp`,
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  inLanguage: 'ko-KR',
  isAccessibleForFree: true,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'KRW',
  },
  featureList: FEATURES.map((f) => f.name),
  provider: {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    // 실제로 존재·공개 확인된 표면만 연결한다(llmo.md) — 확인 안 된 소셜 계정을
    // 지어내면 모델이 엉뚱한 실체와 엔티티를 섞는 역효과가 난다.
    sameAs: ['https://github.com/bernardchoi/keyword_master'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
