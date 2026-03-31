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
  const [timeVal, setTimeVal] = useState(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLoading(true);
    setErr(null);
    try {
      await apiFetch('/notes', {
        method: 'POST',
        token,
        body: JSON.stringify({
          contentMarkdown: trimmed,
          tagIds: [tagId],
          source: 'pc',
          recordedAt: dateVal ? `${dateVal}T${(timeVal || '00:00')}:00` : undefined,
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
    <Modal title={`新建 · ${tagName}`} open={open} onClose={onClose}>
      <div className="col">
        <div
          className="card"
          style={{
            marginBottom: 12,
            padding: 12,
            background: 'var(--panel2)',
            borderColor: 'var(--border)',
            fontWeight: 600,
          }}
        >
          保存到：{tagName}
        </div>
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          <label className="muted" style={{ fontSize: 'var(--font-small)' }}>
            记录时间
          </label>
          <input
            type="date"
            className="input"
            value={dateVal}
            onChange={(e) => setDateVal(e.target.value)}
            style={{ width: 'auto', minWidth: 140 }}
          />
          <input
            type="time"
            className="input"
            value={timeVal}
            onChange={(e) => setTimeVal(e.target.value)}
            style={{ width: 'auto', minWidth: 120 }}
          />
        </div>
        <textarea
          className="textarea"
          placeholder="输入内容，将直接保存到当前标签…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {err ? (
          <div
            className="card"
            style={{
              borderColor: 'rgba(220,38,38,0.4)',
              background: 'rgba(220,38,38,0.08)',
            }}
          >
            {err}
          </div>
        ) : null}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btnPrimary" onClick={handleSave} disabled={!text.trim() || loading}>
            {loading ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
