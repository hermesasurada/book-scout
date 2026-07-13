import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "책갈피 | 관심도서 재고·대출 확인",
  description: "알라딘 중고매장과 도서관의 관심도서 상태를 매일 확인합니다.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
