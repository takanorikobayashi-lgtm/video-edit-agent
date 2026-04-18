import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Edit Agent",
  description: "AI動画編集エージェント",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
        <header className="border-b px-6 py-3 flex items-center gap-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <span className="text-lg font-bold">🎬 Video Edit Agent</span>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
