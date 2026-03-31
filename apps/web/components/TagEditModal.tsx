'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/Modal';
import type { TagNode } from '@/components/TagTree';

type FlatTag = { id: string; name: string; depth: number };

function collectDescendantIds(node: TagNode): Set<string> {
  const ids = new Set<string>([node.id]);
  for (const c of node.children) {
    for (const id of collectDescendantIds(c)) ids.add(id);
  }
  return ids;
}

function flattenTags(nodes: TagNode[], excludeIds: Set<string>, out: FlatTag[] = []): FlatTag[] {
  for (const n of nodes) {
    if (!excludeIds.has(n.id)) out.push({ id: n.id, name: n.name, depth: n.depth });
    flattenTags(n.children, excludeIds, out);
  }
  return out;
}

function indentLabel(depth: number, name: string) {
  const prefix = depth > 1 ? `${'—'.repeat(Math.min(6, depth - 1))} ` : '';
  return `${prefix}${name}`;
}

export function TagEditModal({
  open,
  tag,
  tags,
  onClose,
  token,
  onSuccess,
}: {
  open: boolean;
  tag: TagNode | null;
  tags: TagNode[];
  onClose: () => void;
  token: string;
  onSuccess: () => void;
}) {
  const flat = useMemo(() => {
    if (!tag) return [];
    const excludeIds = collectDescendantIds(tag);
    return flattenTags(tags, excludeIds);
  }, [tags, tag]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5b8cff');
  const [parentId, setParentId] = useState<string | null>(null);
  const [keywordsText, setKeywordsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (tag) {
      setName(tag.name);
      setColor(tag.color ?? '#5b8cff');
      setParentId(tag.parentId);
      const manual = (tag.keywords as { manual?: string[] })?.manual ?? [];
      setKeywordsText(manual.join('，'));
      setErr(null);
    }
  }, [tag, open]);

  async function update() {
    if (!tag) return;
    setLoading(true);
    setErr(null);
    try {
      const keywords = keywordsText
        .split(/[,，\n]/g)
        .map((s) => s.trim())
        .filter(Boolean);

      await apiFetch(`/tags/${tag.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          name: name.trim(),
          color,
          parentId,
          keywords,
        }),
      });

      onClose();
      onSuccess();
    } catch (e: any) {
      setErr(e?.message ?? '更新失败');
    } finally {
      setLoading(false);
    }
  }

  if (!tag) return null;

  return (
    <Modal title={`编辑标签 · ${tag.name}`} open={open} onClose={onClose}>
      <div className="col">
        <input className="input" placeholder="标签名称" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="muted" style={{ width: 72 }}>
            颜色
          </div>
          <input
            className="input"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 64, padding: 6 }}
          />
          <input className="input" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>

        <div className="row" style={{ alignItems: 'center' }}>
          <div className="muted" style={{ width: 72 }}>
            父级
          </div>
          <select
            className="input"
            value={parentId ?? ''}
            onChange={(e) => setParentId(e.target.value ? e.target.value : null)}
          >
            <option value="">（无，作为根标签）</option>
            {flat.map((t) => (
              <option key={t.id} value={t.id}>
                {indentLabel(t.depth, t.name)}
              </option>
            ))}
          </select>
        </div>

        <div className="col">
          <div className="muted" style={{ fontSize: 'var(--font-small)' }}>
            关键词（可选，用于分类；逗号分隔）
          </div>
          <textarea
            className="textarea"
            placeholder="会议, 纪要, 评审"
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
          />
        </div>

        {err ? (
          <div className="card" style={{ borderColor: 'rgba(220,38,38,0.4)', background: 'rgba(220,38,38,0.08)' }}>
            {err}
          </div>
        ) : null}

        <button className="btn btnPrimary" onClick={update} disabled={loading || name.trim().length === 0}>
          {loading ? '保存中…' : '保存'}
        </button>
      </div>
    </Modal>
  );
}
