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
    return `?${qs.toString()}`;
  }, [page, pageSize, searchQuery, statusFilter]);

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
      if (e?.code === 'UNAUTHORIZED') router.replace('/login');
      else setErr(e?.message ?? '加载失败');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadReminders(token);
  }, [token, remindersQuery]);

  const tagCountsQuery = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('dateField', 'recordedAt');
    return `?${qs.toString()}`;
  }, []);

  useEffect(() => {
    const t = localStorage.getItem('yn_token');
    if (!t) router.replace('/login');
    else setToken(t);
  }, [router]);

  async function loadTags(t: string) {
    try {
      const [tree, countsRes] = await Promise.all([
        apiFetch<{ tags: TagNode[] }>('/tags/tree', { token: t }),
        apiFetch<{ counts: Record<string, number> }>(`/notes/tag-counts${tagCountsQuery}`, { token: t }),
      ]);
      setTags(tree.tags);
      setTagCounts(countsRes.counts ?? {});
    } catch {
      setTags([]);
    }
  }

  useEffect(() => {
    if (token) loadTags(token);
  }, [token, tagCountsQuery]);

  const notesByTag: Record<string, never[]> = useMemo(() => ({}), []);

  return (
    <div className="col" style={{ gap: 12 }}>
      <div style={{ height: 8 }} />

      <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
        {/* 左侧：任务分类 + 本周完成度 */}
        <div className="card tagManagerCard" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          {token ? (
            <>
              <TagManager
                tags={tags}
                notesByTag={notesByTag}
                tagCounts={tagCounts}
                selectedTagId={selectedTagId}
                selectedNoteId={null}
                onSelect={(id) => setSelectedTagId(id === selectedTagId ? null : id)}
                onSelectNote={() => {}}
                onManageTags={() => setOpenCreateTag(true)}
                sectionTitle="任务分类"
              />
            </>
          ) : null}
        </div>

        {/* 右侧：提醒与任务主内容 */}
        <div className="col" style={{ flex: 1, gap: 12 }}>
          {/* 提醒与任务：紧凑布局，缩小占位 */}
          <div
            className="col"
            style={{
              flex: '0 0 auto',
              gap: 8,
            }}
          >
            <div>
              <h1 style={{ fontSize: 'var(--font-heading)', fontWeight: 700, margin: 0 }}>提醒与任务</h1>
              <p className="muted" style={{ marginTop: 4, fontSize: 'var(--font-small)' }}>
                管理你的日程安排和重要提醒
              </p>
            </div>

            {/* 日历：2026年2月，1日为周日（紧凑版） */}
            <div className="card" style={{ padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--font-body-sm)' }}>2026年2月</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn" style={{ padding: '2px 6px', fontSize: 'var(--font-small)' }}>
                  ←
                </button>
                <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 'var(--font-small)' }}>
                  今天
                </button>
                <button type="button" className="btn" style={{ padding: '2px 6px', fontSize: 'var(--font-small)' }}>
                  →
                </button>
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 2,
                textAlign: 'center',
                fontSize: 'var(--font-small)',
              }}
            >
              {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
                <div key={d} className="muted" style={{ padding: 2 }}>
                  {d}
                </div>
              ))}
              {/* 2026-02-01 是周日，28 天 */}
              {Array.from({ length: 28 }, (_, i) => {
                const day = i + 1;
                const isToday = day === 11;
                const hasEvent11 = day === 11;
                const hasEvent15 = day === 15;
                return (
                  <div
                    key={day}
                    style={{
                      padding: 4,
                      borderRadius: 4,
                      background: isToday ? 'var(--accent)' : undefined,
                      color: isToday ? '#fff' : undefined,
                      fontWeight: isToday ? 600 : undefined,
                    }}
                  >
                    {day}
                    {hasEvent11 ? (
                      <span style={{ display: 'flex', justifyContent: 'center', gap: 1, marginTop: 1 }}>
                        <span
                          className="dot"
                          style={{ width: 3, height: 3, background: isToday ? 'rgba(255,255,255,0.9)' : 'var(--accent)' }}
                        />
                        <span
                          className="dot"
                          style={{ width: 3, height: 3, background: isToday ? 'rgba(255,255,255,0.9)' : 'var(--accent)' }}
                        />
                      </span>
                    ) : hasEvent15 ? (
                      <span
                        className="dot"
                        style={{ display: 'block', margin: '1px auto 0', width: 3, height: 3, background: 'var(--ok)' }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          </div>

          {/* 所有任务明细：上移，占据更多可视区域 */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--font-heading)' }}>所有任务明细</span>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid var(--border)' }}>
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
                  style={{ minWidth: 100 }}
                >
                  <option value="">全部状态</option>
                  <option value="待处理">待处理</option>
                  <option value="进行中">进行中</option>
                  <option value="已完成">已完成</option>
                </select>
              </div>
              {err ? (
                <div style={{ padding: 12, color: 'var(--danger)' }}>{err}</div>
              ) : null}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-body-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>记录日期</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>任务内容</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>提醒时间</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>创建时间</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                          加载中…
                        </td>
                      </tr>
                    ) : tasks.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                          暂无提醒事项，可在
                          <Link href="/app/notes" style={{ marginLeft: 4, color: 'var(--accent)' }}>
                            所有笔记
                          </Link>
                          中点击「提醒」按钮添加
                        </td>
                      </tr>
                    ) : (
                      tasks.map((t) => (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: 12 }}>{t.recordDate}</td>
                          <td style={{ padding: 12 }}>
                            <Link href="/app/notes" style={{ color: 'inherit' }}>
                              {t.content || '(空)'}
                            </Link>
                          </td>
                          <td style={{ padding: 12 }}>{formatRemindAt(t.remindAt)}</td>
                          <td style={{ padding: 12 }}>{t.createdAt}</td>
                          <td style={{ padding: 12 }}>
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'nowrap',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              {t.status !== '已完成' ? (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{
                                    padding: '4px 8px',
                                    background: 'rgba(34,197,94,0.15)',
                                    color: 'var(--ok)',
                                  }}
                                  onClick={async () => {
                                    if (!token) return;
                                    try {
                                      await apiFetch(`/reminders/${t.id}`, {
                                        method: 'PATCH',
                                        token,
                                        body: JSON.stringify({ status: '已完成' }),
                                      });
                                      loadReminders(token);
                                    } catch (e: any) {
                                      setErr(e?.message ?? '更新失败');
                                    }
                                  }}
                                >
                                  完成
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn btnDelete"
                                style={{ padding: '4px 8px' }}
                                onClick={async () => {
                                  if (!token) return;
                                  if (!window.confirm('确认从提醒中移除？')) return;
                                  try {
                                    await apiFetch(`/reminders/${t.id}`, { method: 'DELETE', token });
                                    loadReminders(token);
                                  } catch (e: any) {
                                    setErr(e?.message ?? '删除失败');
                                  }
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 12,
                  borderTop: '1px solid var(--border)',
                  fontSize: 'var(--font-small)',
                  color: 'var(--muted)',
                }}
              >
                <span>
                  共 {totalTasks} 条
                  {totalTasks > 0
                    ? ` · 第 ${page} 页（每页 ${pageSize} 条）`
                    : ''}
                </span>
                {totalTasks > pageSize ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: '4px 10px' }}
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: '4px 10px' }}
                      disabled={page >= Math.ceil(totalTasks / pageSize)}
                      onClick={() => setPage(page + 1)}
                    >
                      下一页
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {token ? (
        <TagCreateModal
          open={openCreateTag}
          onClose={() => setOpenCreateTag(false)}
          token={token}
          tags={tags}
          onCreated={() => loadTags(token)}
        />
      ) : null}
      {token && editTag ? (
        <TagEditModal
          open={!!editTag}
          tag={editTag}
          tags={tags}
          onClose={() => setEditTag(null)}
          token={token}
          onSuccess={() => {
            setEditTag(null);
            loadTags(token);
          }}
        />
      ) : null}
      {token ? (
        <QuickInputModal
          open={openQuickInput}
          onClose={() => setOpenQuickInput(false)}
          token={token}
          selectedTagId={selectedTagId}
          tags={tags}
          onSuccess={() => loadTags(token)}
        />
      ) : null}
    </div>
  );
}
