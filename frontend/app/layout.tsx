import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "工友权益助手 · 遇到劳动权益问题，不用先懂法律",
    template: "%s · 工友权益助手",
  },
  description:
    "面向河南建筑工人的劳动权益 Agent：用日常语言描述欠薪遭遇，逐步追问、检索法律、生成行动指南，并辅助完成官方平台填报。",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0e2f54",
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
