'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

/** 左侧导航项 */
const NAV_ITEMS: Array<{ href: string; label: string; icon: () => ReactNode; badge?: number }> = [
  { href: '/app/notes', label: '所有笔记', icon: DocIcon },
  { href: '/app/dashboard', label: '统计看板', icon: ChartIcon },
  { href: '/app/analysis', label: '分析报告', icon: BarIcon },
  { href: '/app/reminders', label: '提醒事项', icon: BellIcon, badge: 3 },
];

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
function BarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);

  function logout() {
    localStorage.removeItem('yn_token');
    router.replace('/login');
  }

  const isNotesPage = pathname === '/app/notes' || pathname.startsWith('/app/notes');

  // 获取用户信息用于右上角展示
  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('yn_token') : null;
    if (!t) return;
    fetch(`${location.origin}/api/health`) // 轻探测，确保 base 匹配；忽略结果
      .catch(() => {});
    fetch((process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api') + '/auth/me', {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject(null))
      .then((j) => setUserName(j?.data?.nickname || '用户'))
      .catch(() => setUserName('用户'));
  }, []);

  return (
    <div className="appLayout">
      <header className="topbar">
        <div className="topbarInner">
          <div className="topbarBrand">
            <span className="sidebarLogo">📁</span>
            <span className="sidebarTitle">你的笔记</span>
          </div>
          <nav className="topnav">
            {NAV_ITEMS.map(({ href, label }) => {
              const isActive = pathname === href || (href !== '/app' && pathname.startsWith(href));
              return (
                <Link key={href} href={href} className={`topnavItem ${isActive ? 'active' : ''}`}>
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="topbarActions">
            {!isNotesPage ? (
              <button type="button" className="topbarBtn" title="切换模式">
                <MoonIcon />
              </button>
            ) : null}
            <div className="userBadge">{userName ?? ''}</div>
            <button type="button" className="topbarBtn" onClick={logout}>
              退出
            </button>
          </div>
        </div>
      </header>
      <main className="mainContent">{children}</main>
    </div>
  );
}
