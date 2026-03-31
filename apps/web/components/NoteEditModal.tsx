'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Modal } from './Modal';

type NoteDetail = {
  id: string;
  contentMarkdown: string;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
  recordedAt?: string | null;
  archived: boolean;
};

/**
 * 编辑单条记录：修改内容并保存
 */
export function NoteEditModal({
  open,
  noteId,
  token,
  onClose,
  onSuccess,
}: {
  open: boolean;
  noteId: string | null;
  token: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [content, setContent] = useState('');
  const [recordedAt, setRecordedAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** 将 ISO 或日期字符串转为 YYYY-MM-DD 供 input[type=date] 使用 */
  function toDateValue(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  /** batch: 和 date: 为虚拟聚合项，不支持编辑 */
  const isEditableId = noteId && !noteId.startsWith('batch:') && !noteId.startsWith('date:');

  useEffect(() => {
    if (!open || !noteId || !token || !isEditableId) return;
    setFetching(true);
    setErr(null);
    apiFetch<NoteDetail>(`/notes/${noteId}`, { token })
      .then((note) => {
        setContent(note.contentMarkdown ?? '');
        setRecordedAt(toDateValue(note.recordedAt ?? note.createdAt));
      })
      .catch((e: any) => {
        setErr(e?.message ?? '加载失败');
      })
      .finally(() => {
        setFetching(false);
      });
  }, [open, noteId, token]);

  async function handleSave() {
    if (!noteId || !token || !isEditableId) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    setLoading(true);
    setErr(null);
    try {
      const payload: { contentMarkdown: string; recordedAt?: string } = { contentMarkdown: trimmed };
      if (recordedAt.trim()) {
        payload.recordedAt = `${recordedAt}T00:00:00`;
      }
      await apiFetch(`/notes/${noteId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(payload),
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? '保存失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="编辑记录" open={open} onClose={onClose}>
      <div className="col">
        {open && noteId && !isEditableId ? (
          <>
            <div className="muted" style={{ marginBottom: 12 }}>
              批次或按日期合并的记录不支持单独编辑，请选择左侧标签查看单条记录后再编辑。
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        ) : fetching ? (
          <div className="muted">加载中…</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <label className="muted" style={{ fontSize: 'var(--font-small)' }}>
                记录日期
              </label>
              <input
                type="date"
                className="input"
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
                style={{ width: 'auto', minWidth: 140 }}
              />
            </div>
            <textarea
              className="textarea"
              placeholder="输入记录内容"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ minHeight: 120 }}
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
              <button className="btn btnPrimary" onClick={handleSave} disabled={!content.trim() || loading}>
                {loading ? '保存中…' : '保存'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
