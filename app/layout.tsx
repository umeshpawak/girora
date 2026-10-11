import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import logo from "./logo.png";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Girora — Mindful Travel & Group Adventures",
  description: "Plan budget-friendly trips, discover authentic itineraries, and find travel companions with Girora.",
  icons: {
    icon: logo.src,
    apple: logo.src,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
