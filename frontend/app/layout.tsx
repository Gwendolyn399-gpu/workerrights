import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "工友权益助手",
    template: "%s · 工友权益助手",
  },
  description:
    "面向河南建筑工人的欠薪维权辅助：用日常语言描述遭遇，逐步整理事实、检索法律、生成行动指南，并辅助官方平台填报。",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#f4efe2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
