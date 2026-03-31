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
  const viewBtn = (key: NoteViewMode, label: string) => (
    <button className={`btn ${viewMode === key ? 'btnPrimary' : ''}`} onClick={() => onViewModeChange(key)}>
      {label}
    </button>
  );

  const hasActiveFilter = filter.q.trim() || filter.dateFrom || filter.dateTo;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 'var(--font-heading)' }}>
            记录{selectedTagName ? ` · 「${selectedTagName}」下` : ''}
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 'var(--font-caption)' }}>
            {selectedTagName ? '左侧标签下的内容即显示于此' : '支持搜索、时间等多条件筛选'}
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {onExport ? (
            <button
              type="button"
              className="btn"
              onClick={onExport}
              disabled={exportLoading}
            >
              {exportLoading ? '导出中…' : '导出'}
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
            title={selectedTagId ? '在当前标签下直接创建记录' : '打开快速录入'}
          >
            新建
          </button>
          {viewBtn('list', '列表')}
          {viewBtn('card', '卡片')}
        </div>
      </div>

      {/* 筛选条件区域 */}
      <div
        style={{
          marginTop: 12,
          padding: 12,
          background: 'var(--panel2)',
          borderRadius: 8,
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px', minWidth: 140 }}>
            <label style={{ display: 'block', fontSize: 'var(--font-small)', color: 'var(--muted)', marginBottom: 4 }}>
              内容
            </label>
            <input
              className="input"
              placeholder="关键词搜索"
              value={filter.q}
              onChange={(e) => onFilterChange({ ...filter, q: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-small)', color: 'var(--muted)', marginBottom: 4 }}>
              开始日期
            </label>
            <input
              type="date"
              className="input"
              value={filter.dateFrom}
              onChange={(e) => onFilterChange({ ...filter, dateFrom: e.target.value })}
              style={{ minWidth: 140 }}
            />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-small)', color: 'var(--muted)', marginBottom: 4 }}>
              结束日期
            </label>
            <input
              type="date"
              className="input"
              value={filter.dateTo}
              onChange={(e) => onFilterChange({ ...filter, dateTo: e.target.value })}
              style={{ minWidth: 140 }}
            />
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-small)', color: 'var(--muted)', marginBottom: 4 }}>
              时间类型
            </label>
            <select
              className="input"
              value={filter.dateField}
              onChange={(e) =>
                onFilterChange({
                  ...filter,
                  dateField: e.target.value as 'createdAt' | 'recordedAt',
                })
              }
              style={{ minWidth: 110 }}
            >
              <option value="recordedAt">记录日期</option>
              <option value="createdAt">创建时间</option>
            </select>
          </div>
          {hasActiveFilter ? (
            <button
              className="btn"
              onClick={() => onFilterChange(DEFAULT_RECORD_FILTER)}
              style={{ fontSize: 'var(--font-small)' }}
            >
              清除筛选
            </button>
          ) : null}
        </div>
      </div>

      <div className="col" style={{ marginTop: 12 }}>
        {viewMode === 'list' ? (
          <>
            {/* 表头：记录日期、内容、创建时间、操作（有数据时显示） */}
            {items.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 120px 220px',
                  gap: 4,
                  padding: '6px 4px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--muted)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span>记录日期</span>
                <span>内容</span>
                <span>创建时间</span>
                <span>操作</span>
              </div>
            ) : null}
            {items.map((n) => {
              const unclassified = isUnclassified(n);
              return (
                <div
                  key={n.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr 120px 220px',
                    gap: 4,
                    alignItems: 'center',
                    minHeight: 22,
                    padding: '6px 4px',
                    background: selectedId === n.id ? 'rgba(37,99,235,0.08)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div className="muted" style={{ fontSize: 12, flexShrink: 0 }}>
                    {formatDay(displayDate(n))}
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(n.id)}
                    onKeyDown={(e) => e.key === 'Enter' && onSelect(n.id)}
                    title={n.contentPreview || '(空)'}
                    style={{
                      textAlign: 'left',
                      fontSize: 13,
                      lineHeight: 1.6,
                      cursor: 'pointer',
                      userSelect: 'text',
                      WebkitUserSelect: 'text',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {n.contentPreview || '(空)'}
                  </div>
                  <div className="muted" style={{ fontSize: 12, flexShrink: 0 }}>
                    {formatDay(n.createdAt)}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button
                      className="btn btnNoBorder"
                      style={{
                        fontSize: 11,
                        ...(unclassified || !onAddReminder ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                      }}
                      disabled={unclassified || !onAddReminder}
                      title={
                        unclassified
                          ? '未归类记录需先编辑添加标签'
                          : !onAddReminder
                            ? '此页面不支持提醒'
                            : '加入提醒'
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!unclassified && onAddReminder) onAddReminder(n.id);
                      }}
                    >
                      提醒
                    </button>
                    <button
                      className="btn btnNoBorder"
                      style={{
                        fontSize: 11,
                        ...(unclassified ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                      }}
                      disabled={unclassified}
                      title={unclassified ? '未归类记录需先编辑添加标签' : '编辑'}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!unclassified && onEdit) onEdit(n.id);
                      }}
                    >
                      编辑
                    </button>
                    <button
                      className="btn btnNoBorder btnDelete"
                      style={{
                        fontSize: 11,
                        color: 'var(--danger)',
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete(n.id);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        ) : null}

        {viewMode === 'card' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
            {items.map((n) => {
              const unclassified = isUnclassified(n);
              return (
                <div
                  key={n.id}
                  style={{
                    padding: 1,
                    paddingRight: 140,
                    position: 'relative',
                    background: selectedId === n.id ? 'rgba(37,99,235,0.08)' : 'var(--panel2)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2 }}>
                    <button
                      className="btn btnNoBorder"
                      style={{
                        fontSize: 11,
                        ...(unclassified || !onAddReminder ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                      }}
                      disabled={unclassified || !onAddReminder}
                      title={
                        unclassified
                          ? '未归类记录需先编辑添加标签'
                          : !onAddReminder
                            ? '此页面不支持提醒'
                            : '加入提醒'
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!unclassified && onAddReminder) onAddReminder(n.id);
                      }}
                    >
                      提醒
                    </button>
                    <button
                      className="btn btnNoBorder"
                      style={{
                        fontSize: 11,
                        ...(unclassified ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                      }}
                      disabled={unclassified}
                      title={unclassified ? '未归类记录需先编辑添加标签' : '编辑'}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!unclassified && onEdit) onEdit(n.id);
                      }}
                    >
                      编辑
                    </button>
                    <button
                      className="btn btnNoBorder btnDelete"
                      style={{
                        fontSize: 11,
                        color: 'var(--danger)',
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete(n.id);
                      }}
                    >
                      删除
                    </button>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(n.id)}
                    onKeyDown={(e) => e.key === 'Enter' && onSelect(n.id)}
                    title={n.contentPreview || '(空)'}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      minHeight: 28,
                      padding: '8px 4px',
                      cursor: 'pointer',
                      userSelect: 'text',
                      WebkitUserSelect: 'text',
                    }}
                  >
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                      {formatDay(displayDate(n))} · 创建 {formatDay(n.createdAt)}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.6,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {n.contentPreview || '(空)'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {items.length === 0 ? <div className="muted" style={{ fontSize: 'var(--font-caption)' }}>暂无记录</div> : null}

        {/* 汇总数与页数 */}
        {items.length > 0 && (total != null || page != null) ? (
          <div
            className="muted"
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid var(--border)',
              fontSize: 'var(--font-caption)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', gap: 16 }}>
              {total != null ? <span>共 {total} 条记录</span> : null}
              {page != null && pageSize != null && total != null && total > pageSize && onPageChange ? (
                <>
                  <span>第 {page} 页（每页 {pageSize} 条）</span>
                  <button
                    className="btn"
                    style={{ fontSize: 'var(--font-caption)', padding: '2px 8px' }}
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                  >
                    上一页
                  </button>
                  <button
                    className="btn"
                    style={{ fontSize: 'var(--font-caption)', padding: '2px 8px' }}
                    disabled={page >= Math.ceil(total / pageSize)}
                    onClick={() => onPageChange(page + 1)}
                  >
                    下一页
                  </button>
                </>
              ) : null}
            </div>
            {page != null && pageSize != null && pageSize > 0 && total != null && total > 0 ? (
              <span style={{ marginLeft: 'auto' }}>共 {Math.ceil(total / pageSize)} 页</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
