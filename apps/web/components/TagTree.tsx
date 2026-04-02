'use client';

import { useMemo } from 'react';
import type { NoteItem } from './NoteList';

export type TagNode = {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  path: string;
  depth: number;
  // Phase1：用于冷启动分类（手动关键词）与后续画像
  keywords?: {
    manual?: string[];
    counts?: Record<string, number>;
    updatedAt?: string;
  } | null;
  children: TagNode[];
};

/** 仅叶子标签（无子标签）用于统计数量；父级标签下不展示任何内容 */
function getNotesForTag(node: TagNode, notesByTag: Record<string, NoteItem[]>): NoteItem[] {
  if (node.children.length > 0) return [];
  return notesByTag[node.id] ?? [];
}

function TagItem({
  node,
  notesByTag,
  tagCounts,
  selectedTagId,
  selectedNoteId,
  onSelect,
  onSelectNote,
  onRecord,
  onDelete,
  onEdit,
}: {
  node: TagNode;
  notesByTag: Record<string, NoteItem[]>;
  tagCounts?: Record<string, number>;
  selectedTagId: string | null;
  selectedNoteId: string | null;
  onSelect: (tagId: string) => void;
  onSelectNote: (noteId: string | null) => void;
  onRecord?: (tagId: string) => void;
  onDelete?: (noteId: string) => void;
  onEdit?: (tag: TagNode) => void;
}) {
  const notes = getNotesForTag(node, notesByTag);
  const count =
    node.children.length === 0
      ? tagCounts && node.id in tagCounts
        ? tagCounts[node.id]
        : notes.length
      : 0;
  const isSelected = selectedTagId === node.id;

  return (
    <div style={{ marginLeft: node.depth > 1 ? '1.25rem' : 0, marginBottom: 0, position: 'relative' }}>
      {node.depth > 1 && (
        <div style={{
          position: 'absolute',
          left: '-0.75rem',
          top: '-0.5rem',
          bottom: '0.6rem',
          width: '1px',
          background: 'var(--border)',
          opacity: 0.5
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          className={`btn tagItemBtn ${isSelected ? 'selected' : ''}`}
          style={{
            flex: 1,
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0.4rem 0.75rem',
            borderRadius: '8px',
            minWidth: 0,
            fontSize: '0.9375rem',
            border: isSelected ? 'none' : '1px solid transparent',
            boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
          }}
          onClick={() => onSelect(node.id)}
        >
          <span style={{ 
            background: node.color ?? 'var(--text-muted)', 
            flexShrink: 0, 
            width: 8, 
            height: 8, 
            borderRadius: '50%',
            boxShadow: `0 0 0 4px ${node.color ? `${node.color}22` : 'var(--accent-soft)'}` 
          }} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: isSelected ? 650 : 500 }}>
            {node.name}
          </span>
          {count > 0 && (
            <span
              style={{
                flexShrink: 0,
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: '999px',
                background: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--panel2)',
                color: isSelected ? '#fff' : 'var(--text-muted)',
                fontWeight: 700,
              }}
            >
              {count}
            </span>
          )}
        </button>
        <div className="tag-actions" style={{ display: 'flex' }}>
           {onEdit && (
            <button
              className="btn"
              style={{ padding: '0.25rem', background: 'transparent', border: 'none', opacity: 0.4 }}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(node);
              }}
              title="编辑标签"
            >
              ✏️
            </button>
          )}
        </div>
      </div>
      {node.children.map((c) => (
        <TagItem
          key={c.id}
          node={c}
          notesByTag={notesByTag}
          tagCounts={tagCounts}
          selectedTagId={selectedTagId}
          selectedNoteId={selectedNoteId}
          onSelect={onSelect}
          onSelectNote={onSelectNote}
          onRecord={onRecord}
          onDelete={onDelete}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

export function TagTree({
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
  hideHeader,
}: {
  tags: TagNode[];
  notesByTag: Record<string, NoteItem[]>;
  tagCounts?: Record<string, number>;
  selectedTagId: string | null;
  selectedNoteId: string | null;
  onSelect: (tagId: string) => void;
  onSelectNote: (noteId: string | null) => void;
  onRecord?: (tagId: string) => void;
  onDelete?: (noteId: string) => void;
  onEdit?: (tag: TagNode) => void;
  hideHeader?: boolean;
}) {
  const empty = useMemo(() => tags.length === 0, [tags.length]);
  return (
    <div className="col" style={{ gap: 6 }}>
      {hideHeader ? null : (
        <>
          <div style={{ fontWeight: 600, fontSize: 14 }}>标签</div>
          <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>
            {empty ? '还没有标签。先在右侧录入一些内容，或后续补充标签管理。' : '点击标签查看对应记录'}
          </div>
        </>
      )}
      <div className="col" style={{ gap: 2 }}>
        {tags.map((t) => (
          <TagItem
            key={t.id}
            node={t}
            notesByTag={notesByTag}
            tagCounts={tagCounts}
            selectedTagId={selectedTagId}
            selectedNoteId={selectedNoteId}
            onSelect={onSelect}
            onSelectNote={onSelectNote}
            onRecord={onRecord}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}

