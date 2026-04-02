'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { type TagNode } from '@/components/TagTree';
import { TagManager } from '@/components/TagManager';
import { TagCreateModal } from '@/components/TagCreateModal';
import { TagEditModal } from '@/components/TagEditModal';
import { QuickRecordModal } from '@/components/QuickRecordModal';
import { QuickInputModal } from '@/components/QuickInputModal';
import { NoteEditModal } from '@/components/NoteEditModal';
import { Modal } from '@/components/Modal';
import {
  NoteList,
  type NoteItem,
  type NoteViewMode,
  type RecordFilter,
  DEFAULT_RECORD_FILTER,
} from '@/components/NoteList';

type NotesResp = { items: NoteItem[]; page: number; pageSize: number; total: number };

function findTagById(tags: TagNode[], id: string): TagNode | null {
  for (const t of tags) {
    if (t.id === id) return t;
    const found = findTagById(t.children, id);
    if (found) return found;
  }
  return null;
}

/** 获取标签的完整显示路径，如「工作 > 安全生产」 */
function getTagDisplayPath(tags: TagNode[], tagId: string): string | null {
  function findPath(nodes: TagNode[], targetId: string, acc: string[]): string[] | null {
    for (const n of nodes) {
      if (n.id === targetId) return [...acc, n.name];
      const found = findPath(n.children, targetId, [...acc, n.name]);
      if (found) return found;
    }
    return null;
  }
  const pathArr = findPath(tags, tagId, []);
  return pathArr ? pathArr.join(' > ') : (findTagById(tags, tagId)?.name ?? null);
}

export default function NotesPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [tags, setTags] = useState<TagNode[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [notesTotal, setNotesTotal] = useState(0);
  const [notesPage, setNotesPage] = useState(1);
  const [notesPageSize, setNotesPageSize] = useState(10);
  const [notesByTag, setNotesByTag] = useState<Record<string, NoteItem[]>>({});
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RecordFilter>(DEFAULT_RECORD_FILTER);
  const [viewMode, setViewMode] = useState<NoteViewMode>('list');
  const [openCreateTag, setOpenCreateTag] = useState(false);
  const [openQuickInputModal, setOpenQuickInputModal] = useState(false);
  const [editTag, setEditTag] = useState<TagNode | null>(null);
  const [recordTag, setRecordTag] = useState<{ id: string; name: string } | null>(null);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [addReminderNoteId, setAddReminderNoteId] = useState<string | null>(null);
  const [addReminderStep, setAddReminderStep] = useState<'confirm' | 'date'>('confirm');
  const [addReminderDate, setAddReminderDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const listQuery = useMemo(() => {
    const qs = new URLSearchParams();
    if (filter.q.trim()) qs.set('q', filter.q.trim());
    if (filter.dateFrom) qs.set('from', filter.dateFrom);
    if (filter.dateTo) qs.set('to', filter.dateTo);
    qs.set('dateField', filter.dateField);
    qs.set('sortBy', filter.sortBy);
    qs.set('sortOrder', filter.sortOrder);
    if (selectedTagId) qs.set('tagIds', selectedTagId);
    qs.set('page', String(notesPage));
    qs.set('pageSize', String(notesPageSize));
    return `?${qs.toString()}`;
  }, [filter, selectedTagId, notesPage, notesPageSize]);

  const tagCountsQuery = useMemo(() => {
    const qs = new URLSearchParams();
    if (filter.q.trim()) qs.set('q', filter.q.trim());
    if (filter.dateFrom) qs.set('from', filter.dateFrom);
    if (filter.dateTo) qs.set('to', filter.dateTo);
    qs.set('dateField', filter.dateField);
    return `?${qs.toString()}`;
  }, [filter]);

  useEffect(() => {
    const t = localStorage.getItem('yn_token');
    if (!t) router.replace('/login');
    else setToken(t);
  }, [router]);

  function buildNotesByTag(allNotes: NoteItem[], tagIds: string[]): Record<string, NoteItem[]> {
    const byTag: Record<string, NoteItem[]> = {};
    for (const tagId of tagIds) byTag[tagId] = [];
    for (const n of allNotes) {
      for (const tagId of n.tagIds) {
        if (byTag[tagId]) byTag[tagId].push(n);
      }
    }
    return byTag;
  }

  function getAllTagIds(nodes: TagNode[]): string[] {
    const ids: string[] = [];
    for (const n of nodes) {
      ids.push(n.id);
      ids.push(...getAllTagIds(n.children));
    }
    return ids;
  }

  async function loadAll(t: string, opts?: { selectTagId?: string }) {
    setLoading(true);
    setErr(null);
    try {
      if (opts?.selectTagId) setSelectedTagId(opts.selectTagId);
      const tree = await apiFetch<{ tags: TagNode[] }>('/tags/tree', { token: t });
      setTags(tree.tags);
      const tagIds = getAllTagIds(tree.tags);
      const [list, countsResp] = await Promise.all([
        apiFetch<NotesResp>(`/notes${listQuery}`, { token: t }),
        apiFetch<{ counts: Record<string, number> }>(`/notes/tag-counts${tagCountsQuery}`, { token: t }),
      ]);
      setNotes(list.items);
      setNotesTotal(list.total);
      setNotesPage(list.page);
      setNotesPageSize(list.pageSize);
      const notesByTag = buildNotesByTag(list.items, tagIds);
      setNotesByTag(notesByTag);
      setTagCounts(countsResp.counts ?? {});
    } catch (e: any) {
      if (e?.code === 'UNAUTHORIZED') {
        localStorage.removeItem('yn_token');
        router.replace('/login');
        return;
      }
      setErr(e?.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadAll(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, listQuery, tagCountsQuery]);

  /** 构建导出用查询（不含分页，用于分页拉取） */
  const exportBaseQuery = useMemo(() => {
    const qs = new URLSearchParams();
    if (filter.q.trim()) qs.set('q', filter.q.trim());
    if (filter.dateFrom) qs.set('from', filter.dateFrom);
    if (filter.dateTo) qs.set('to', filter.dateTo);
    qs.set('dateField', filter.dateField);
    qs.set('sortBy', filter.sortBy);
    qs.set('sortOrder', filter.sortOrder);
    if (selectedTagId) qs.set('tagIds', selectedTagId);
    qs.set('pageSize', '100');
    return qs;
  }, [filter, selectedTagId]);

  async function handleExport() {
    if (!token) return;
    setExportLoading(true);
    try {
      const allItems: NoteItem[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const qs = new URLSearchParams(exportBaseQuery);
        qs.set('page', String(page));
        const res = await apiFetch<NotesResp>(`/notes?${qs.toString()}`, { token });
        allItems.push(...res.items);
        hasMore = res.items.length >= res.pageSize && allItems.length < res.total;
        page += 1;
      }
      if (allItems.length === 0) {
        alert('当前筛选条件下暂无记录可导出');
        return;
      }
      const escapeCsv = (s: string) => {
        const v = String(s ?? '').replace(/"/g, '""');
        return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v}"` : v;
      };
      const formatDay = (iso: string) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      const header = ['记录日期', '内容', '创建时间', '更新时间', '标签'];
      const rows = allItems.map((n) => {
        const tagNames = (n.tagIds || [])
          .map((id) => getTagDisplayPath(tags, id) ?? id)
          .filter(Boolean)
          .join('; ');
        return [
          formatDay(n.recordedAt ?? n.createdAt),
          escapeCsv(n.contentPreview ?? ''),
          formatDay(n.createdAt),
          formatDay(n.updatedAt),
          escapeCsv(tagNames),
        ].join(',');
      });
      const csv = '\uFEFF' + [header.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `笔记导出_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e?.message ?? '导出失败');
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div className="col" style={{ gap: 0 }}>
      {err ? (
        <div className="card" style={{ borderColor: 'rgba(220,38,38,0.4)', background: 'rgba(220,38,38,0.08)' }}>
          {err}
        </div>
      ) : null}

      <div className="row" style={{ marginTop: '1rem', alignItems: 'flex-start', gap: 8 }}>
        <div className="card tagManagerCard" style={{ 
          maxHeight: 'calc(100vh - 120px)', 
          overflowY: 'auto', 
          position: 'sticky', 
          top: '72px',
          zIndex: 20 
        }}>
          {token ? (
            <TagManager
              tags={tags}
              notesByTag={notesByTag}
              tagCounts={tagCounts}
              selectedTagId={selectedTagId}
              selectedNoteId={selectedNoteId}
              onSelect={(id) => {
                setSelectedTagId(id === selectedTagId ? null : id);
                setSelectedNoteId(null);
                setNotesPage(1);
              }}
              onSelectNote={setSelectedNoteId}
              onRecord={(tagId) => {
                const tag = findTagById(tags, tagId);
                if (tag) setRecordTag({ id: tag.id, name: tag.name });
              }}
              onEdit={(tag) => setEditTag(tag)}
              onManageTags={() => setOpenCreateTag(true)}
              onDelete={async (noteId) => {
                if (!token) return;
                const ok = window.confirm('确认删除这条记录？');
                if (!ok) return;
                try {
                  await apiFetch(`/notes/${noteId}`, { method: 'DELETE', token });
                  setSelectedNoteId((cur) => (cur === noteId ? null : cur));
                  await loadAll(token);
                } catch (e: any) {
                  setErr(e?.message ?? '删除失败');
                }
              }}
            />
          ) : null}
        </div>

        <div className="col" style={{ flex: 1 }}>
          <NoteList
            items={selectedTagId ? (notesByTag[selectedTagId] ?? []) : notes}
            total={notesTotal}
            page={notesPage}
            pageSize={notesPageSize}
            onPageChange={setNotesPage}
            selectedId={selectedNoteId}
            onSelect={setSelectedNoteId}
            viewMode={viewMode}
            filter={filter}
            onFilterChange={(f) => {
              setFilter(f);
              setSelectedNoteId(null);
              setNotesPage(1);
            }}
            selectedTagName={selectedTagId ? getTagDisplayPath(tags, selectedTagId) : null}
            selectedTagId={selectedTagId}
            onNewRecord={
              selectedTagId && token
                ? () => {
                    const tag = findTagById(tags, selectedTagId);
                    const name = tag?.name ?? getTagDisplayPath(tags, selectedTagId) ?? '未命名';
                    setRecordTag({ id: selectedTagId, name });
                  }
                : undefined
            }
            onQuickInput={() => setOpenQuickInputModal(true)}
            onViewModeChange={setViewMode}
            onEdit={(noteId) => setEditNoteId(noteId)}
            onAddReminder={(noteId) => setAddReminderNoteId(noteId)}
            onDelete={async (noteId) => {
              if (!token) return;
              const ok = window.confirm('确认删除这条记录？（可在后续版本增加回收站）');
              if (!ok) return;
              try {
                if (noteId.startsWith('batch:')) {
                  const batchId = noteId.replace(/^batch:/, '');
                  await apiFetch(`/notes/batch/${batchId}`, { method: 'DELETE', token });
                } else if (noteId.startsWith('date:')) {
                  const dateStr = noteId.replace(/^date:/, '');
                  await apiFetch(`/notes/by-date/${dateStr}`, { method: 'DELETE', token });
                } else {
                  await apiFetch(`/notes/${noteId}`, { method: 'DELETE', token });
                }
                setSelectedNoteId((cur) => (cur === noteId ? null : cur));
                await loadAll(token);
              } catch (e: any) {
                setErr(e?.message ?? '删除失败');
              }
            }}
            onExport={token ? handleExport : undefined}
            exportLoading={exportLoading}
          />
        </div>
      </div>

      {token ? (
        <TagCreateModal
          open={openCreateTag}
          onClose={() => setOpenCreateTag(false)}
          token={token}
          tags={tags}
          onCreated={() => loadAll(token)}
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
            loadAll(token);
          }}
        />
      ) : null}
      {token && recordTag ? (
        <QuickRecordModal
          open={!!recordTag}
          tagId={recordTag.id}
          tagName={recordTag.name}
          token={token}
          onClose={() => setRecordTag(null)}
          onSuccess={() => loadAll(token)}
        />
      ) : null}
      {token && editNoteId ? (
        <NoteEditModal
          open={!!editNoteId}
          noteId={editNoteId}
          token={token}
          onClose={() => setEditNoteId(null)}
          onSuccess={() => {
            setEditNoteId(null);
            loadAll(token);
          }}
        />
      ) : null}
      {addReminderNoteId && token ? (
        <Modal
          title={addReminderStep === 'confirm' ? '加入提醒' : '选择提醒日期'}
          open={!!addReminderNoteId}
          onClose={() => {
            setAddReminderNoteId(null);
            setAddReminderStep('confirm');
            setAddReminderDate('');
          }}
          contentWidth={400}
        >
          <div className="col" style={{ gap: 16 }}>
            {addReminderStep === 'confirm' ? (
              <>
                <p style={{ margin: 0, fontSize: 'var(--font-body-sm)' }}>
                  确认将此项加入提醒任务列表？
                </p>
                <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setAddReminderNoteId(null);
                      setAddReminderStep('confirm');
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn btnPrimary"
                    onClick={() => setAddReminderStep('date')}
                  >
                    确定
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--font-small)', color: 'var(--muted)', marginBottom: 6 }}>
                    提醒日期
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={addReminderDate}
                    onChange={(e) => setAddReminderDate(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setAddReminderStep('confirm')}
                  >
                    返回
                  </button>
                  <button
                    type="button"
                    className="btn btnPrimary"
                    disabled={!addReminderDate.trim()}
                    onClick={async () => {
                      if (!addReminderNoteId || !addReminderDate.trim()) return;
                      try {
                        const remindAt = `${addReminderDate.trim()}T09:00:00`;
                        await apiFetch('/reminders', {
                          method: 'POST',
                          token,
                          body: JSON.stringify({ noteId: addReminderNoteId, remindAt }),
                        });
                        setAddReminderNoteId(null);
                        setAddReminderStep('confirm');
                        setAddReminderDate('');
                        alert('已添加到提醒事项');
                      } catch (e: any) {
                        if (e?.code === 'UNAUTHORIZED') return;
                        setErr(e?.message ?? '添加失败');
                        setAddReminderNoteId(null);
                        setAddReminderStep('confirm');
                      }
                    }}
                  >
                    确定
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      ) : null}
      {token ? (
        <QuickInputModal
          open={openQuickInputModal}
          onClose={() => setOpenQuickInputModal(false)}
          token={token}
          selectedTagId={selectedTagId}
          tags={tags}
          onSuccess={(result) => loadAll(token!, result?.selectTagId ? { selectTagId: result.selectTagId } : undefined)}
        />
      ) : null}
    </div>
  );
}
