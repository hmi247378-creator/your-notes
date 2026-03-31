'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QuickInputModal } from '@/components/QuickInputModal';
import { Modal } from '@/components/Modal';
import { apiFetch } from '@/lib/api';
import type { TagNode } from '@/components/TagTree';
import type { NoteItem } from '@/components/NoteList';

/** 将标签树扁平化为 { id, displayPath } 列表，用于下拉选择 */
function flattenTagsForSelect(tags: TagNode[], acc: Array<{ id: string; displayPath: string }> = [], prefix: string[] = []): Array<{ id: string; displayPath: string }> {
  for (const n of tags) {
    const path = [...prefix, n.name];
    const displayPath = path.join(' > ');
    acc.push({ id: n.id, displayPath });
    flattenTagsForSelect(n.children, acc, path);
  }
  return acc;
}

/** 报告列表项 */
type ReportItem = {
  id: string;
  name: string;
  format: 'pdf' | 'xlsx' | 'csv';
  createdAt: string;
  category: string;
  categoryColor: string;
  /** 报告内容，用于查看（保存时写入） */
  content?: string;
};

function PdfIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M8 13h2v5H8z" />
      <path d="M12 13h2v5h-2z" />
      <path d="M16 13h2v1h-2z" />
    </svg>
  );
}

function XlsxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M8 13h2v5H8z" />
      <path d="M12 13h2v5h-2z" />
      <path d="M16 13h2v1h-2z" />
    </svg>
  );
}

function CsvIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}

function formatIcon(format: string) {
  switch (format) {
    case 'pdf':
      return <PdfIcon />;
    case 'xlsx':
      return <XlsxIcon />;
    default:
      return <CsvIcon />;
  }
}

export default function AnalysisPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [tags, setTags] = useState<TagNode[]>([]);
  /** 默认最近 30 天 */
  const getDefaultDateRange = () => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  };
  const [dateFrom, setDateFrom] = useState(() => getDefaultDateRange().from);
  const [dateTo, setDateTo] = useState(() => getDefaultDateRange().to);
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [exportFormat, setExportFormat] = useState('pdf');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(4);
  const [openQuickInput, setOpenQuickInput] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('yn_token');
    if (t) setToken(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    apiFetch<{ tags: TagNode[] }>('/tags/tree', { token }).then((r) => setTags(r.tags));
  }, [token]);

  const tagOptions = useMemo(() => flattenTagsForSelect(tags), [tags]);

  const [generateLoading, setGenerateLoading] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState<string>('');
  const [generatedReportName, setGeneratedReportName] = useState<string>('');
  const [reportsList, setReportsList] = useState<ReportItem[]>([]);
  const [reportsTotal, setReportsTotal] = useState(0);

  /** 待保存的报告信息（用于点击「保存」时加入列表） */
  const [pendingReportInfo, setPendingReportInfo] = useState<{
    reportName: string;
    categoryName: string;
    categoryColor: string;
  } | null>(null);

  /** 是否为查看模式（查看已保存报告，非刚生成） */
  const [isViewingReport, setIsViewingReport] = useState(false);

  async function handleGenerateReport() {
    if (!token) return;
    const from = dateFrom || getDefaultDateRange().from;
    const to = dateTo || getDefaultDateRange().to;
    if (from > to) {
      alert('开始日期不能晚于结束日期');
      return;
    }
    setGenerateLoading(true);
    setGeneratedSummary('');
    setSummaryModalOpen(false);
    setPendingReportInfo(null);
    try {
      const qs = new URLSearchParams();
      qs.set('from', from);
      qs.set('to', to);
      qs.set('dateField', 'recordedAt');
      qs.set('sortBy', 'recordedAt');
      qs.set('sortOrder', 'desc');
      qs.set('pageSize', '100');
      if (selectedTagId) qs.set('tagIds', selectedTagId);

      const allNotes: NoteItem[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        qs.set('page', String(page));
        const res = await apiFetch<{ items: NoteItem[]; total: number; page: number; pageSize: number }>(
          `/notes?${qs.toString()}`,
          { token },
        );
        allNotes.push(...res.items);
        hasMore = res.items.length >= res.pageSize && allNotes.length < res.total;
        page += 1;
      }

      const categoryName = selectedTagId
        ? tagOptions.find((o) => o.id === selectedTagId)?.displayPath ?? '指定分类'
        : '全部分类';
      const rangeText = `${from} 至 ${to}`;

      let summary: string;
      if (allNotes.length === 0) {
        summary = `# 期间工作总结\n\n**时间范围**：${rangeText}\n**统计范围**：${categoryName}\n\n## 主要工作\n\n该期间内暂无记录数据。`;
      } else {
        const formatDate = (iso: string) => {
          const d = new Date(iso);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const notesForApi = allNotes.map((n) => ({
          content: n.contentPreview ?? '',
          date: formatDate(n.recordedAt ?? n.createdAt),
        }));
        const res = await apiFetch<{ summary: string }>('/reports/summarize', {
          method: 'POST',
          token,
          body: JSON.stringify({
            notes: notesForApi,
            rangeText,
            categoryName,
          }),
        });
        summary = res.summary;
      }

      const reportName = `期间工作总结_${rangeText}_${categoryName.replace(/\s*>\s*/g, '-')}_${new Date().toISOString().slice(0, 10)}.${exportFormat === 'pdf' ? 'pdf' : exportFormat === 'xlsx' ? 'xlsx' : 'csv'}`;

      setGeneratedSummary(summary);
      setGeneratedReportName(reportName);
      setPendingReportInfo({
        reportName,
        categoryName,
        categoryColor: selectedTagId ? '#2563eb' : '#64748b',
      });
      setSummaryModalOpen(true);
    } catch (e: any) {
      alert(e?.message ?? '生成报告失败');
    } finally {
      setGenerateLoading(false);
    }
  }

  function handleSaveReport() {
    if (!pendingReportInfo) return;
    const newReport: ReportItem = {
      id: `gen-${Date.now()}`,
      name: pendingReportInfo.reportName,
      format: exportFormat === 'pdf' ? 'pdf' : exportFormat === 'xlsx' ? 'xlsx' : 'csv',
      createdAt: new Date().toISOString().slice(0, 10),
      category: pendingReportInfo.categoryName,
      categoryColor: pendingReportInfo.categoryColor,
      content: generatedSummary,
    };
    setReportsList((prev) => [newReport, ...prev]);
    setReportsTotal((prev) => prev + 1);
    setPendingReportInfo(null);
    setIsViewingReport(false);
    setSummaryModalOpen(false);
  }

  function handleViewReport(r: ReportItem) {
    if (r.content) {
      setGeneratedSummary(r.content);
      setGeneratedReportName(r.name);
      setIsViewingReport(true);
      setPendingReportInfo(null);
      setSummaryModalOpen(true);
    } else {
      alert('该报告暂无可查看内容');
    }
  }

  function handleDeleteReport(r: ReportItem) {
    if (!window.confirm(`确认删除报告「${r.name}」？`)) return;
    setReportsList((prev) => prev.filter((x) => x.id !== r.id));
    setReportsTotal((prev) => Math.max(0, prev - 1));
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      {/* 顶部标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-title)', fontWeight: 700, margin: 0 }}>分析报告</h1>
          <p className="muted" style={{ marginTop: 6, fontSize: 'var(--font-body-sm)' }}>
            生成与管理您的分析报告与导出数据
          </p>
        </div>
        <div />
      </div>

      <div className="col" style={{ gap: 16 }}>
          {/* 生成新报告 */}
          <div className="dashboardCard">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-heading)', marginBottom: 4 }}>生成新报告</div>
              <p className="muted" style={{ fontSize: 'var(--font-body-sm)', margin: 0 }}>
                根据自定义筛选条件生成分析报告与导出数据
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div>
                <label className="muted" style={{ fontSize: 'var(--font-small)', display: 'block', marginBottom: 4 }}>
                  开始日期
                </label>
                <input
                  type="date"
                  className="input"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ padding: '8px 12px', minWidth: 140 }}
                />
              </div>
              <div>
                <label className="muted" style={{ fontSize: 'var(--font-small)', display: 'block', marginBottom: 4 }}>
                  结束日期
                </label>
                <input
                  type="date"
                  className="input"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ padding: '8px 12px', minWidth: 140 }}
                />
              </div>
              <div>
                <label className="muted" style={{ fontSize: 'var(--font-small)', display: 'block', marginBottom: 4 }}>
                  所属分类
                </label>
                <select
                  className="input"
                  value={selectedTagId}
                  onChange={(e) => setSelectedTagId(e.target.value)}
                  style={{ width: 140, padding: '8px 12px' }}
                >
                  <option value="">全部分类</option>
                  {tagOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.displayPath}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="muted" style={{ fontSize: 'var(--font-small)', display: 'block', marginBottom: 4 }}>
                  导出格式
                </label>
                <select
                  className="input"
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  style={{ width: 140, padding: '8px 12px' }}
                >
                  <option value="pdf">PDF 报告</option>
                  <option value="xlsx">Excel 表格</option>
                  <option value="csv">CSV 数据</option>
                </select>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn">
                  设置
                </button>
                <button type="button" className="btn">
                  历史
                </button>
              </div>
              <button
                type="button"
                className="btn btnPrimary"
                disabled={generateLoading}
                onClick={handleGenerateReport}
              >
                {generateLoading ? '生成中...' : '立即生成'}
              </button>
            </div>
          </div>

          {/* 最近生成的报告 */}
          <div className="dashboardCard">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-heading)' }}>最近生成的报告</div>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn" title="刷新" style={{ padding: '8px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                </button>
                <button type="button" className="btn" title="排序/筛选" style={{ padding: '8px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              {reportsList.length === 0 ? (
                <div
                  className="muted"
                  style={{
                    padding: 48,
                    textAlign: 'center',
                    fontSize: 'var(--font-body-sm)',
                  }}
                >
                  暂无报告，点击上方「立即生成」创建您的第一份报告。
                </div>
              ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-body-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 0', textAlign: 'left', fontWeight: 500, color: 'var(--muted)' }}>报告名称</th>
                    <th style={{ padding: '12px 0', textAlign: 'left', fontWeight: 500, color: 'var(--muted)' }}>生成日期</th>
                    <th style={{ padding: '12px 0', textAlign: 'left', fontWeight: 500, color: 'var(--muted)' }}>分类</th>
                    <th style={{ padding: '12px 0', textAlign: 'left', fontWeight: 500, color: 'var(--muted)' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsList.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--muted)' }}>{formatIcon(r.format)}</span>
                          <span>{r.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 0', color: 'var(--muted)' }}>{r.createdAt}</td>
                      <td style={{ padding: '12px 0' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 'var(--font-small)',
                            background: `${r.categoryColor}20`,
                            color: r.categoryColor,
                          }}
                        >
                          {r.category}
                        </span>
                      </td>
                      <td style={{ padding: '12px 0' }}>
                        <div style={{ display: 'flex', gap: 12 }}>
                          {r.format === 'pdf' ? (
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: 'var(--font-small)' }}
                              onClick={() => handleViewReport(r)}
                            >
                              查看
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '4px 8px', fontSize: 'var(--font-small)' }}
                              onClick={() => {
                                if (r.content) {
                                  const blob = new Blob([r.content], { type: 'text/plain;charset=utf-8' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = r.name.replace(/\.(pdf|xlsx|csv)$/, '.txt');
                                  a.click();
                                  URL.revokeObjectURL(url);
                                } else {
                                  alert('该报告暂无可下载内容');
                                }
                              }}
                            >
                              下载
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btnDelete"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => handleDeleteReport(r)}
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
            {/* 分页 */}
            {reportsList.length > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid var(--border)',
              }}
            >
              <span className="muted" style={{ fontSize: 'var(--font-small)' }}>
                显示第 {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, reportsTotal)} 条, 共 {reportsTotal} 条报告
              </span>
              <div className="row" style={{ gap: 4 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ padding: '6px 10px' }}
                >
                  &lt;
                </button>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={page === n ? 'btn btnPrimary' : 'btn'}
                    onClick={() => setPage(n)}
                    style={{ padding: '6px 10px', minWidth: 32 }}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn"
                  disabled={page >= Math.ceil(reportsTotal / pageSize)}
                  onClick={() => setPage((p) => p + 1)}
                  style={{ padding: '6px 10px' }}
                >
                  &gt;
                </button>
              </div>
            </div>
            )}
          </div>
      </div>

      {token && (
        <QuickInputModal
          open={openQuickInput}
          onClose={() => setOpenQuickInput(false)}
          token={token}
          selectedTagId={null}
          tags={tags}
          onSuccess={() => {
            setOpenQuickInput(false);
            window.location.reload();
          }}
        />
      )}

      <Modal
        title="期间工作总结"
        open={summaryModalOpen}
        onClose={() => {
          setSummaryModalOpen(false);
          setIsViewingReport(false);
        }}
        contentWidth={800}
      >
        <div className="col" style={{ gap: 12 }}>
          <div className="muted" style={{ fontSize: 'var(--font-small)' }}>{generatedReportName}</div>
          <div
            style={{
              maxHeight: 400,
              overflowY: 'auto',
              padding: 12,
              background: 'var(--panel2)',
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
              fontSize: 'var(--font-body-sm)',
              lineHeight: 1.6,
            }}
          >
            {generatedSummary || '加载中...'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                navigator.clipboard.writeText(generatedSummary);
                alert('已复制到剪贴板');
              }}
            >
              复制内容
            </button>
            {!isViewingReport && (
              <button
                type="button"
                className="btn btnPrimary"
                onClick={handleSaveReport}
              >
                保存
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
