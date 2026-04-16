import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '../lib/api';

type Props = { navigate: (p: any) => void };

interface DashboardData {
  projects: any[];
  stats: {
    total_tasks: string;
    completed_tasks: string;
    in_progress_tasks: string;
    todo_tasks: string;
    total_estimated_hours: string;
    total_actual_hours: string;
  };
}

function getRiskLevel(score: number) {
  if (score >= 0.65) return { label: 'High Risk', cls: 'risk-high', color: 'var(--danger)' };
  if (score >= 0.3) return { label: 'Medium Risk', cls: 'risk-medium', color: 'var(--warning)' };
  return { label: 'On Track', cls: 'risk-low', color: 'var(--success)' };
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Dashboard({ navigate }: Props) {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
  });

  if (isLoading) return (
    <div className="loader"><div className="spinner" /> Loading dashboard...</div>
  );

  if (error) return (
    <div className="empty-state">
      <div className="empty-state-icon">⚠️</div>
      <div className="empty-state-title">Cannot reach backend</div>
      <div className="empty-state-desc">Make sure the server is running on port 5001.</div>
    </div>
  );

  const stats = data?.stats;
  const projects = data?.projects || [];
  const completedPct = stats && Number(stats.total_tasks) > 0
    ? Math.round((Number(stats.completed_tasks) / Number(stats.total_tasks)) * 100)
    : 0;
  const effortPct = stats && Number(stats.total_estimated_hours) > 0
    ? Math.round((Number(stats.total_actual_hours) / Number(stats.total_estimated_hours)) * 100)
    : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back — here's how your projects are doing.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('projects')}>
          ＋ New Project
        </button>
      </div>

      {/* ── KPI Stats ── */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">📁</span>
          <span className="stat-label">Total Projects</span>
          <span className="stat-value">{projects.length}</span>
          <span className="stat-sub">Active workspace</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">✅</span>
          <span className="stat-label">Tasks Completed</span>
          <span className="stat-value">{stats?.completed_tasks ?? 0}</span>
          <span className="stat-sub">{completedPct}% of all tasks</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🔄</span>
          <span className="stat-label">In Progress</span>
          <span className="stat-value" style={{ color: 'var(--info)' }}>{stats?.in_progress_tasks ?? 0}</span>
          <span className="stat-sub">Active tasks</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">⏱️</span>
          <span className="stat-label">Effort Tracking</span>
          <span className="stat-value" style={{ color: effortPct > 110 ? 'var(--danger)' : 'var(--success)' }}>
            {effortPct}%
          </span>
          <span className="stat-sub">Actual vs Estimated</span>
        </div>
      </div>

      {/* ── Projects Table ── */}
      <div className="card" style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>All Projects</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('projects')}>
            View all →
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 0' }}>
            <div className="empty-state-icon">🚀</div>
            <div className="empty-state-title">No projects yet</div>
            <div className="empty-state-desc">Create your first AI-planned project to get started.</div>
            <button className="btn btn-primary" onClick={() => navigate('projects')}>Create Project</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projects.map((p: any) => {
              const risk = getRiskLevel(Number(p.risk_score));
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto auto',
                    alignItems: 'center',
                    gap: 20,
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'var(--transition)',
                  }}
                  onClick={() => navigate({ detail: p.id })}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-active)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      Created {formatDate(p.created_at)}
                    </div>
                  </div>
                  <span className={`badge badge-${p.status}`}>{p.status}</span>
                  <div className="risk-gauge">
                    <div className={`risk-dot ${risk.cls}`} />
                    <span style={{ fontSize: 12, color: risk.color, fontWeight: 600 }}>{risk.label}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
