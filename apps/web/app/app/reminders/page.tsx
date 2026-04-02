'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { type TagNode } from '@/components/TagTree';
import { TagManager } from '@/components/TagManager';
import { TagCreateModal } from '@/components/TagCreateModal';
import { TagEditModal } from '@/components/TagEditModal';
import { QuickInputModal } from '@/components/QuickInputModal';

type ReminderItem = {
  id: string;
  noteId: string;
  content: string;
  recordDate: string;
  status: string;
  remindAt: string | null;
  createdAt: string;
};

function formatDay(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function RemindersPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [tags, setTags] = useState<TagNode[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [openCreateTag, setOpenCreateTag] = useState(false);
  const [editTag, setEditTag] = useState<TagNode | null>(null);
  const [openQuickInput, setOpenQuickInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [tasks, setTasks] = useState<ReminderItem[]>([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function formatRemindAt(iso: string | null) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  const remindersQuery = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('pageSize', String(pageSize));
    if (searchQuery.trim()) qs.set('q', searchQuery.trim());
    if (statusFilter) qs.set('status', statusFilter);
    if (selectedTagId) qs.set('tagIds', selectedTagId);
    if (selectedDate) qs.set('date', selectedDate);
    return `?${qs.toString()}`;
  }, [page, pageSize, searchQuery, statusFilter, selectedTagId, selectedDate]);

  useEffect(() => {
    const t = localStorage.getItem('yn_token');
    if (!t) router.replace('/login');
    else setToken(t);
  }, [router]);

  async function loadReminders(t: string) {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<{ items: ReminderItem[]; page: number; pageSize: number; total: number }>(
        `/reminders${remindersQuery}`,
        { token: t },
      );
      setTasks(res.items.map((it) => ({ ...it, recordDate: formatDay(it.recordDate), createdAt: formatDay(it.createdAt) })));
      setTotalTasks(res.total);
    } catch (e: any) {
      if (e?.code === 'UNAUTHORIZED') {
        localStorage.removeItem('yn_token');
        router.replace('/login');
      } else {
        setErr(e?.message ?? '加载失败');
        setTasks([]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadTags(t: string) {
    try {
      const [tree, countsRes] = await Promise.all([
        apiFetch<{ tags: TagNode[] }>('/tags/tree', { token: t }),
        apiFetch<{ counts: Record<string, number> }>('/reminders/tag-counts', { token: t }),
      ]);
      setTags(tree.tags);
      setTagCounts(countsRes.counts ?? {});
    } catch {
      setTags([]);
    }
  }

  useEffect(() => {
    if (token) {
      loadReminders(token);
    }
  }, [token, remindersQuery]);

  useEffect(() => {
    if (token) {
      loadTags(token);
    }
  }, [token]);

  // 日历逻辑
  const [calendarView, setCalendarView] = useState(new Date(2026, 1, 1)); // 默认显示 2026年2月
  const calendarYear = calendarView.getFullYear();
  const calendarMonth = calendarView.getMonth();
  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  const handleDayClick = (day: number) => {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr === selectedDate ? null : dateStr);
    setPage(1);
  };

  return (
    <div className="col" style={{ gap: 4 }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>提醒与任务</h1>
        <p className="muted" style={{ marginTop: 2, fontSize: 'var(--font-body-sm)' }}>
          管理您的日程安排和重要提醒
        </p>
      </div>

      <div className="row" style={{ marginTop: '1rem', alignItems: 'flex-start', gap: 12, width: '100%' }}>
        {/* 左侧：任务分类 */}
        <div className="card tagManagerCard" style={{ 
          width: 260, 
          flexShrink: 0, 
          maxHeight: 'calc(100vh - 120px)', 
          overflowY: 'auto',
          position: 'sticky', 
          top: '72px',
          zIndex: 20 
        }}>
          {token ? (
            <TagManager
              tags={tags}
              notesByTag={{}}
              tagCounts={tagCounts}
              selectedTagId={selectedTagId}
              selectedNoteId={null}
              onSelect={(id) => {
                setSelectedTagId(id === selectedTagId ? null : id);
                setPage(1);
              }}
              onSelectNote={() => {}}
              onManageTags={() => setOpenCreateTag(true)}
              sectionTitle="任务分类"
            />
          ) : null}
        </div>

        {/* 右侧：提醒与任务内容 */}
        <div className="col" style={{ flex: 1, gap: 16 }}>
          <div className="col" style={{ 
            gap: 8,
            position: 'sticky',
            top: '72px',
            zIndex: 15,
            background: 'var(--bg)',
            paddingBottom: '8px'
          }}>

            {/* 日历卡片 */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>{calendarYear}年{calendarMonth + 1}月</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button 
                    type="button" className="btn" style={{ padding: '4px 8px' }}
                    onClick={() => setCalendarView(new Date(calendarYear, calendarMonth - 1, 1))}
                  >
                    ←
                  </button>
                  <button 
                    type="button" className="btn" style={{ padding: '4px 12px' }}
                    onClick={() => {
                      const now = new Date();
                      setCalendarView(new Date(now.getFullYear(), now.getMonth(), 1));
                    }}
                  >
                    今天
                  </button>
                  <button 
                    type="button" className="btn" style={{ padding: '4px 8px' }}
                    onClick={() => setCalendarView(new Date(calendarYear, calendarMonth + 1, 1))}
                  >
                    →
                  </button>
                </div>
              </div>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(7, 1fr)', 
                gap: 4, 
                textAlign: 'center',
                fontSize: 'var(--font-body-sm)'
              }}>
                {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
                  <div key={d} className="muted" style={{ padding: 4, fontWeight: 600 }}>{d}</div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isSelected = selectedDate === dateStr;
                  const isToday = formatDay(new Date().toISOString()) === dateStr;
                  
                  return (
                    <div
                      key={day}
                      onClick={() => handleDayClick(day)}
                      style={{
                        padding: '10px 4px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: isSelected ? 'var(--accent)' : (isToday ? 'var(--accent-soft)' : 'transparent'),
                        color: isSelected ? '#fff' : (isToday ? 'var(--accent)' : 'var(--text)'),
                        fontWeight: (isSelected || isToday) ? 700 : 400,
                        transition: 'all 0.2s ease',
                        border: isToday && !isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                      }}
                      className="calendar-day-cell"
                    >
                      {day}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 统计与分页 (新位置) */}
            {(totalTasks != null || page != null) && (
              <div style={{ 
                padding: '0.75rem 1rem', 
                background: 'var(--panel)',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                fontSize: 'var(--font-body-sm)',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <span className="muted">
                  共 <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{totalTasks ?? 0}</span> 条任务
                </span>
                {totalTasks > pageSize && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn" style={{ padding: '4px 10px', height: '2rem' }} disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</button>
                    <span style={{ fontWeight: 600, minWidth: '3rem', textAlign: 'center' }}>{page} / {Math.ceil(totalTasks / pageSize)}</span>
                    <button className="btn" style={{ padding: '4px 10px', height: '2rem' }} disabled={page >= Math.ceil(totalTasks / pageSize)} onClick={() => setPage(p => p + 1)}>下一页</button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <h2 style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: 12 }}>所有任务明细</h2>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', gap: 8, padding: 16, borderBottom: '1px solid var(--border)' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="搜索任务内容..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  style={{ flex: 1 }}
                />
                <select
                  className="input"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  style={{ minWidth: 120 }}
                >
                  <option value="">全部状态</option>
                  <option value="待处理">待处理</option>
                  <option value="进行中">进行中</option>
                  <option value="已完成">已完成</option>
                </select>
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9375rem' }}>
                  <thead style={{ 
                    background: 'var(--panel2)', 
                    position: 'relative', 
                    top: '0',
                    zIndex: 1,
                    borderBottom: '2px solid var(--border)'
                  }}>
                    <tr>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>记录日期</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>任务内容</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>提醒时间</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>创建时间</th>
                      <th style={{ padding: 12, textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>加载中…</td>
                      </tr>
                    ) : tasks.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                          {searchQuery || selectedDate || selectedTagId ? '当前筛选条件下暂无任务' : '暂无任务，可在所有笔记中添加'}
                        </td>
                      </tr>
                    ) : (
                      tasks.map((t) => (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: 12 }}>{t.recordDate}</td>
                          <td style={{ padding: 12 }}>{t.content || '(空)'}</td>
                          <td style={{ padding: 12 }}>{formatRemindAt(t.remindAt)}</td>
                          <td style={{ padding: 12 }}>{t.createdAt}</td>
                          <td style={{ padding: 12, textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              {t.status !== '已完成' && (
                                <button 
                                  className="btn" 
                                  style={{ padding: '4px 8px', fontSize: '0.875rem', background: 'var(--accent-soft)', color: 'var(--accent)' }}
                                  onClick={async () => {
                                    if (!token) return;
                                    await apiFetch(`/reminders/${t.id}`, { method: 'PATCH', token, body: JSON.stringify({ status: '已完成' }) });
                                    loadReminders(token);
                                  }}
                                >
                                  完成
                                </button>
                              )}
                              <button 
                                className="btn" 
                                style={{ padding: '4px 8px', fontSize: '0.875rem', color: 'var(--danger)' }}
                                onClick={async () => {
                                  if (!token || !confirm('确认移除？')) return;
                                  await apiFetch(`/reminders/${t.id}`, { method: 'DELETE', token });
                                  loadReminders(token);
                                  loadTags(token);
                                }}
                              >
                                移除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {token && (
        <>
          <TagCreateModal open={openCreateTag} onClose={() => setOpenCreateTag(false)} token={token} tags={tags} onCreated={() => loadTags(token)} />
          {editTag && <TagEditModal open={!!editTag} tag={editTag} tags={tags} onClose={() => setEditTag(null)} token={token} onSuccess={() => { setEditTag(null); loadTags(token); }} />}
          <QuickInputModal open={openQuickInput} onClose={() => setOpenQuickInput(false)} token={token} selectedTagId={selectedTagId} tags={tags} onSuccess={() => { loadReminders(token); loadTags(token); }} />
        </>
      )}
    </div>
  );
}
