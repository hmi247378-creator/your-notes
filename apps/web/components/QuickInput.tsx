'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { TagNode } from './TagTree';

type Suggestion = { tagId: string; score: number; level: 'high' | 'mid' | 'low' };

/** 智能适配预览项：与 API /notes/ingest/preview 返回格式一致 */
export type AdaptPreviewItem = { text: string; tagIds: string[]; suggestions: Array<{ tagId: string; score: number; level: string }> };

function findTagNameById(tags: TagNode[], id: string): string | null {
  for (const t of tags) {
    if (t.id === id) return t.name;
    const found = findTagNameById(t.children, id);
    if (found) return found;
  }
  return null;
}

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

export function QuickInput({
  token,
  selectedTagId,
  tags,
  onCreated,
  inModal,
  onAdaptPreview,
}: {
  token: string;
  selectedTagId: string | null;
  tags: TagNode[];
  /** 适配/保存成功后回调，可传入要选中的标签 ID，便于自动展示该标签下的记录 */
  onCreated: (result?: { selectTagId?: string }) => void;
  /** 在弹窗内展示时使用，不渲染外层 card 和标题 */
  inModal?: boolean;
  /** 弹窗模式下，智能适配先预览，回调展示确认弹窗（由父组件渲染 SmartAdaptConfirmModal） */
  onAdaptPreview?: (items: AdaptPreviewItem[], recordedAt: string) => void;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [chosenTagIds, setChosenTagIds] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [recordedAt, setRecordedAt] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const canSubmit = useMemo(() => text.trim().length > 0 && !loading, [text, loading]);

  async function applySuggestion(tagId: string) {
    if (!text.trim() || loading) return;
    setLoading(true);
    setErr(null);
    setSuccessMsg(null);
    try {
      const data = await apiFetch<{
        createdCount: number;
        items: Array<{ id: string; text: string; tagIds: string[] }>;
      }>('/notes/ingest', {
        method: 'POST',
        token,
        body: JSON.stringify({
          text: text.trim(),
          source: 'pc',
          singleItem: true,
          smartSplit: false,
          preferredTagId: tagId,
          recordedAt: recordedAt ? `${recordedAt}T${new Date().toTimeString().slice(0, 8)}` : undefined,
        }),
      });
      setText('');
      setSuggestions([]);
      setChosenTagIds([]);
      setSuggestionId(null);
      const firstTagId = data.items[0]?.tagIds?.[0] ?? tagId;
      onCreated(firstTagId ? { selectTagId: firstTagId } : undefined);
      const count = data.items?.length ?? data.createdCount ?? 1;
      const tagNames = [...new Set(data.items?.flatMap((i) => i.tagIds) ?? [])].map((id) => findTagNameById(tags, id)).filter(Boolean) as string[];
      const tagStr = tagNames.length ? tagNames.join('、') : '未分类';
      setSuccessMsg(`已创建 ${count} 条记录，归类到：${tagStr}。`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (e: any) {
      setErr(e?.message ?? '保存失败');
    } finally {
      setLoading(false);
    }
  }

  async function classify() {
    setErr(null);
    try {
      const data = await apiFetch<{ suggestionId: string; suggestions: Suggestion[] }>('/classify', {
        method: 'POST',
        token,
        body: JSON.stringify({ text }),
      });
      // 只取推荐的第一条标签（根据内容推荐一个）
      const topOne = data.suggestions.slice(0, 1);
      setSuggestions(topOne);
      setSuggestionId(data.suggestionId);
      setChosenTagIds(topOne.length ? [topOne[0]!.tagId] : []);
    } catch (e: any) {
      setErr(e?.message ?? '分类失败');
    }
  }

  /** 智能适配：弹窗模式下先预览并跳出确认弹窗；非弹窗模式直接保存 */
  async function adapt() {
    if (!canSubmit) return;
    setLoading(true);
    setErr(null);
    setSuccessMsg(null);
    try {
      const single = !looksEnumerated(text.trim());
      // 弹窗模式：先预览，由父组件展示确认弹窗
      if (inModal && onAdaptPreview) {
        const data = await apiFetch<{ items: AdaptPreviewItem[] }>('/notes/ingest/preview', {
          method: 'POST',
          token,
          body: JSON.stringify({
            text: text.trim(),
            singleItem: single,
            smartSplit: single ? false : true,
          }),
        });
        onAdaptPreview(data.items, recordedAt);
        return;
      }

      // 非弹窗模式：直接保存
      const data = await apiFetch<{
        createdCount: number;
        items: Array<{ id: string; text: string; tagIds: string[] }>;
      }>('/notes/ingest', {
        method: 'POST',
        token,
        body: JSON.stringify({
          text: text.trim(),
          source: 'pc',
          singleItem: !looksEnumerated(text.trim()),
          preferredTagId: undefined,
          smartSplit: looksEnumerated(text.trim()),
          recordedAt: recordedAt ? `${recordedAt}T${new Date().toTimeString().slice(0, 8)}` : undefined,
        }),
      });

      setText('');
      setSuggestions([]);
      setChosenTagIds([]);
      setSuggestionId(null);

      const firstTagId = data.items[0]?.tagIds?.[0] ?? selectedTagId;
      onCreated(firstTagId ? { selectTagId: firstTagId } : undefined);

      const count = data.items?.length ?? data.createdCount ?? 1;
      const tagNames = [...new Set(data.items?.flatMap((i) => i.tagIds) ?? [])].map((id) => findTagNameById(tags, id)).filter(Boolean) as string[];
      const tagStr = tagNames.length ? tagNames.join('、') : '未分类';
      setSuccessMsg(`已创建 ${count} 条记录，归类到：${tagStr}。`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (e: any) {
      setErr(e?.message ?? '适配失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={inModal ? '' : 'card'}>
      <div style={{ display: 'flex', justifyContent: inModal ? 'flex-start' : 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {!inModal ? (
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-heading)' }}>快速录入</div>
          </div>
        ) : null}
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
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
          <button className="btn" onClick={classify} disabled={loading || text.trim().length === 0}>
            推荐标签
          </button>
          <button className="btn btnPrimary" onClick={adapt} disabled={!canSubmit}>
            {loading ? '智能适配中…' : '智能适配'}
          </button>
        </div>
      </div>

      <div className="col" style={{ marginTop: 12 }}>
        <textarea
          className="textarea"
          placeholder="输入内容… 推荐用序号（1、2、）区分多条事项，或用「感悟：」等标签+冒号表示整段为一条，点击「智能适配」自动拆分并归类"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={inModal ? { minHeight: 192 } : undefined}
        />
      </div>

      {err ? (
        <div className="card" style={{ marginTop: 12, borderColor: 'rgba(220,38,38,0.4)', background: 'rgba(220,38,38,0.08)' }}>
          {err}
        </div>
      ) : null}

      {successMsg ? (
        <div className="card" style={{ marginTop: 12, borderColor: 'rgba(22,163,74,0.4)', background: 'rgba(22,163,74,0.08)' }}>
          {successMsg}
        </div>
      ) : null}

      {suggestions.length ? (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 8, fontSize: 'var(--font-caption)' }}>
            推荐标签
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {suggestions.map((s) => {
              const active = chosenTagIds.includes(s.tagId);
              const tagName = findTagNameById(tags, s.tagId) ?? s.tagId;
              return (
                <button
                  key={s.tagId}
                  className={`btn ${active ? 'btnPrimary' : ''}`}
                  onClick={() => applySuggestion(s.tagId)}
                >
                  {tagName}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
