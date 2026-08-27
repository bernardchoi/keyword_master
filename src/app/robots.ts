import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// 무정책(기본값)은 우연에 맡기는 것이다(geo.md). 인용 유입을 원하므로
// 생성엔진 크롤러를 명시적으로 허용한다. 네이버 Yeti는 '*' 규칙에 이미 포함된다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: '/api/' },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'OAI-SearchBot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'Yeti', allow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
