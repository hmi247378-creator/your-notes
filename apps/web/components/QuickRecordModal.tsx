'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Modal } from './Modal';

/**
 * 在指定标签下直接添加记录（无需智能匹配）
 */
export function QuickRecordModal({
  open,
  tagId,
  tagName,
  token,
  onClose,
  onSuccess,
}: {
  open: boolean;
  tagId: string;
  tagName: string;
  token: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [text, setText] = useState('');
  const [dateVal, setDateVal] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** 判断内容是否包含多个列表项（编号或圆点） */
  function looksEnumerated(raw: string): boolean {
    const lines = raw.split(/\r?\n/).map((l) => l.trim());
    const pattern = /^(\d+[\.\)\）、，,．]|[-*•·])\s*/;
    let count = 0;
    for (const l of lines) {
      if (!l) continue;
      if (pattern.test(l)) count += 1;
    }
    return count >= 2;
  }

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLoading(true);
    setErr(null);
    try {
      const single = !looksEnumerated(trimmed);
      await apiFetch('/notes/ingest', {
        method: 'POST',
        token,
        body: JSON.stringify({
          text: trimmed,
          source: 'pc',
          singleItem: single,
          smartSplit: !single, // 如果有多行编号，启用智能拆分
          preferredTagId: tagId, // 锁定到当前分类
          recordedAt: dateVal ? `${dateVal}T${new Date().toTimeString().slice(0, 8)}` : undefined,
        }),
      });
      setText('');
      onSuccess();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? '保存失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="快速录入" open={open} onClose={onClose} contentWidth={640} square>
      <div className="col">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="row" style={{ alignItems: 'center', gap: 12 }}>
            <label className="muted" style={{ fontSize: 'var(--font-small)' }}>
              记录日期
            </label>
            <input
              type="date"
              className="input"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
              style={{ width: 'auto', minWidth: 140 }}
            />
            <div
              style={{
                padding: '4px 12px',
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                fontWeight: 600,
              }}
            >
              当前分类：{tagName}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={onClose}>
              取消
            </button>
            <button className="btn btnPrimary" onClick={handleSave} disabled={!text.trim() || loading}>
              {loading ? '保存中…' : '直接保存'}
            </button>
          </div>
        </div>

        <div className="col" style={{ marginTop: 12 }}>
          <textarea
            className="textarea"
            placeholder={`输入内容，将直接保存到「${tagName}」... \n支持序号（1、2、）自动拆分为多条记录`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ minHeight: 192 }}
          />
        </div>

        {err ? (
          <div
            className="card"
            style={{
              marginTop: 12,
              borderColor: 'rgba(220,38,38,0.4)',
              background: 'rgba(220,38,38,0.08)',
            }}
          >
            {err}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
