import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { OfflineBanner } from "@/components/OfflineBanner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "Church Parking", template: "%s | Church Parking" },
  description: "Check in your car and get your parking pass.",
  applicationName: "Church Parking",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Church Parking", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#141414",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh antialiased">
        {children}
        <OfflineBanner />
        {/* Browser tests only (the variable is set by playwright.config.ts, never in production): Next's development overlay can sit
            over a button at the bottom of the screen and swallow the click, so the tests hide it. */}
        {process.env.E2E_HIDE_DEV_OVERLAY === "1" && <style>{"nextjs-portal{display:none!important}"}</style>}
      </body>
    </html>
  );
}
