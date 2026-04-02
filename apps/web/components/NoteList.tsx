'use client';

export type NoteItem = {
  id: string;
  contentPreview: string;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
  recordedAt?: string | null;
  archived: boolean;
};

/** 显示用日期：优先使用用户选择的记录日期，否则用创建时间 */
function displayDate(n: NoteItem): string {
  return n.recordedAt ?? n.createdAt;
}

export type NoteViewMode = 'list' | 'card';

export type RecordFilter = {
  /** 内容关键词 */
  q: string;
  /** 开始日期 YYYY-MM-DD */
  dateFrom: string;
  /** 结束日期 YYYY-MM-DD */
  dateTo: string;
  /** 时间筛选字段 */
  dateField: 'createdAt' | 'recordedAt';
  /** 排序字段 */
  sortBy: 'createdAt' | 'recordedAt';
  /** 排序方向 */
  sortOrder: 'asc' | 'desc';
};

export const DEFAULT_RECORD_FILTER: RecordFilter = {
  q: '',
  dateFrom: '',
  dateTo: '',
  dateField: 'recordedAt',
  sortBy: 'recordedAt',
  sortOrder: 'desc',
};

function formatDay(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** 是否为未智能归类的数据（无标签） */
function isUnclassified(n: NoteItem): boolean {
  return !n.tagIds || n.tagIds.length === 0;
}

export function NoteList({
  items,
  total,
  page,
  pageSize,
  onSelect,
  selectedId,
  viewMode,
  filter,
  onFilterChange,
  onViewModeChange,
  onDelete,
  onEdit,
  onAddReminder,
  selectedTagName,
  selectedTagId,
  onNewRecord,
  onQuickInput,
  onPageChange,
  onExport,
  exportLoading,
}: {
  items: NoteItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  selectedId: string | null;
  onSelect: (noteId: string) => void;
  viewMode: NoteViewMode;
  filter: RecordFilter;
  onFilterChange: (f: RecordFilter) => void;
  onViewModeChange: (v: NoteViewMode) => void;
  onDelete: (noteId: string) => void;
  /** 编辑记录 */
  onEdit?: (noteId: string) => void;
  /** 加入提醒 */
  onAddReminder?: (noteId: string) => void;
  /** 当前选中的标签名，用于提示「下方即该标签下的内容」 */
  selectedTagName?: string | null;
  /** 当前选中的标签 ID，用于「新建」按钮（需先选标签） */
  selectedTagId?: string | null;
  /** 点击新建时回调，打开快速录入弹窗直接保存到当前标签；仅在 selectedTagId 时可用 */
  onNewRecord?: () => void;
  /** 未选标签时的回退动作（例如打开快速录入弹窗） */
  onQuickInput?: () => void;
  /** 页码变更回调 */
  onPageChange?: (page: number) => void;
  /** 导出回调 */
  onExport?: () => void;
  /** 导出 loading 状态 */
  exportLoading?: boolean;
}) {
  const hasActiveFilter = filter.q.trim() || filter.dateFrom || filter.dateTo;

  return (
    <div className="col" style={{ gap: 0 }}>
      {/* 第一部分：操作与筛选 (Yellow Box Card) */}
      <div className="card" style={{ 
        border: '1px solid var(--border)', 
        boxShadow: 'var(--shadow-md)', 
        padding: '1.25rem', 
        marginBottom: '0',
        background: 'var(--panel)',
        borderRadius: '16px',
        position: 'sticky',
        top: '72px',
        zIndex: 20
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.02em', color: 'var(--text)' }}>
              记录{selectedTagName ? ` · ${selectedTagName}` : ''}
            </div>
            {onQuickInput && (
              <button
                type="button"
                className="btn btnPrimary"
                onClick={onQuickInput}
                style={{ borderRadius: '12px', padding: '0.625rem 1.25rem', boxShadow: 'var(--shadow-md)' }}
              >
                <span style={{ marginRight: 6 }}>+</span>
                快速录入
              </button>
            )}
          </div>
          
          <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            {onExport ? (
              <button
                type="button"
                className="btn"
                onClick={onExport}
                disabled={exportLoading}
                style={{ padding: '0.5rem 1rem' }}
              >
                {exportLoading ? '导出中…' : '导出 CSV'}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btnPrimary"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (selectedTagId && onNewRecord) onNewRecord();
                else if (onQuickInput) onQuickInput();
              }}
              style={{ padding: '0.5rem 1.25rem' }}
            >
              <span>+</span> 新建此类笔记
            </button>
            <div style={{ display: 'flex', background: 'var(--panel2)', padding: '4px', borderRadius: '10px' }}>
              <button 
                className={`btn ${viewMode === 'list' ? 'btnPrimary' : ''}`} 
                onClick={() => onViewModeChange('list')}
                style={{ border: 'none', boxShadow: viewMode === 'list' ? 'var(--shadow-sm)' : 'none', padding: '6px 12px' }}
              >
                列表
              </button>
              <button 
                className={`btn ${viewMode === 'card' ? 'btnPrimary' : ''}`} 
                onClick={() => onViewModeChange('card')}
                style={{ border: 'none', boxShadow: viewMode === 'card' ? 'var(--shadow-sm)' : 'none', padding: '6px 12px' }}
              >
                卡片
              </button>
            </div>
          </div>
        </div>

        {/* 筛选区域 */}
        <div style={{ padding: '1rem', background: 'var(--panel2)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 300px' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                <input
                  className="input"
                  placeholder="搜索关键词..."
                  value={filter.q}
                  onChange={(e) => onFilterChange({ ...filter, q: e.target.value })}
                  style={{ paddingLeft: '2.25rem' }}
                />
              </div>
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <input
                type="date"
                className="input"
                value={filter.dateFrom}
                onChange={(e) => onFilterChange({ ...filter, dateFrom: e.target.value })}
                style={{ minWidth: 150 }}
              />
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <input
                type="date"
                className="input"
                value={filter.dateTo}
                onChange={(e) => onFilterChange({ ...filter, dateTo: e.target.value })}
                style={{ minWidth: 150 }}
              />
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <select
                className="input"
                value={filter.dateField}
                onChange={(e) =>
                  onFilterChange({
                    ...filter,
                    dateField: e.target.value as 'createdAt' | 'recordedAt',
                  })
                }
                style={{ minWidth: 130 }}
              >
                <option value="recordedAt">记录日期</option>
                <option value="createdAt">创建日期</option>
              </select>
            </div>
            {hasActiveFilter ? (
              <button
                className="btn"
                onClick={() => onFilterChange(DEFAULT_RECORD_FILTER)}
                style={{ height: '2.5rem', background: 'transparent', border: 'none', color: 'var(--danger)', fontWeight: 600 }}
              >
                重置
              </button>
            ) : null}
          </div>
        </div>

        {/* 表头 (已移至 Card 1 底部) */}
        {viewMode === 'list' && items.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 120px 160px',
              gap: 12,
              padding: '0.75rem 1rem',
              background: 'var(--panel2)',
              fontSize: '0.875rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              marginTop: '0.5rem'
            }}
          >
            <span>记录日期</span>
            <span>内容详情</span>
            <span>创建时间</span>
            <span style={{ textAlign: 'right' }}>操作</span>
          </div>
        )}
      </div>

      {/* 间隙 (Red Box Gap Narrowed) */}
      <div style={{ height: '0.5rem' }} />

      {/* 第二部分：列表内容 (Card 2) */}
      <div className="card" style={{ border: 'none', boxShadow: 'var(--shadow-md)', padding: 0 }}>
        <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>

          {viewMode === 'list' ? (
            <div>
              {items.map((n) => {
                const unclassified = isUnclassified(n);
                const isActive = selectedId === n.id;
                return (
                  <div
                    key={n.id}
                    className="note-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px 1fr 120px 160px',
                      gap: 12,
                      alignItems: 'center',
                      padding: '0.875rem 1rem',
                      background: isActive ? 'var(--accent-soft)' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                    }}
                    onClick={() => onSelect(n.id)}
                  >
                    <div className="muted" style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
                      {formatDay(displayDate(n))}
                    </div>
                    <div
                      title={n.contentPreview || '(空)'}
                      style={{
                        textAlign: 'left',
                        fontSize: '0.9375rem',
                        lineHeight: 1.5,
                        color: isActive ? 'var(--accent)' : 'var(--text)',
                        fontWeight: isActive ? 600 : 400,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {n.contentPreview || <span style={{ opacity: 0.3 }}>(空)</span>}
                    </div>
                    <div className="muted" style={{ fontSize: '0.9375rem' }}>
                      {formatDay(n.createdAt)}
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      <button
                        className="btn"
                        style={{ padding: '4px 8px', fontSize: '0.9375rem', color: 'var(--accent)', opacity: unclassified || !onAddReminder ? 0.3 : 1 }}
                        disabled={unclassified || !onAddReminder}
                        onClick={(e) => { e.stopPropagation(); if (!unclassified && onAddReminder) onAddReminder(n.id); }}
                      >
                        提醒
                      </button>
                      <button
                        className="btn"
                        style={{ padding: '4px 8px', fontSize: '0.9375rem', color: 'var(--accent)', opacity: unclassified ? 0.3 : 1 }}
                        disabled={unclassified}
                        onClick={(e) => { e.stopPropagation(); if (!unclassified && onEdit) onEdit(n.id); }}
                      >
                        编辑
                      </button>
                      <button
                        className="btn"
                        style={{ padding: '4px 8px', fontSize: '0.9375rem', color: 'var(--danger)' }}
                        onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', padding: '1rem' }}>
              {items.map((n) => {
                const unclassified = isUnclassified(n);
                const isActive = selectedId === n.id;
                return (
                  <div
                    key={n.id}
                    className="card"
                    style={{
                      padding: '1.25rem',
                      borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                      boxShadow: isActive ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
                      background: isActive ? 'var(--accent-soft)' : 'var(--panel)',
                      cursor: 'pointer',
                    }}
                    onClick={() => onSelect(n.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span className="muted" style={{ fontSize: '0.75rem' }}>📅 {formatDay(displayDate(n))}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button disabled={unclassified || !onAddReminder} onClick={(e) => { e.stopPropagation(); if (onAddReminder) onAddReminder(n.id); }}>🔔</button>
                        <button disabled={unclassified} onClick={(e) => { e.stopPropagation(); if (onEdit) onEdit(n.id); }}>✏️</button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}>🗑️</button>
                      </div>
                    </div>
                    <div style={{ fontSize: '1rem', lineHeight: 1.6, minHeight: '4.8rem' }}>{n.contentPreview || <span style={{ opacity: 0.3 }}>(空内容)</span>}</div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.5rem', fontSize: '0.75rem' }} className="muted">创建于 {formatDay(n.createdAt)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {items.length === 0 && (
            <div style={{ padding: '4rem', textAlign: 'center', background: 'var(--panel2)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>Empty</div>
              <div className="muted">暂无记录</div>
            </div>
          )}

          {/* 底部统计与分页 */}
          {total != null || page != null ? (
            <div style={{ 
              padding: '1rem', 
              borderTop: '1px solid var(--border)',
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              fontSize: 'var(--font-body-sm)',
              background: 'var(--panel2)'
            }}>
              <span className="muted">
                共 <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{total ?? 0}</span> 条记录
              </span>
              {page != null && pageSize != null && total != null && total > pageSize && onPageChange && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button 
                    className="btn" 
                    style={{ padding: '4px 10px', height: '2rem' }}
                    disabled={page <= 1} 
                    onClick={() => onPageChange(page - 1)}
                  >
                    上一页
                  </button>
                  <span style={{ fontWeight: 600, minWidth: '3rem', textAlign: 'center' }}>{page} / {Math.ceil(total / pageSize)}</span>
                  <button 
                    className="btn" 
                    style={{ padding: '4px 10px', height: '2rem' }}
                    disabled={page >= Math.ceil(total / pageSize)} 
                    onClick={() => onPageChange(page + 1)}
                  >
                    下一页
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
