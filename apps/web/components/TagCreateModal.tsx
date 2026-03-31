'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/Modal';
import type { TagNode } from '@/components/TagTree';

type FlatTag = { id: string; name: string; depth: number };

function flattenTags(nodes: TagNode[], out: FlatTag[] = []): FlatTag[] {
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth: n.depth });
    flattenTags(n.children, out);
  }
  return out;
}

function indentLabel(depth: number, name: string) {
  const prefix = depth > 1 ? `${'—'.repeat(Math.min(6, depth - 1))} ` : '';
  return `${prefix}${name}`;
}

export function TagCreateModal({
  open,
  onClose,
  token,
  tags,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  tags: TagNode[];
  onCreated: () => void;
}) {
  const flat = useMemo(() => flattenTags(tags), [tags]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5b8cff');
  const [parentId, setParentId] = useState<string | null>(null);
  const [keywordsText, setKeywordsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setName('');
    setColor('#5b8cff');
    setParentId(null);
    setKeywordsText('');
    setErr(null);
  }

  async function create() {
    setLoading(true);
    setErr(null);
    try {
      const keywords = keywordsText
        .split(/[,，\n]/g)
        .map((s) => s.trim())
        .filter(Boolean);

      await apiFetch('/tags', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name,
          color,
          parentId,
          keywords: keywords.length ? keywords : undefined,
        }),
      });

      reset();
      onClose();
      onCreated();
    } catch (e: any) {
      setErr(e?.message ?? '创建失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="新建标签"
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
    >
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
            关键词（可选，用于冷启动分类更准；逗号分隔）
          </div>
          <textarea
            className="textarea"
            placeholder="会议, 纪要, 评审, 项目A"
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
          />
        </div>

        {err ? (
          <div className="card" style={{ borderColor: 'rgba(220,38,38,0.4)', background: 'rgba(220,38,38,0.08)' }}>
            {err}
          </div>
        ) : null}

        <button className="btn btnPrimary" onClick={create} disabled={loading || name.trim().length === 0}>
          {loading ? '创建中…' : '创建'}
        </button>
      </div>
    </Modal>
  );
}

