import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  LayoutList, 
  Kanban, 
  Clock, 
  CheckCircle2, 
  Circle, 
  ArrowUpRight,
  GanttChartSquare,
  Edit,
  Trash2,
  ChevronLeft
} from 'lucide-react';
import { getProjectDashboard, updateTask, createTask, deleteTask, getTeam, suggestTeam, updateProject, deleteProject } from '../lib/api';
import GanttChart from '../components/GanttChart';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';

type Props = { projectId: string; navigate: (p: any) => void };

function getRiskCategory(score: number) {
  if (score >= 0.65) return { name: 'High Risk', cls: 'risk-high' };
  if (score >= 0.3) return { name: 'Medium Risk', cls: 'risk-medium' };
  return { name: 'On Track', cls: 'risk-low' };
}

export default function ProjectDetail({ projectId, navigate }: Props) {
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const { confirm } = useModal();
  const [toast, setToast] = useState<string | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [newTask, setNewTask] = useState({ title: '', estimated_hours: 0, description: '', assigned_to: '', due_date: '' });
  
  // -- Jira Feature State --
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'gantt'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  // Project Edit State
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', description: '', start_date: '', end_date: '', status: '' });

  // -- Queries --
  const { data, isLoading } = useQuery({
    queryKey: ['project_dashboard', projectId],
    queryFn: () => getProjectDashboard(projectId),
  });

  const { data: team = [] } = useQuery({
    queryKey: ['team'],
    queryFn: getTeam,
  });

  // -- Derived Data --
  const tasks = data?.tasks || [];
  
  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => 
        t.title.toLowerCase().includes(q) || 
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

    // Filters
    if (statusFilter !== 'all') {
      result = result.filter(t => t.status === statusFilter);
    }
    if (assigneeFilter !== 'all') {
      result = result.filter(t => String(t.assigned_to) === String(assigneeFilter));
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'estimate') return b.estimated_hours - a.estimated_hours;
      return 0;
    });

    return result;
  }, [tasks, searchQuery, statusFilter, assigneeFilter, sortBy]);

  // -- Mutations --
  const updateMutation = useMutation({
    mutationFn: ({ taskId, changes }: { taskId: string; changes: any }) => updateTask(taskId, changes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project_dashboard', projectId] });
      showToast('Task updated.');
    },
  });

  const suggestMutation = useMutation({
    mutationFn: () => suggestTeam(projectId),
    onSuccess: (result: any) => {
      const suggestions = result?.suggestions || [];
      if (suggestions.length === 0) {
        showToast('ℹ️ No unassigned tasks or no team members to suggest.');
        return;
      }
      // Auto-apply suggestions
      suggestions.forEach((s: any) => {
        if (s.taskId && s.suggestedMemberId) {
          updateMutation.mutate({ taskId: s.taskId, changes: { assigned_to: s.suggestedMemberId } });
        }
      });
      showToast(`🤖 AI assigned ${suggestions.length} task(s) to optimal team members!`);
    },
    onError: () => showToast('❌ AI suggestion failed. Check API keys.'),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => createTask({ ...data, project_id: projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project_dashboard', projectId] });
      setShowTaskModal(false);
      setNewTask({ title: '', estimated_hours: 0, description: '', assigned_to: '', due_date: '' });
      showToast('✅ Task added.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project_dashboard', projectId] });
      showToast('Task deleted.');
    }
  });

  const projectUpdateMutation = useMutation({
    mutationFn: (data: any) => updateProject(projectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project_dashboard', projectId] });
      setShowProjectModal(false);
      showToast('✅ Project updated.');
    }
  });

  const projectDeleteMutation = useMutation({
    mutationFn: () => deleteProject(projectId),
    onSuccess: () => {
      showToast('🗑️ Project deleted.');
      navigate('projects');
    }
  });

  // -- Handlers --
  const handleTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return showToast('⚠️ Title required.');
    createMutation.mutate(newTask);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ 
      taskId: editingTask.id, 
      changes: { 
        title: editingTask.title, 
        description: editingTask.description,
        estimated_hours: editingTask.estimated_hours,
        actual_hours: editingTask.actual_hours,
        assigned_to: editingTask.assigned_to,
        status: editingTask.status,
        due_date: editingTask.due_date || null
      } 
    });
    setEditingTask(null);
  };

  const toggleTaskStatus = (task: any) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    updateMutation.mutate({ taskId: task.id, changes: { status: newStatus } });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const openEditProject = () => {
    if (project) {
      setProjectForm({
        name: project.name,
        description: project.description,
        start_date: project.start_date ? project.start_date.split('T')[0] : '',
        end_date: project.end_date ? project.end_date.split('T')[0] : '',
        status: project.status
      });
      setShowProjectModal(true);
    }
  };

  const handleProjectUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    projectUpdateMutation.mutate(projectForm);
  };

  const handleDeleteProject = async () => {
    const ok = await confirm({
      title: 'Delete Entire Project?',
      message: `Warning: This will permanently xóa bỏ "${project?.name}" and all of its ${tasks.length} tasks. This data cannot be recovered.`,
      type: 'danger',
      confirmText: 'Delete Everything'
    });
    
    if (ok) {
      projectDeleteMutation.mutate();
    }
  };

  // -- DnD Handlers --
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOverStatus(status);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverStatus(null);
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    setDragOverStatus(null);
    
    // Find the task to check if status actually changed
    const task = tasks.find((t: any) => String(t.id) === String(taskId));
    if (task && task.status !== newStatus) {
      updateMutation.mutate({ taskId, changes: { status: newStatus } });
    }
  };

  if (isLoading) return <div className="loader"><div className="spinner" /> Loading project insights...</div>;

  const project = data?.project;
  const risk = data?.risk;
  const riskUi = risk ? getRiskCategory(Number(risk.riskScore)) : null;

  // -- Helper Components --
  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'done') return <CheckCircle2 size={16} className="text-success" />;
    if (status === 'in_progress') return <Clock size={16} className="text-warning" />;
    return <Circle size={16} className="text-muted" />;
  };

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Breadcrumbs & Actions */}
      <div style={{ marginBottom: 20 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('projects')} style={{ background: 'transparent', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
          <ChevronLeft size={16} /> Back to Projects
        </button>
      </div>

      <div className="page-header" style={{ marginBottom: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>{project?.name}</h1>
            {project?.status && <span className={`badge badge-${project.status}`}>{project.status}</span>}
            {hasPermission('projects:manage') && (
              <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
                <button 
                  onClick={openEditProject} 
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                  title="Edit Project"
                >
                  <Edit size={16} />
                </button>
                <button 
                  onClick={handleDeleteProject}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4, opacity: 0.7 }}
                  title="Delete Project"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
          <p className="page-subtitle" style={{ maxWidth: 720 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Manager: {project?.owner_name || 'System'}</span>
            <br />
            {project?.description}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {hasPermission('tasks:manage') && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => suggestMutation.mutate()} disabled={suggestMutation.isPending} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                🤖 {suggestMutation.isPending ? 'Analyzing...' : 'Auto-Assign Tasks'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowTaskModal(true)}>
                + Add Task
              </button>
            </>
          )}
        </div>
      </div>

      <div className="two-col" style={{ marginBottom: 32 }}>
        {/* Risk Prediction Engine Panel */}
        <div className="card" style={{ background: 'linear-gradient(145deg, rgba(22,27,46,0.9) 0%, rgba(17,21,32,0.9) 100%)', borderColor: 'rgba(99,102,241,0.2)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            🤖 AI Risk Prediction
          </h2>
          {risk ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className={`risk-dot ${riskUi?.cls}`} style={{ width: 14, height: 14 }} />
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{riskUi?.name}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Predicted Delay</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: risk.predictedDelayDays > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {risk.predictedDelayDays} Days
                  </div>
                </div>
              </div>
              
              <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                <strong>Reasoning:</strong> {risk.reason}
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span>Risk Score</span>
                  <span>{(risk.riskScore * 10).toFixed(1)} / 10</span>
                </div>
                <div className="progress-bar-wrap">
                  <div className="progress-bar-fill" style={{ width: `${risk.riskScore * 100}%`, background: riskUi?.cls === 'risk-high' ? 'var(--danger)' : riskUi?.cls === 'risk-medium' ? 'var(--warning)' : 'var(--success)' }} />
                </div>
              </div>
            </div>
          ) : (
             <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Risk data unavailable.</div>
          )}

          {/* Risk Trend Mini Chart */}
          {data?.risk_history && data.risk_history.length >= 1 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Risk Trend</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
                {data.risk_history.slice(-20).map((snap: any, i: number) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${Math.max(4, Number(snap.risk_score) * 100)}%`,
                      background: Number(snap.risk_score) >= 0.65 ? 'var(--danger)' : Number(snap.risk_score) >= 0.3 ? 'var(--warning)' : 'var(--success)',
                      borderRadius: 2,
                      opacity: 0.7,
                      transition: 'height 0.3s ease'
                    }}
                    title={`${new Date(snap.recorded_at).toLocaleDateString()}: ${(Number(snap.risk_score) * 100).toFixed(0)}%`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Standard Project Stats */}
        <div className="card">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Overview</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
             <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Completion</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{data?.stats?.completion_percent}%</div>
             </div>
             <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Tasks</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{data?.stats?.completed} / {data?.stats?.total}</div>
             </div>
          </div>
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span>Progress</span>
            </div>
            <div className="progress-bar-wrap">
              <div className="progress-bar-fill" style={{ width: `${data?.stats?.completion_percent}%`, background: 'var(--success)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Task Board Section */}
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, marginTop: 40 }}>Task Board</h2>
      
      {/* Task Toolbar */}
      <div className="task-toolbar">
         <div className="search-pill">
            <Search size={18} className="search-pill-icon" />
            <input 
              className="form-input" 
              placeholder="Search tasks..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
         </div>

         <div style={{ display: 'flex', gap: 12 }}>
            <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 140 }}>
              <option value="all">All Status</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>

            <select className="form-select" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} style={{ width: 150 }}>
              <option value="all">Everywhere</option>
              {team.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            <select className="form-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 140 }}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title">A-Z</option>
              <option value="estimate">Highest Effort</option>
            </select>
         </div>

         <div className="view-toggle">
            <button className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
              <LayoutList size={16} />
            </button>
            <button className={`view-toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => setViewMode('kanban')}>
              <Kanban size={16} />
            </button>
            <button className={`view-toggle-btn ${viewMode === 'gantt' ? 'active' : ''}`} onClick={() => setViewMode('gantt')}>
              <GanttChartSquare size={16} />
            </button>
         </div>
      </div>

      {/* Task Content Area */}
      {viewMode === 'gantt' ? (
        <GanttChart projectId={projectId} />
      ) : (
      <AnimatePresence mode="wait">
        {viewMode === 'list' ? (
          <motion.div 
            key="list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="tasks-list"
          >
            {filteredTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>No matching tasks found.</div>
            ) : (
              filteredTasks.map(task => (
                <div key={task.id} className="task-item" style={{ marginBottom: 8 }}>
                  <button onClick={() => hasPermission('tasks:manage') && toggleTaskStatus(task)} className={`task-checkbox ${task.status === 'done' ? 'checked' : ''}`} style={{ cursor: hasPermission('tasks:manage') ? 'pointer' : 'default' }}>
                    {task.status === 'done' && '✓'}
                  </button>
                  <div style={{ flex: 1 }}>
                     <div className={`task-title ${task.status === 'done' ? 'done' : ''}`} style={{ fontSize: 15 }}>{task.title}</div>
                     <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
                       {task.assigned_to_name && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>👤 {task.assigned_to_name}</div>}
                       {task.due_date && (
                         <div style={{ 
                           fontSize: 11, 
                           color: (task.status !== 'done' && new Date(task.due_date) < new Date()) ? 'var(--danger)' : 'var(--text-muted)',
                           fontWeight: (task.status !== 'done' && new Date(task.due_date) < new Date()) ? 600 : 400
                         }}>
                           📅 {new Date(task.due_date).toLocaleDateString()}
                         </div>
                       )}
                     </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 12, display: 'flex', gap: 8 }}>
                      <span>Est: {task.estimated_hours}h</span>
                      {task.actual_hours > 0 && <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>Act: {task.actual_hours}h</span>}
                    </div>
                    <button onClick={() => setEditingTask(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, opacity: 0.6 }}>
                      {hasPermission('tasks:manage') ? '✏️' : '👁️'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="kanban"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            className="kanban-board"
          >
            {['todo', 'in_progress', 'done'].map(status => (
              <div 
                key={status} 
                className={`kanban-column ${dragOverStatus === status ? 'glow-on-hover' : ''}`}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, status)}
                style={{
                  transition: 'all 0.2s ease',
                  border: dragOverStatus === status ? '1px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.05)',
                  background: dragOverStatus === status ? 'rgba(99, 102, 241, 0.05)' : 'rgba(22, 27, 46, 0.4)'
                }}
              >
                <div className="kanban-column-header">
                  <span className="kanban-column-title">
                    <StatusIcon status={status} />
                    {status.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 10 }}>
                    {filteredTasks.filter(t => t.status === status).length}
                  </span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 150 }}>
                  {filteredTasks.filter(t => t.status === status).map(task => (
                    <motion.div 
                      key={task.id} 
                      layoutId={task.id}
                      draggable={hasPermission('tasks:manage') ? "true" : "false"}
                      onDragStart={(e: any) => hasPermission('tasks:manage') && handleDragStart(e, task.id)}
                      className="kanban-card"
                      onClick={() => setEditingTask(task)}
                    >
                      <div className="kanban-card-title">{task.title}</div>
                      {task.description && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {task.description}
                        </p>
                      )}
                      
                      <div className="kanban-card-footer">
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                           {task.assigned_to_name && (
                             <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                               👤 {task.assigned_to_name.split(' ')[0]}
                             </span>
                           )}
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span>⏱️ {task.estimated_hours}h</span>
                              {task.actual_hours > 0 && <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>({task.actual_hours}h)</span>}
                            </div>
                         </div>
                         {task.due_date && (
                           <div style={{ 
                             fontSize: 11, 
                             marginTop: 8, 
                             display: 'flex', 
                             alignItems: 'center', 
                             gap: 4,
                             color: (task.status !== 'done' && new Date(task.due_date) < new Date()) ? 'var(--danger)' : 'var(--text-muted)'
                           }}>
                             <Clock size={12} />
                             <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                             {task.status !== 'done' && new Date(task.due_date) < new Date() && (
                               <span style={{ background: 'var(--danger)', color: 'white', padding: '1px 4px', borderRadius: 4, fontSize: 9 }}>OVERDUE</span>
                             )}
                           </div>
                         )}
                         <ArrowUpRight size={14} style={{ opacity: 0.3 }} />
                       </div>
                     </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      )}

      {/* --- Modals --- */}
      {showTaskModal && (
        <div className="modal-overlay" onClick={() => setShowTaskModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">+ Add Manual Task</span>
              <button className="modal-close" onClick={() => setShowTaskModal(false)}>✕</button>
            </div>
            <form onSubmit={handleTaskSubmit} className="modal-form">
               <div className="form-group">
                 <label className="form-label">Task Title *</label>
                 <input className="form-input" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} required />
               </div>
               <div className="form-group">
                 <label className="form-label">Description</label>
                 <textarea className="form-textarea" value={newTask.description || ''} onChange={e => setNewTask({...newTask, description: e.target.value})} style={{ minHeight: 80 }} />
               </div>
               <div className="form-row">
                 <div className="form-group">
                   <label className="form-label">Estimated Hours</label>
                   <input type="number" className="form-input" value={newTask.estimated_hours} onChange={e => setNewTask({...newTask, estimated_hours: parseInt(e.target.value) || 0})} />
                 </div>
                 <div className="form-group">
                   <label className="form-label">Due Date</label>
                   <input type="date" className="form-input" value={newTask.due_date} onChange={e => setNewTask({...newTask, due_date: e.target.value})} />
                 </div>
                 <div className="form-group">
                   <label className="form-label">Assignee</label>
                   <select className="form-select" value={newTask.assigned_to || ''} onChange={e => setNewTask({...newTask, assigned_to: e.target.value})}>
                     <option value="">Unassigned</option>
                     {team.map((m: any) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                   </select>
                 </div>
               </div>
               <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowTaskModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Add Task</button>
               </div>
            </form>
          </div>
        </div>
      )}

      {editingTask && (
        <div className="modal-overlay" onClick={() => setEditingTask(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{hasPermission('tasks:manage') ? '✏️ Edit Task' : '👁️ View Task'}</span>
              <button className="modal-close" onClick={() => setEditingTask(null)}>✕</button>
            </div>
            <form onSubmit={handleEditSubmit} className="modal-form">
               <fieldset disabled={!hasPermission('tasks:manage')} style={{ border: 'none', padding: 0, margin: 0 }}>
               <div className="form-group">
                 <label className="form-label">Task Title *</label>
                 <input className="form-input" value={editingTask.title} onChange={e => setEditingTask({...editingTask, title: e.target.value})} required />
               </div>
               <div className="form-group">
                 <label className="form-label">Status</label>
                 <select className="form-select" value={editingTask.status} onChange={e => setEditingTask({...editingTask, status: e.target.value})}>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                 </select>
               </div>
               <div className="form-group">
                 <label className="form-label">Description</label>
                 <textarea className="form-textarea" value={editingTask.description || ''} onChange={e => setEditingTask({...editingTask, description: e.target.value})} style={{ minHeight: 80 }} />
               </div>
               <div className="form-row">
                 <div className="form-group">
                   <label className="form-label">Estimated Hours</label>
                   <input type="number" className="form-input" value={editingTask.estimated_hours} onChange={e => setEditingTask({...editingTask, estimated_hours: parseInt(e.target.value) || 0})} />
                 </div>
                 <div className="form-group">
                   <label className="form-label">Due Date</label>
                   <input type="date" className="form-input" value={editingTask.due_date ? editingTask.due_date.split('T')[0] : ''} onChange={e => setEditingTask({...editingTask, due_date: e.target.value})} />
                 </div>
                 <div className="form-group">
                   <label className="form-label">Actual Hours</label>
                   <input type="number" className="form-input" value={editingTask.actual_hours} onChange={e => setEditingTask({...editingTask, actual_hours: parseInt(e.target.value) || 0})} />
                 </div>
               </div>
               <div className="form-group" style={{ marginTop: 8 }}>
                 <label className="form-label">Assignee</label>
                 <select className="form-select" value={editingTask.assigned_to || ''} onChange={e => setEditingTask({...editingTask, assigned_to: e.target.value})}>
                   <option value="">Unassigned</option>
                   {team.map((m: any) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                 </select>
               </div>
               </fieldset>
               {hasPermission('tasks:manage') && (
                 <div className="modal-actions" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)', justifyContent: 'space-between' }}>
                   <button 
                     type="button" 
                     className="btn btn-secondary" 
                     onClick={async () => {
                       const ok = await confirm({
                         title: 'Delete Task?',
                         message: `Permanently remove "${editingTask.title}"?`,
                         type: 'danger'
                       });
                       if (ok) {
                         deleteMutation.mutate(editingTask.id);
                         setEditingTask(null);
                       }
                     }} 
                     style={{ color: 'var(--danger)' }}
                   >
                     Delete
                   </button>
                   <div style={{ display: 'flex', gap: 12 }}>
                     <button type="button" className="btn btn-secondary" onClick={() => setEditingTask(null)}>Cancel</button>
                     <button type="submit" className="btn btn-primary">Save Changes</button>
                   </div>
                 </div>
               )}
            </form>
          </div>
        </div>
      )}

      {showProjectModal && (
        <div className="modal-overlay" onClick={() => setShowProjectModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">✏️ Edit Project</span>
              <button className="modal-close" onClick={() => setShowProjectModal(false)}>✕</button>
            </div>
            <form onSubmit={handleProjectUpdate} className="modal-form">
               <div className="form-group">
                 <label className="form-label">Project Name *</label>
                 <input className="form-input" value={projectForm.name} onChange={e => setProjectForm({...projectForm, name: e.target.value})} required />
               </div>
               <div className="form-group">
                 <label className="form-label">Description</label>
                 <textarea className="form-textarea" value={projectForm.description} onChange={e => setProjectForm({...projectForm, description: e.target.value})} style={{ minHeight: 80 }} />
               </div>
               <div className="form-row">
                 <div className="form-group">
                   <label className="form-label">Start Date</label>
                   <input type="date" className="form-input" value={projectForm.start_date} onChange={e => setProjectForm({...projectForm, start_date: e.target.value})} />
                 </div>
                 <div className="form-group">
                   <label className="form-label">End Date</label>
                   <input type="date" className="form-input" value={projectForm.end_date} onChange={e => setProjectForm({...projectForm, end_date: e.target.value})} />
                 </div>
               </div>
               <div className="form-group">
                 <label className="form-label">Status</label>
                 <select className="form-select" value={projectForm.status} onChange={e => setProjectForm({...projectForm, status: e.target.value})}>
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="at_risk">At Risk</option>
                 </select>
               </div>
               <div className="modal-actions" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowProjectModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Changes</button>
               </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-container">
          <div className="toast toast-success">{toast}</div>
        </div>
      )}
    </div>
  );
}
