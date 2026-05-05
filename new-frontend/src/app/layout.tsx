import type { Metadata } from "next";
import { Syne, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jet",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VeldrixAI — Runtime Trust Infrastructure",
  description:
    "Govern every AI output at runtime. Evaluate, enforce, and audit across five trust pillars in under 50ms.",
  openGraph: {
    title: "VeldrixAI",
    description: "Runtime Trust Infrastructure for AI Systems",
    url: "https://veldrixai.ca",
    siteName: "VeldrixAI",
    locale: "en_CA",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${dmSans.variable} ${jetbrains.variable}`}
    >
      <body className="bg-void text-snow font-body antialiased">
        {children}
      </body>
    </html>
  );
}
