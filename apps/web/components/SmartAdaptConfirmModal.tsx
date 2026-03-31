'use client';

import { useState, useMemo, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { Modal } from './Modal';
import type { TagNode } from './TagTree';

type PreviewItem = { text: string; tagIds: string[]; suggestions: Array<{ tagId: string; score: number; level: string }> };

/** 根据 ID 查找标签节点（含完整 children） */
function findTagNodeById(tags: TagNode[], id: string): TagNode | null {
  for (const t of tags) {
    if (t.id === id) return t;
    const found = findTagNodeById(t.children, id);
    if (found) return found;
  }
  return null;
}

/** 获取标签显示名称：用 path 展示层级（如 工作-安全生产），无 path 则用 name */
function getTagDisplayName(tags: TagNode[], id: string): string {
  const node = findTagNodeById(tags, id);
  if (!node) return '未选择';
  return (node.path || node.name).replace(/\./g, '-');
}

/** 递归扁平化标签树，仅叶子节点（无子标签）用于归类 */
function flattenLeafTags(nodes: TagNode[]): TagNode[] {
  const out: TagNode[] = [];
  for (const n of nodes) {
    if (n.children.length === 0) out.push(n);
    else out.push(...flattenLeafTags(n.children));
  }
  return out;
}

/** 获取某父级标签下的所有叶子标签（用于归类到更具体的子级，如 工作 → 工作-安全生产） */
function getLeafTagsUnderParent(tags: TagNode[], parentTagId: string): TagNode[] {
  const parent = findTagNodeById(tags, parentTagId);
  if (!parent) return [];
  return flattenLeafTags(parent.children.length > 0 ? parent.children : [parent]);
}

/** 查找标签的父节点 ID */
function findParentId(tags: TagNode[], tagId: string): string | null {
  for (const t of tags) {
    if (t.children.some((c) => c.id === tagId)) return t.id;
    const found = findParentId(t.children, tagId);
    if (found) return found;
  }
  return null;
}

/**
 * 智能适配确认弹窗：展示每项内容及适配标签，用户可修改后确认保存
 */
export function SmartAdaptConfirmModal({
  open,
  onClose,
  token,
  tags,
  items,
  recordedAt,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  tags: TagNode[];
  items: PreviewItem[];
  recordedAt: string;
  onSuccess: (result?: { selectTagId?: string }) => void;
}) {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [itemTexts, setItemTexts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);

  // 当 items 变化时同步选中状态和可编辑文本
  useEffect(() => {
    setSelectedTagIds(items.map((i) => i.tagIds[0] ?? ''));
    setItemTexts(items.map((i) => i.text));
  }, [items]);

  const leafTags = useMemo(() => flattenLeafTags(tags), [tags]);

  /** 检查是否有选中父级标签（需选择子级才能保存） */
  const hasParentSelected = useMemo(() => {
    return selectedTagIds.some((id) => {
      if (!id) return false;
      const node = findTagNodeById(tags, id);
      return node && node.children.length > 0;
    });
  }, [selectedTagIds, tags]);

  // 当选中的标签改为子级时，清除父级校验错误
  useEffect(() => {
    if (err && err.includes('请选择具体子级标签') && !hasParentSelected) {
      setErr(null);
    }
  }, [selectedTagIds, tags, err, hasParentSelected]);

  /** 当前项展开时显示的标签：优先显示父级下的子级标签；若无则显示全部叶子 */
  const getTagsForExpand = (idx: number): TagNode[] => {
    const selId = selectedTagIds[idx];
    if (!selId) return leafTags;
    const node = findTagNodeById(tags, selId);
    if (!node) return leafTags;
    const isParent = node.children.length > 0;
    const parentId = isParent ? selId : findParentId(tags, selId);
    if (parentId) {
      const underParent = getLeafTagsUnderParent(tags, parentId);
      if (underParent.length > 0) return underParent;
    }
    return leafTags;
  };

  const updateItemText = (idx: number, text: string) => {
    setItemTexts((prev) => {
      const next = [...prev];
      next[idx] = text;
      return next;
    });
  };

  const updateTag = (idx: number, tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = [...prev];
      next[idx] = tagId;
      return next;
    });
    setExpandedIdx(null);
    setShowAllTags(false);
  };

  const openExpand = (idx: number) => {
    setExpandedIdx(idx);
    setShowAllTags(false);
  };

  const closeExpand = () => {
    setExpandedIdx(null);
    setShowAllTags(false);
  };

  const handleConfirm = async () => {
    if (hasParentSelected) {
      setErr('请选择具体子级标签（如 工作-安全生产），父级标签不能直接保存');
      return;
    }
    const payload = items.map((_, i) => ({
      text: (itemTexts[i] ?? items[i]!.text).trim(),
      tagIds: selectedTagIds[i] ? [selectedTagIds[i]!] : [],
    }));
    const emptyIdx = payload.findIndex((p) => !p.text);
    if (emptyIdx >= 0) {
      setErr('请填写每项内容，不可为空');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch<{ createdCount: number; items: Array<{ id: string; text: string; tagIds: string[] }> }>(
        '/notes/ingest/confirm',
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            items: payload,
            source: 'pc',
            recordedAt: recordedAt ? `${recordedAt}T${new Date().toTimeString().slice(0, 8)}` : undefined,
          }),
        }
      );
      const firstTagId = data.items[0]?.tagIds?.[0] ?? null;
      onSuccess(firstTagId ? { selectTagId: firstTagId } : undefined);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? '保存失败');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Modal title="确认适配标签" open={open} onClose={onClose} contentWidth={640} square>
      <div className="col">
        <div className="muted" style={{ fontSize: 'var(--font-small)', marginBottom: 8 }}>
          请确认每项内容及归类标签，可直接编辑文字或点击标签进行修改
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {items.map((item, idx) => (
            <div
              key={idx}
              className="card"
              style={{
                marginBottom: 12,
                padding: 12,
                borderColor: 'var(--border)',
              }}
            >
              <textarea
                className="textarea"
                value={itemTexts[idx] ?? item.text}
                onChange={(e) => updateItemText(idx, e.target.value)}
                style={{
                  marginBottom: 10,
                  fontSize: 'var(--font-body-sm)',
                  lineHeight: 1.3,
                  minHeight: 60,
                  resize: 'vertical',
                }}
                placeholder="输入或修改内容"
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <span className="muted" style={{ fontSize: 'var(--font-caption)' }}>归类到：</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, position: 'relative' }}>
                  {expandedIdx === idx ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        maxWidth: 480,
                        padding: 8,
                        background: 'var(--panel2)',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                      }}
                    >
                      {(() => {
                        const displayTags = showAllTags ? leafTags : getTagsForExpand(idx);
                        const isSubset = displayTags.length < leafTags.length && leafTags.length > 0;
                        if (displayTags.length === 0) {
                          return (
                            <span className="muted" style={{ fontSize: 'var(--font-caption)' }}>
                              暂无标签，请先创建
                            </span>
                          );
                        }
                        return (
                          <>
                            {displayTags.map((t) => {
                              const active = selectedTagIds[idx] === t.id;
                              return (
                                <button
                                  key={t.id}
                                  className={`btn ${active ? 'btnPrimary' : ''}`}
                                  style={{ padding: '6px 10px', fontSize: 'var(--font-caption)' }}
                                  onClick={() => updateTag(idx, t.id)}
                                >
                                  {(t.path || t.name).replace(/\./g, '-')}
                                </button>
                              );
                            })}
                            {isSubset ? (
                              <button
                                className="btn"
                                style={{ padding: '6px 10px', fontSize: 'var(--font-caption)' }}
                                onClick={() => setShowAllTags(true)}
                              >
                                全部标签
                              </button>
                            ) : null}
                            <button
                              className="btn"
                              style={{ padding: '6px 10px', fontSize: 'var(--font-caption)' }}
                              onClick={closeExpand}
                            >
                              收起
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <>
                      <button
                        className="btn btnPrimary"
                        style={{ padding: '6px 12px', fontSize: 'var(--font-caption)' }}
                        onClick={() => (expandedIdx === idx ? closeExpand() : openExpand(idx))}
                      >
                        {selectedTagIds[idx]
                          ? getTagDisplayName(tags, selectedTagIds[idx]!)
                          : '选择标签'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {err ? (
          <div className="card" style={{ marginTop: 8, borderColor: 'rgba(220,38,38,0.4)', background: 'rgba(220,38,38,0.08)' }}>
            {err}
          </div>
        ) : null}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={onClose} disabled={loading}>
            取消
          </button>
          <button className="btn btnPrimary" onClick={handleConfirm} disabled={loading}>
            {loading ? '保存中…' : '确认保存'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
