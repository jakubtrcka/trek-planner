import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hory.app scraper",
  description: "Login + scrape seznamu pohoří"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
