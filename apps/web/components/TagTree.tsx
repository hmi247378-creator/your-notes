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
  /** 各标签下的记录数（按当前筛选条件统计） */
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
  // 优先用 tagCounts（API 全量统计）；若 API 未返回该标签则回退到 notes 数量
  const count =
    node.children.length === 0
      ? tagCounts && node.id in tagCounts
        ? tagCounts[node.id]
        : notes.length
      : 0;
  const isSelected = selectedTagId === node.id;

  return (
    <div style={{ marginLeft: (node.depth - 1) * 10, marginBottom: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          className={`btn tagItemBtn ${isSelected ? 'selected' : ''}`}
          style={{
            flex: 1,
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 6px',
            borderRadius: 6,
            minWidth: 0,
            fontSize: 13,
          }}
          onClick={() => onSelect(node.id)}
        >
          <span className="dot" style={{ background: node.color ?? 'var(--muted)', flexShrink: 0, width: 8, height: 8 }} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
          <span
            style={{
              flexShrink: 0,
              fontSize: 11,
              padding: isSelected ? '1px 6px' : 0,
              borderRadius: 999,
              background: isSelected ? 'rgba(37,99,235,0.12)' : undefined,
              fontWeight: 500,
            }}
          >
            {String(count).padStart(2, '0')}
          </span>
        </button>
        {onRecord ? (
          <button
            className="btn"
            style={{ fontSize: 11, padding: '3px 5px', background: 'transparent', borderColor: 'transparent' }}
            onClick={(e) => {
              e.stopPropagation();
              onRecord(node.id);
            }}
          >
            + 添加
          </button>
        ) : null}
        {onEdit ? (
          <button
            className="btn"
            style={{ fontSize: 11, padding: '3px 5px', background: 'transparent', borderColor: 'transparent' }}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(node);
            }}
            title="编辑标签"
          >
            编辑
          </button>
        ) : null}
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

