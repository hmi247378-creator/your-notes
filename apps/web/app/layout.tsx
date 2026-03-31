import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: '你的笔记',
  description: '智能多级标签笔记系统',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

