import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "GreenBridge AI — Nền Tảng Logistics Xanh & Tối Ưu Tuyến Đường B2B/B2C",
  description: "Hệ thống quản lý logistics xanh, tối ưu tuyến đường VRP, tích điểm bao bì tái chế và báo cáo phát thải CO₂.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
