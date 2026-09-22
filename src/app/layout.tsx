import type { Metadata } from "next";
import "./globals.css";

// 日本語UIが中心のため、ビルド時にGoogle Fontsを取得する next/font/google ではなく
// OSの標準フォント(日本語グリフを含む)を使う。オフライン/プロキシ環境でもビルドが安定する。

export const metadata: Metadata = {
  title: "Synclie",
  description: "オンデマンド学習をインタラクティブに、独習を個別最適に。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
