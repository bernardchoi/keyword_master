import type { MetadataRoute } from 'next';
import { GUIDES } from '@/lib/guides';
import { CONTENT_REVIEWED_AT, SITE_URL } from '@/lib/site';

// 새 콘텐츠 유형(가이드 등)을 만들면 여기 넣는 것까지가 출시다 — 빠뜨리면
// 그 유형이 몇 달씩 색인 밖에 머문다(seo.md 실측 사례).
export default function sitemap(): MetadataRoute.Sitemap {
  const guideModified = new Date(CONTENT_REVIEWED_AT);

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/guide`,
      lastModified: guideModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/audit`,
      lastModified: guideModified,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    ...GUIDES.map((g) => ({
      url: `${SITE_URL}/guide/${g.slug}`,
      lastModified: guideModified,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
