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
      </body>
    </html>
  );
}
