import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'EV 충전기 등록·설치현황',
  description: '한국환경공단 전기차 충전소 정보 OpenAPI 기반 충전기 등록 및 설치현황 조회 서비스',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden>⚡</span>
              <span className="brand-text">EV 충전 인프라</span>
            </Link>
            <nav className="nav">
              <Link href="/">설치현황</Link>
              <Link href="/register">충전기 등록</Link>
            </nav>
          </div>
        </header>
        <main className="container main">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p>
              데이터 출처: 공공데이터포털 · 한국환경공단_전기차 충전소 정보(OpenAPI). 본 서비스는
              참고용이며 실시간 정보와 차이가 있을 수 있습니다.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
