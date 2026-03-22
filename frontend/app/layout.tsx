import type { Metadata } from "next";
import { Syne, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const displayFont = Syne({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
});

const bodyFont = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-body",
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "VeldrixAI — Runtime Trust Infrastructure for AI Systems",
  description:
    "Govern every AI response. Intercept every agent action. Prove every decision.",
  keywords: [
    "AI governance",
    "runtime trust",
    "AI safety",
    "agent interception",
    "LLM guardrails",
    "AI compliance",
  ],
  openGraph: {
    title: "VeldrixAI — Runtime Trust Infrastructure",
    description: "The control layer between your AI and the real world.",
    url: "https://veldrix.ai",
    siteName: "VeldrixAI",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
