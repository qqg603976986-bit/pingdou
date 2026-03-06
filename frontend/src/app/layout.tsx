/**
 * 全局布局组件 — 所有页面共享的外壳
 *
 * 🔧 可修改项:
 *   - metadata.title: 浏览器标签页标题
 *   - metadata.description: SEO 描述
 *   - lang="zh-CN": 页面语言
 *   - 字体: JetBrains Mono（英文/数字）+ Microsoft JhengHei（中文）
 *   - body className: antialiased 开启字体抗锯齿
 */
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

/* 🔧 英文/数字字体 — JetBrains Mono 等宽字体
   通过 CSS 变量 --font-jetbrains-mono 注入
   中文字体 Microsoft JhengHei 为系统字体，在 globals.css 中通过 font-family 回退链指定 */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

/* 🔧 页面 SEO 元信息 */
export const metadata: Metadata = {
  title: "Popbeads拼豆图纸生成",            // 浏览器标签标题
  description: "将图片转换为精美的像素画和拼豆图纸", // 搜索引擎描述
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /* 🔧 lang: 页面语言，影响浏览器朗读和搜索引擎 */
    <html lang="zh-CN">
      {/* 🔧 body 样式:
          字体变量注入: jetbrainsMono.variable
          antialiased: 字体抗锯齿，使文字更平滑 */}
      <body
        className={`${jetbrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
