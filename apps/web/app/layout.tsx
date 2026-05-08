import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "정부지원사업 멀티에이전트 분석 대시보드",
  description: "공고 검색 → 다중 선택 → 4개 전문가 에이전트 병렬 분석",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
