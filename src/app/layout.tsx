import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '키워드 마스터 — 네이버 키워드 검색량 · 경쟁강도 분석',
  description:
    '네이버 검색광고 API 와 오픈 API 로 월간 검색수, 경쟁강도, 연관 키워드, 카테고리, 쇼핑 태그 등록 가능 여부를 한 번에 분석합니다.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
