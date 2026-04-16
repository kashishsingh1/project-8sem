import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjects, createProject, updateProject, deleteProject } from '../lib/api';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';

type Props = { navigate: (p: any) => void };

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getRiskColor(score: number) {
  if (score >= 0.65) return 'var(--danger)';
  if (score >= 0.3) return 'var(--warning)';
  return 'var(--success)';
}

export default function Projects({ navigate }: Props) {
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const { confirm } = useModal();
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [form, setForm] = useState({ name: '', description: '', start_date: '', end_date: '' });
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  
  // -- Filter State --
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Status Filter
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'risk') return Number(b.risk_score) - Number(a.risk_score);
      return 0;
    });

    return result;
  }, [projects, searchQuery, statusFilter, sortBy]);

  const createMutation = useMutation({
    mutationFn: createProject,
    onMutate: () => setAiLoading(true),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setShowModal(false);
      setForm({ name: '', description: '', start_date: '', end_date: '' });
      setAiLoading(false);
      showToast(`✅ "${data.project.name}" created with ${data.tasks.length} AI-generated tasks!`);
    },
    onError: () => {
      setAiLoading(false);
      showToast('❌ Failed to create project. Check API keys and backend.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => updateProject(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setEditingProject(null);
      showToast('✅ Project updated');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      showToast('🗑️ Project deleted');
    }
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.description.trim() || !form.start_date || !form.end_date) {
      showToast('⚠️ Please fill in all required fields: Name, Requirements, Start Date, and End Date.');
      return;
    }
    createMutation.mutate(form);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject.name.trim() || !editingProject.description.trim() || !editingProject.start_date || !editingProject.end_date) {
      showToast('⚠️ Please fill in all required fields: Name, Description, Start Date, and End Date.');
      return;
    }
    updateMutation.mutate({ id: editingProject.id, data: editingProject });
  };

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete Project?',
      message: `Are you sure you want to delete "${name}"? All tasks and associated data will be permanently removed. This action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Permanently'
    });
    
    if (ok) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) return <div className="loader"><div className="spinner" /> Loading projects...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">AI-planned projects with smart task breakdown.</p>
        </div>
        {hasPermission('projects:create') && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            ⚡ New AI Project
          </button>
        )}
      </div>

      <div className="search-filter-bar">
        <div className="search-pill" style={{ flex: 1 }}>
          <span className="search-pill-icon">🔍</span>
          <input 
            className="form-input" 
            placeholder="Search projects by name or description..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', width: '100%', height: '100%' }}
          />
        </div>

        <select 
          className="form-select" 
          style={{ width: 140 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="delayed">Delayed</option>
          <option value="done">Done</option>
        </select>

        <select 
          className="form-select" 
          style={{ width: 150 }}
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="risk">Highest Risk</option>
        </select>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🤖</div>
          <div className="empty-state-title">No projects yet</div>
          <div className="empty-state-desc">
            Describe your project requirements and let AI generate a full task plan instantly.
          </div>
          {hasPermission('projects:create') && (
            <button className="btn btn-primary btn-lg" onClick={() => setShowModal(true)}>
              ⚡ Create First AI Project
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            Showing {filteredProjects.length} projects {statusFilter !== 'all' ? `marked as "${statusFilter}"` : ''}
          </div>
          <div className="projects-grid">
            {filteredProjects.map((p: any) => (
            <div
              key={p.id}
              className="project-card"
              onClick={() => navigate({ detail: p.id })}
              style={{ position: 'relative' }}
            >
              <div className="project-card-header">
                <div style={{ flex: 1 }}>
                  <div className="project-card-title">{p.name}</div>
                  <span className={`badge badge-${p.status}`} style={{ marginTop: 4 }}>{p.status}</span>
                </div>
                
                {hasPermission('projects:manage') && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      style={{ padding: '4px 8px' }}
                      onClick={(e) => { e.stopPropagation(); setEditingProject(p); }}
                    >
                      ✏️
                    </button>
                    <button 
                      className="btn btn-danger btn-sm" 
                      style={{ padding: '4px 8px' }}
                      onClick={(e) => handleDelete(e, p.id, p.name)}
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>

              <p className="project-card-desc">{p.description || 'No description'}</p>

              {/* Risk indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: getRiskColor(Number(p.risk_score)),
                    boxShadow: `0 0 6px ${getRiskColor(Number(p.risk_score))}`,
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Risk Score: {(Number(p.risk_score) * 100).toFixed(0)}%
                </span>
              </div>

              <div className="project-card-meta">
                <span>👤 {p.owner_name || 'System'}</span>
                <span>📅 {formatDate(p.start_date)}</span>
                {p.end_date && <span>→ {formatDate(p.end_date)}</span>}
                <span style={{ marginLeft: 'auto' }}>View →</span>
              </div>
            </div>
          ))}
          </div>
          {filteredProjects.length === 0 && searchQuery.trim() && (
            <div className="empty-state" style={{ padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
              <div className="empty-state-title">No matches found</div>
              <p className="empty-state-desc">Try adjusting your search or filters to find what you're looking for.</p>
              <button className="btn btn-secondary" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}>Clear Filters</button>
            </div>
          )}
        </>
      )}

      {/* ── Create Project Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => !aiLoading && setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">⚡ New AI Project</span>
              <button className="modal-close" onClick={() => !aiLoading && setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className="modal-form">
              <div style={{
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                fontSize: 13,
                color: 'var(--accent-light)',
              }}>
                🤖 Gemini AI will automatically generate tasks, effort estimates, and dependencies from your description.
              </div>

              <div className="form-group">
                <label className="form-label">Project Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g. Customer Portal Redesign"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  disabled={aiLoading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Project Requirements *</label>
                <textarea
                  className="form-textarea"
                  placeholder="Describe what needs to be built, key features, tech stack, expected outcomes... The more detail, the better the AI plan."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  required
                  disabled={aiLoading}
                  style={{ minHeight: 140 }}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Start Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    disabled={aiLoading}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    disabled={aiLoading}
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={aiLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={aiLoading}>
                  {aiLoading ? (
                    <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Generating Plan...</>
                  ) : '⚡ Generate AI Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Project Modal ── */}
      {editingProject && (
        <div className="modal-overlay" onClick={() => setEditingProject(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">✏️ Edit Project</span>
              <button className="modal-close" onClick={() => setEditingProject(null)}>✕</button>
            </div>

            <form onSubmit={handleUpdate} className="modal-form">
              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input
                  className="form-input"
                  value={editingProject.name}
                  onChange={e => setEditingProject((f: any) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select 
                  className="form-select"
                  value={editingProject.status}
                  onChange={e => setEditingProject((f: any) => ({ ...f, status: e.target.value }))}
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="delayed">Delayed</option>
                  <option value="done">Done</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  value={editingProject.description}
                  onChange={e => setEditingProject((f: any) => ({ ...f, description: e.target.value }))}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Start Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={editingProject.start_date?.split('T')[0]}
                    onChange={e => setEditingProject((f: any) => ({ ...f, start_date: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={editingProject.end_date?.split('T')[0]}
                    onChange={e => setEditingProject((f: any) => ({ ...f, end_date: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingProject(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className="toast">{toast}</div>
        </div>
      )}
    </div>
  );
}
