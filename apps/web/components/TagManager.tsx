'use client';

import { useMemo } from 'react';
import { TagTree, type TagNode } from '@/components/TagTree';
import type { NoteItem } from '@/components/NoteList';

/**
 * 左侧栏：标签分类 + 各标签下的内容（拆分后的记录显示在「添加」下方）
 */
export function TagManager({
  tags,
  notesByTag,
  tagCounts,
  selectedTagId,
  selectedNoteId,
  onSelect,
  onSelectNote,
  onRecord,
  onDelete,
  onEdit,
  onManageTags,
  sectionTitle,
}: {
  tags: TagNode[];
  notesByTag: Record<string, NoteItem[]>;
  /** 各标签下的记录数（按当前筛选条件统计，优先于 notesByTag 用于展示数量） */
  tagCounts?: Record<string, number>;
  selectedTagId: string | null;
  selectedNoteId: string | null;
  onSelect: (tagId: string) => void;
  onSelectNote: (noteId: string | null) => void;
  onRecord?: (tagId: string) => void;
  onDelete?: (noteId: string) => void;
  onEdit?: (tag: TagNode) => void;
  onManageTags?: () => void;
  /** 分区标题，默认「标签分类」；提醒事项页用「任务分类」 */
  sectionTitle?: string;
}) {
  const empty = useMemo(() => tags.length === 0, [tags.length]);
  const title = sectionTitle ?? '标签分类';

  return (
    <div className="col tagManagerInner">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 0.5rem' }}>
        <div style={{ fontWeight: 800, fontSize: '0.875rem', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.8 }}>{title}</div>
        {onManageTags ? (
          <button
            className="btn btnPrimary"
            onClick={onManageTags}
            title="新建标签"
            style={{
              width: 24,
              height: 24,
              padding: 0,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            +
          </button>
        ) : null}
      </div>
      {empty ? <div className="muted" style={{ fontSize: '0.8125rem', padding: '0.5rem' }}>还没有标签。点击右上角“+”号开始创建。</div> : null}
      <TagTree
        tags={tags}
        notesByTag={notesByTag}
        tagCounts={tagCounts}
        selectedTagId={selectedTagId}
        selectedNoteId={selectedNoteId}
        onSelect={onSelect}
        onSelectNote={onSelectNote}
        onRecord={onRecord}
        onDelete={onDelete}
        onEdit={onEdit}
        hideHeader
      />
      {onManageTags && !empty ? (
        <button
          className="btn"
          onClick={onManageTags}
          style={{
            marginTop: 4,
            padding: '6px 10px',
            fontSize: 12,
            background: 'transparent',
            borderColor: 'transparent',
          }}
        >
          + 管理所有标签
        </button>
      ) : null}
    </div>
  );
}

