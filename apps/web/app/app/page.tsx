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

export default function AppPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [tags, setTags] = useState<TagNode[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [notesTotal, setNotesTotal] = useState(0);
  const [notesPage, setNotesPage] = useState(1);
  const [notesPageSize, setNotesPageSize] = useState(100);
  const [notesByTag, setNotesByTag] = useState<Record<string, NoteItem[]>>({});
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RecordFilter>(DEFAULT_RECORD_FILTER);
  const [viewMode, setViewMode] = useState<NoteViewMode>('list');
  const [openCreateTag, setOpenCreateTag] = useState(false);
  const [openQuickInputModal, setOpenQuickInputModal] = useState(false);
  const [editTag, setEditTag] = useState<TagNode | null>(null);
  const [recordTag, setRecordTag] = useState<{ id: string; name: string } | null>(null);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reclassifyLoading, setReclassifyLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const listQuery = useMemo(() => {
    const qs = new URLSearchParams();
    if (filter.q.trim()) qs.set('q', filter.q.trim());
    if (filter.dateFrom) qs.set('from', filter.dateFrom);
    if (filter.dateTo) qs.set('to', filter.dateTo);
    qs.set('dateField', filter.dateField);
    // 标签：优先使用左侧选中的标签
    const tagIds = selectedTagId ? selectedTagId : '';
    if (tagIds) qs.set('tagIds', tagIds);
    qs.set('page', '1');
    qs.set('pageSize', '100');
    return `?${qs.toString()}`;
  }, [filter, selectedTagId]);

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
      const list = await apiFetch<NotesResp>(`/notes${listQuery}`, { token: t });
      setNotes(list.items);
      const notesByTag = buildNotesByTag(list.items, tagIds);
      setNotesByTag(notesByTag);
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
  }, [token, listQuery]);

  function logout() {
    localStorage.removeItem('yn_token');
    router.replace('/login');
  }

  async function reclassifyUntagged() {
    if (!token) return;
    setReclassifyLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<{ reclassifiedCount: number; total: number }>('/notes/reclassify-untagged', {
        method: 'POST',
        token,
      });
      await loadAll(token);
      if (res.reclassifiedCount > 0) {
        alert(`已重分类 ${res.reclassifiedCount} 条未归类的记录`);
      } else {
        alert(res.total === 0 ? '暂无未归类的记录' : '未归类记录无法自动匹配到合适标签，可手动编辑');
      }
    } catch (e: any) {
      setErr(e?.message ?? '重分类失败');
    } finally {
      setReclassifyLoading(false);
    }
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 'var(--font-title)', fontWeight: 700 }}>你的笔记</div>
        </div>
        <div className="row">
          {token ? (
            <button className="btn btnPrimary" onClick={() => setOpenQuickInputModal(true)}>
              快速录入
            </button>
          ) : null}
          <button className="btn" onClick={logout}>
            退出
          </button>
        </div>
      </div>

      {err ? (
        <div className="card" style={{ marginTop: 12, borderColor: 'rgba(220,38,38,0.4)', background: 'rgba(220,38,38,0.08)' }}>
          {err}
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 12, alignItems: 'flex-start', gap: 8 }}>
        <div className="card tagManagerCard" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          {token ? (
            <TagManager
              tags={tags}
              notesByTag={notesByTag}
              selectedTagId={selectedTagId}
              selectedNoteId={selectedNoteId}
              onSelect={(id) => {
                setSelectedTagId(id === selectedTagId ? null : id);
                setSelectedNoteId(null);
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
            selectedId={selectedNoteId}
            onSelect={setSelectedNoteId}
            viewMode={viewMode}
            filter={filter}
            onFilterChange={(f) => {
              setFilter(f);
              setSelectedNoteId(null);
            }}
            selectedTagName={selectedTagId ? getTagDisplayPath(tags, selectedTagId) : null}
            selectedTagId={selectedTagId}
            onViewModeChange={setViewMode}
            onEdit={(noteId) => setEditNoteId(noteId)}
            onDelete={async (noteId) => {
              if (!token) return;
              const ok = window.confirm('确认删除这条记录？（可在后续版本增加回收站）');
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
      {token ? (
        <QuickInputModal
          open={openQuickInputModal}
          onClose={() => setOpenQuickInputModal(false)}
          token={token}
          selectedTagId={selectedTagId}
          tags={tags}
          onSuccess={(result) => loadAll(token, result?.selectTagId ? { selectTagId: result.selectTagId } : undefined)}
        />
      ) : null}
    </div>
  );
}

