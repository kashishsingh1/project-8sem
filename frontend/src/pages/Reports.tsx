import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjects, generateReport, getPortfolioSummary, getReportHistory, deleteReport } from '../lib/api';
import { useState, useRef } from 'react';
import { useModal } from '../context/ModalContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Trash2 } from 'lucide-react';

export default function Reports() {
  const qc = useQueryClient();
  const { confirm } = useModal();
  const reportRef = useRef<HTMLDivElement>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [activeReport, setActiveReport] = useState<any>(null);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['report_history', selectedProjectId],
    queryFn: () => getReportHistory(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary, isFetched: summaryFetched } = useQuery({
    queryKey: ['portfolio_summary'],
    queryFn: getPortfolioSummary,
    enabled: false,
  });

  const reportMutation = useMutation({
    mutationFn: generateReport,
    onSuccess: (data) => {
      setActiveReport(data);
      qc.invalidateQueries({ queryKey: ['report_history', selectedProjectId] });
    },
  });

  const handleGenerate = () => {
    if (!selectedProjectId) return;
    reportMutation.mutate(selectedProjectId);
  };

  const deleteMutation = useMutation({
    mutationFn: deleteReport,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report_history', selectedProjectId] });
    },
  });

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete Report?',
      message: 'Are you sure you want to permanently remove this report from the history?',
      type: 'danger'
    });
    
    if (ok) {
      deleteMutation.mutate(id);
    }
  };

  const handleDownloadPDF = () => {
    if (!reportRef.current || !activeReport) return;
    
    const element = reportRef.current;
    const opt = {
      margin: [0.5, 0.5],
      filename: `Report_${activeReport.projectName.replace(/\s+/g, '_')}_${new Date().toLocaleDateString()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    // Access html2pdf from global window (script tag in index.html)
    const worker = (window as any).html2pdf();
    if (worker) {
      worker.from(element).set(opt).save();
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Reports</h1>
          <p className="page-subtitle">Generate professional client updates and portfolio summaries using AI.</p>
        </div>
      </div>

      <div className="two-col">
        {/* Left Column: Generator */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="card">
            <h2 className="chart-title">Portfolio Overview (AI Summary)</h2>
            {loadingSummary ? (
              <div className="loader"><div className="spinner" /> Analyzing portfolio...</div>
            ) : summaryFetched ? (
              <div 
                className="card-glass" 
                style={{ fontSize: 13, lineHeight: '1.6', color: 'var(--text-secondary)', border: 'none' }}
              >
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm] as any}>
                    {summary?.report || ''}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => refetchSummary()}>
                  🪄 Generate Portfolio Executive Summary
                </button>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                  Analyzes all active projects and team workload.
                </p>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="chart-title">Client Update Generator</h2>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Select Project</label>
              <select 
                className="form-select" 
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">-- Select a project --</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <button 
              className="btn btn-primary" 
              style={{ width: '100%' }}
              onClick={handleGenerate}
              disabled={!selectedProjectId || reportMutation.isPending}
            >
              {reportMutation.isPending ? 'Generating...' : '⚡ Generate Project Report'}
            </button>
          </div>

          {selectedProjectId && (
            <div className="card">
              <h2 className="chart-title">Report History</h2>
              {loadingHistory ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading history...</div>
              ) : history.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No past reports for this project.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                  {history.map((h: any) => (
                    <div 
                      key={h.id}
                      onClick={() => setActiveReport({ 
                        projectName: projects.find((p: any) => p.id === selectedProjectId)?.name || 'Project',
                        generatedAt: h.generated_at,
                        report: h.content
                      })}
                      style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px', 
                        background: 'rgba(255,255,255,0.03)', 
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      className="history-item-btn"
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {new Date(h.generated_at).toLocaleDateString()}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(h.generated_at).toLocaleTimeString()}
                        </div>
                      </div>
                      <button 
                        onClick={(e) => handleDelete(e, h.id)}
                        style={{ 
                          background: 'none', 
                          border: 'none', 
                          color: 'var(--text-muted)', 
                          padding: 4,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                        className="delete-item-btn"
                        title="Delete report"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Report Display */}
        <div className="card" style={{ minHeight: 400, background: '#161b2e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 className="chart-title" style={{ margin: 0 }}>Generated Report</h2>
            {activeReport && <button className="btn btn-primary btn-sm" onClick={handleDownloadPDF}>📥 Export PDF</button>}
          </div>

          {activeReport ? (
            <div className="report-content pdf-export-content" ref={reportRef} style={{ padding: '32px', borderRadius: '8px' }}>
              <div style={{ paddingBottom: 16, borderBottom: '2px solid #eee', marginBottom: 24 }}>
                <h3 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1a', margin: 0 }}>{activeReport.projectName}</h3>
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Report Date: {new Date(activeReport.generatedAt).toLocaleDateString()}</div>
              </div>
              <div 
                style={{ fontSize: 15, color: '#333', lineHeight: '1.8' }}
              >
                <div className="markdown-body" style={{ color: '#333' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm] as any}>
                    {activeReport.report || ''}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ paddingTop: 80 }}>
              <div className="empty-state-icon">📄</div>
              <div className="empty-state-title">No report generated</div>
              <div className="empty-state-desc">Select a project on the left to generate an AI-powered client update.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
