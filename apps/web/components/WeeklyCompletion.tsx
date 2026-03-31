'use client';

/**
 * 本周完成度组件：展示完成百分比及与上周对比
 */
export function WeeklyCompletion({
  percent = 84,
  changeFromLastWeek = 12,
}: {
  percent?: number;
  changeFromLastWeek?: number;
}) {
  const isPositive = changeFromLastWeek >= 0;

  return (
    <div className="col" style={{ gap: 12, marginTop: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--font-heading)' }}>本周完成度</div>
      <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--text)' }}>{percent}%</div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: 'var(--panel2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(0, percent))}%`,
            height: '100%',
            borderRadius: 999,
            background: 'var(--accent)',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 'var(--font-small)',
          color: isPositive ? 'var(--ok)' : 'var(--danger)',
        }}
      >
        <span>比上周{isPositive ? '提升了' : '下降了'}{Math.abs(changeFromLastWeek)}%</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="12" width="4" height="9" rx="1" />
          <rect x="10" y="8" width="4" height="13" rx="1" />
          <rect x="17" y="3" width="4" height="18" rx="1" />
        </svg>
      </div>
    </div>
  );
}
