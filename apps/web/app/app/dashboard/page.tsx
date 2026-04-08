'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { QuickInputModal } from '@/components/QuickInputModal';
import type { TagNode } from '@/components/TagTree';
import type { NoteItem } from '@/components/NoteList';
import dynamic from 'next/dynamic';

// 动态路由导入 Recharts，防止 SSR 阶段 ReferenceError: self is not defined
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false });
const LineChart = dynamic(() => import('recharts').then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import('recharts').then((m) => m.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then((m) => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false });

type NotesResp = { items: NoteItem[]; total: number };
type TagCountsResp = { counts: Record<string, number> };

function findTagNameById(tags: TagNode[], id: string): string | null {
  for (const t of tags) {
    if (t.id === id) return t.name;
    const found = findTagNameById(t.children, id);
    if (found) return found;
  }
  return null;
}

/** 获取最近 30 天的日期范围 */
function getDateRange(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tags, setTags] = useState<TagNode[]>([]);
  const [totalNotes, setTotalNotes] = useState(0);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [trendData, setTrendData] = useState<Array<{ date: string; count: number }>>([]);
  const [taskRate, setTaskRate] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openQuickInput, setOpenQuickInput] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('yn_token');
    setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;

    async function load() {
      setLoading(true);
      try {
        const { from: f, to: toDate } = getDateRange(30);
        const tok = token!;
        const [tagsRes, overallRes, listRes, countsRes, remindersRes] = await Promise.all([
          apiFetch<{ tags: TagNode[] }>('/tags/tree', { token: tok }),
          apiFetch<NotesResp>(`/notes?pageSize=1`, { token: tok }), // Overall total
          apiFetch<NotesResp>(`/notes?from=${f}&to=${toDate}&dateField=recordedAt&pageSize=100`, { token: tok }),
          apiFetch<TagCountsResp>(`/notes/tag-counts?from=${f}&to=${toDate}&dateField=recordedAt`, { token: tok }),
          apiFetch<{ items: any[]; total: number }>('/reminders?pageSize=100', { token: tok }),
        ]);
        
        setTags(tagsRes.tags);
        setTotalNotes(overallRes.total); // Real overall total
        setTagCounts(countsRes.counts ?? {});

        // Process trend data (last 30 days)
        const entries = listRes.items || [];
        const byDate: Record<string, number> = {};
        for (const n of entries) {
          const d = (n.recordedAt ?? n.createdAt).slice(0, 10);
          byDate[d] = (byDate[d] ?? 0) + 1;
        }
        const sorted = Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-7)
          .map(([date, count]) => ({ date: date.slice(5), count }));
        setTrendData(sorted.length ? sorted : [{ date: '-', count: 0 }]);

        // Process reminder stats
        const allReminders = remindersRes.items || [];
        const pending = allReminders.filter(r => r.status !== '已完成').length;
        const finished = allReminders.filter(r => r.status === '已完成').length;
        setReminderCount(pending);
        const rate = allReminders.length > 0 ? Math.round((finished / allReminders.length) * 1000) / 10 : 0;
        setTaskRate(rate);

      } catch (e) {
        console.error('Dashboard load failed:', e);
        setTrendData([{ date: '-', count: 0 }]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  // 最活跃分类
  const topCategory = useMemo(() => {
    const entries = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    const top = entries[0];
    if (!top) return '暂无';
    return findTagNameById(tags, top[0]) ?? top[0];
  }, [tagCounts, tags]);

  // 分类占比（甜甜圈图）
  const pieData = useMemo(() => {
    const total = Object.values(tagCounts).reduce((a, b) => a + b, 0);
    if (total === 0) return [];
    const entries = Object.entries(tagCounts)
      .map(([id, count]) => ({
        name: findTagNameById(tags, id) ?? id.slice(0, 8),
        value: Math.round((count / total) * 100),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
    return entries;
  }, [tagCounts, tags]);

  const COLORS = ['var(--accent)', '#f97316', '#10b981', '#ec4899', '#8b5cf6'];

  // 热门标签
  const hotTags = useMemo(() => {
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => findTagNameById(tags, id) ?? id.slice(0, 8))
      .filter(Boolean);
  }, [tagCounts, tags]);

  // 去除原来的模拟数据

  return (
    <div className="col" style={{ gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>数据概览</h1>
          <p className="muted" style={{ marginTop: 8, fontSize: '1.125rem' }}>
            欢迎回来，这是您的智能笔记洞察。
          </p>
        </div>
      </div>

      {/* 关键指标卡片 */}
      <div className="dashboardCardGrid4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        <div className="dashboardCard" style={{ boxShadow: 'var(--shadow-md)', border: 'none', background: 'linear-gradient(135deg, var(--panel) 0%, var(--bg) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: '1.5rem', background: 'var(--accent-soft)', padding: '8px', borderRadius: '12px' }}>📊</span>
            <span className="dashboardCardTitle" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>总记录数</span>
          </div>
          <div className="dashboardCardValue" style={{ fontSize: '2.5rem', fontWeight: 800 }}>{loading ? '...' : totalNotes.toLocaleString()}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span className="dashboardCardChange positive" style={{ fontWeight: 700 }}>↑ 12.5%</span>
            <span className="muted" style={{ fontSize: '0.75rem' }}>较上月</span>
          </div>
        </div>
        
        <div className="dashboardCard" style={{ boxShadow: 'var(--shadow-md)', border: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: '1.5rem', background: 'rgba(16, 185, 129, 0.1)', padding: '8px', borderRadius: '12px' }}>✅</span>
            <span className="dashboardCardTitle" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>任务完成率</span>
          </div>
          <div className="dashboardCardValue" style={{ fontSize: '2.5rem', fontWeight: 800 }}>{taskRate}%</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span className="dashboardCardChange positive" style={{ fontWeight: 700 }}>↑ 4.2%</span>
            <span className="muted" style={{ fontSize: '0.75rem' }}>正在稳步提升</span>
          </div>
        </div>

        <div className="dashboardCard" style={{ boxShadow: 'var(--shadow-md)', border: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: '1.5rem', background: 'rgba(249, 115, 22, 0.1)', padding: '8px', borderRadius: '12px' }}>🔥</span>
            <span className="dashboardCardTitle" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>最活跃分类</span>
          </div>
          <div className="dashboardCardValue" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)', minHeight: '3.75rem', display: 'flex', alignItems: 'center' }}>{topCategory}</div>
        </div>

        <div className="dashboardCard" style={{ boxShadow: 'var(--shadow-md)', border: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '12px' }}>🔔</span>
            <span className="dashboardCardTitle" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>待处理提醒</span>
          </div>
          <div className="dashboardCardValue" style={{ fontSize: '2.5rem', fontWeight: 800 }}>{reminderCount}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span className="dashboardCardChange negative" style={{ fontWeight: 700 }}>↓ 2.1%</span>
            <span className="muted" style={{ fontSize: '0.75rem' }}>需及时处理</span>
          </div>
        </div>
      </div>

      {/* 图表区 */}
      <div className="dashboardChartGrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="dashboardCard">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--font-heading)' }}>笔记创作趋势</span>
            <span className="muted" style={{ fontSize: 'var(--font-small)' }}>最近7天</span>
          </div>
          <div style={{ height: 240 }}>
            {loading ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
                加载中...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted)" fontSize={12} />
                  <YAxis stroke="var(--muted)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8 }}
                    formatter={(value: any) => [`${value ?? 0} 条`, '']}
                  />
                  <Line type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="dashboardCard">
          <div style={{ marginBottom: 16, fontWeight: 600, fontSize: 'var(--font-heading)' }}>分类占比</div>
          <div style={{ height: 240, display: 'flex', alignItems: 'center', gap: 16 }}>
            {loading || pieData.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
                {loading ? '加载中...' : '暂无数据'}
              </div>
            ) : (
              <>
                <ResponsiveContainer width="50%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pieData.map((d, i) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: COLORS[i % COLORS.length] }} />
                      <span>{d.name} {d.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 底部信息区 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="dashboardCard">
          <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 'var(--font-heading)' }}>热门标签</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {loading ? (
              <span className="muted">加载中...</span>
            ) : hotTags.length === 0 ? (
              <span className="muted">暂无标签</span>
            ) : (
              hotTags.map((name) => (
                <span
                  key={name}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--accent)',
                    background: 'rgba(37, 99, 235, 0.06)',
                    fontSize: 'var(--font-small)',
                  }}
                >
                  #{name}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="dashboardCard">
          <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 'var(--font-heading)' }}>系统公告</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 16 }}>🔄</span>
            <div>
              <div style={{ fontWeight: 500, fontSize: 'var(--font-body-sm)' }}>V2.4 版本更新说明</div>
              <div className="muted" style={{ marginTop: 4, fontSize: 'var(--font-caption)' }}>
                新增了深色模式自动切换功能及全新看板统计界面。
              </div>
            </div>
          </div>
        </div>
      </div>

      {token && (
        <QuickInputModal
          open={openQuickInput}
          onClose={() => setOpenQuickInput(false)}
          token={token}
          selectedTagId={null}
          tags={tags}
          onSuccess={() => {
            setOpenQuickInput(false);
            // 这里我们不需要整个页面刷新，只需让 useEffect 重新执行 load 即可
            // 通过修改 token 触发不太优雅，我们可以写一个 refresh 函数或者刷新页面
            window.location.reload(); 
          }}
        />
      )}
    </div>
  );
}
