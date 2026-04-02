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
  const [user, setUser] = useState<{ id: string; nickname: string; email: string } | null>(null);

  function logout() {
    localStorage.removeItem('yn_token');
    router.replace('/login');
  }

  const isNotesPage = pathname === '/app/notes' || pathname.startsWith('/app/notes');

  useEffect(() => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('yn_token') : null;
    if (!t) return;
    fetch((process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api') + '/auth/me', {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject(null))
      .then((j) => {
        const userData = j?.data || j;
        setUser({
          id: userData?.id || '未知ID',
          nickname: userData?.nickname || '用户',
          email: userData?.email || 'unknown@example.com'
        });
      })
      .catch(() => setUser({ id: 'N/A', nickname: '用户', email: '-' }));
  }, []);

  return (
    <div className="appLayout">
      <header className="topbar">
        <div className="topbarInner">
          <Link href="/app/notes" className="topbarBrand">
            <span style={{ fontSize: '1.5rem' }}>📓</span>
            <span className="sidebarTitle">你的笔记</span>
          </Link>
          <nav className="topnav">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || (href !== '/app' && pathname.startsWith(href));
              return (
                <Link key={href} href={href} className={`topnavItem ${isActive ? 'active' : ''}`}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icon />
                    {label}
                  </span>
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
            <Link 
              href="/app/profile" 
              className="userBadge" 
              title={`昵称: ${user?.nickname || '用户'}\n用户ID: ${user?.id || 'N/A'}`}
              style={{ textDecoration: 'none' }}
            >
              <span style={{ opacity: 0.6, marginRight: '4px' }}>👤</span>
              <span style={{ fontWeight: 700 }}>{user?.email || '加载中...'}</span>
            </Link>
            <button type="button" className="btn" style={{ padding: '6px 12px' }} onClick={logout}>
              退出
            </button>
          </div>
        </div>
      </header>
      <main className="mainContent">{children}</main>
    </div>
  );
}
