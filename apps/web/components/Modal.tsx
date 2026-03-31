'use client';

import type { ReactNode, CSSProperties } from 'react';

/**
 * 超轻量 Modal（不依赖 UI 库）
 * - Phase 1 只用于标签管理弹窗：新建/重命名/移动/合并/删除确认
 */
export function Modal({
  title,
  open,
  onClose,
  children,
  contentWidth = 720,
  square,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 弹窗内容区宽度（px），默认 720 */
  contentWidth?: number;
  /** 正方形显示：宽高相等 */
  square?: boolean;
}) {
  if (!open) return null;

  const cardStyle: CSSProperties = square
    ? {
        width: `min(${contentWidth}px, calc(100vw - 32px), calc(100vh - 32px))`,
        height: `min(${contentWidth}px, calc(100vw - 32px), calc(100vh - 32px))`,
        padding: 16,
      }
    : {
        width: `min(${contentWidth}px, calc(100vw - 32px))`,
        padding: 16,
      };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={cardStyle}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--font-heading)' }}>{title}</div>
          <button className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
        <div style={{ marginTop: 12, ...(square ? { overflowY: 'auto' } : {}) }}>{children}</div>
      </div>
    </div>
  );
}

