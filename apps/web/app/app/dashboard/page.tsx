'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { QuickInputModal } from '@/components/QuickInputModal';
import type { TagNode } from '@/components/TagTree';
import type { NoteItem } from '@/components/NoteList';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

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
        const [tagsRes, listRes, countsRes] = await Promise.all([
          apiFetch<{ tags: TagNode[] }>('/tags/tree', { token: tok }),
          apiFetch<NotesResp>(`/notes?from=${f}&to=${toDate}&dateField=recordedAt&pageSize=100`, { token: tok }),
          apiFetch<TagCountsResp>(`/notes/tag-counts?from=${f}&to=${toDate}&dateField=recordedAt`, { token: tok }),
        ]);
        setTags(tagsRes.tags);
        setTotalNotes(listRes.total);
        setTagCounts(countsRes.counts ?? {});

        // 按日期聚合笔记
        const byDate: Record<string, number> = {};
        for (const n of listRes.items) {
          const d = (n.recordedAt ?? n.createdAt).slice(0, 10);
          byDate[d] = (byDate[d] ?? 0) + 1;
        }
        const sorted = Object.entries(byDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-7)
          .map(([date, count]) => ({ date: date.slice(5), count }));
        setTrendData(sorted.length ? sorted : [{ date: '-', count: 0 }]);
      } catch {
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

  const COLORS = ['#2563eb', '#f97316', '#22c55e', '#ec4899'];

  // 热门标签
  const hotTags = useMemo(() => {
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id]) => findTagNameById(tags, id) ?? id.slice(0, 8))
      .filter(Boolean);
  }, [tagCounts, tags]);

  // 模拟数据（无 API 的字段）
  const taskRate = 86.4;
  const reminderCount = 12;

  return (
    <div className="col" style={{ gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-title)', fontWeight: 700, margin: 0 }}>数据概览</h1>
          <p className="muted" style={{ marginTop: 6, fontSize: 'var(--font-body-sm)' }}>
            欢迎回来，这是您最近30天的笔记统计。
          </p>
        </div>
        <div />
      </div>

      {/* 关键指标卡片 */}
      <div className="dashboardCardGrid4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <div className="dashboardCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>📄</span>
            <span className="dashboardCardTitle">总记录数</span>
          </div>
          <div className="dashboardCardValue">{loading ? '...' : totalNotes.toLocaleString()}</div>
          <div className="dashboardCardChange positive">+12.5%</div>
        </div>
        <div className="dashboardCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>✓</span>
            <span className="dashboardCardTitle">任务完成率</span>
          </div>
          <div className="dashboardCardValue">{taskRate}%</div>
          <div className="dashboardCardChange positive">+4.2%</div>
        </div>
        <div className="dashboardCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>⭐</span>
            <span className="dashboardCardTitle">最活跃分类</span>
          </div>
          <div className="dashboardCardValue" style={{ fontSize: 20 }}>{topCategory}</div>
        </div>
        <div className="dashboardCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>🕐</span>
            <span className="dashboardCardTitle">待处理提醒</span>
          </div>
          <div className="dashboardCardValue">{reminderCount}</div>
          <div className="dashboardCardChange negative">-2.1%</div>
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
                    formatter={(value: number | undefined) => [`${value ?? 0} 条`, '']}
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
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
