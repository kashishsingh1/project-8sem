import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTeam, createMember, updateMember, deleteMember, getRoles, createRole as apiCreateRole, updateRole, deleteRole, getTasksByMember } from '../lib/api';
import { useModal } from '../context/ModalContext';

/**
 * ── Searchable Role Selector ─────────────────────────────────
 */
function SearchableRoleSelect({
  value,
  onChange,
  roles
}: {
  value: string;
  onChange: (val: string) => void;
  roles: any[]
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatch = roles.find(r => r.name.toLowerCase() === search.toLowerCase());

  const addRoleMutation = useMutation({
    mutationFn: apiCreateRole,
    onSuccess: (newRole) => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      onChange(newRole.name);
      setSearch('');
      setIsOpen(false);
    }
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="searchable-select" ref={wrapperRef} style={{ position: 'relative' }}>
      <div
        className="form-input"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'text',
          minHeight: 42
        }}
        onClick={() => setIsOpen(true)}
      >
        {isOpen ? (
          <input
            autoFocus
            className="search-input-inner"
            placeholder="Search or add role..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', color: 'white', width: '100%' }}
          />
        ) : (
          <span style={{ color: value ? 'white' : 'var(--text-muted)' }}>
            {value || 'Select a role...'}
          </span>
        )}
        <span style={{ fontSize: 10, opacity: 0.5 }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div
          className="select-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            zIndex: 100,
            maxHeight: 240,
            overflowY: 'auto',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            padding: 4
          }}
        >
          {filteredRoles.map(role => (
            <div
              key={role.id}
              className="select-option"
              onClick={() => {
                onChange(role.name);
                setIsOpen(false);
                setSearch('');
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
                background: value === role.name ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: value === role.name ? 'var(--accent-light)' : 'white'
              }}
            >
              {role.name}
            </div>
          ))}

          {!exactMatch && search.trim() && (
            <div
              className="select-option add-option"
              onClick={() => addRoleMutation.mutate(search.trim())}
              style={{
                padding: '10px 12px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--accent-light)',
                borderTop: '1px solid var(--border)',
                marginTop: 4,
                fontWeight: 600
              }}
            >
              {addRoleMutation.isPending ? 'Adding...' : `+ Add "${search}"`}
            </div>
          )}

          {filteredRoles.length === 0 && !search.trim() && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              Type to search...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Team() {
  const qc = useQueryClient();
  const { confirm } = useModal();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [newMember, setNewMember] = useState({ name: '', email: '', role: '', availability_hours: 40, skills: '' });

  const { data: team = [], isLoading: isTeamLoading } = useQuery({
    queryKey: ['team'],
    queryFn: getTeam,
  });

  const { data: roles = [], isLoading: isRolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: getRoles,
  });
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // -- Filter State --
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [workloadFilter, setWorkloadFilter] = useState('all');
  const [teamSortBy, setTeamSortBy] = useState('name');

  const filteredTeam = useMemo(() => {
    let result = [...team];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.name.toLowerCase().includes(q) || 
        m.email.toLowerCase().includes(q) ||
        (m.role && m.role.toLowerCase().includes(q))
      );
    }

    // Role Filter
    if (roleFilter !== 'all') {
      result = result.filter(m => m.role === roleFilter);
    }

    // Workload Filter
    if (workloadFilter !== 'all') {
      result = result.filter(m => {
        const load = Number(m.current_workload_hours);
        const cap = m.availability_hours;
        if (workloadFilter === 'overloaded') return load > cap;
        if (workloadFilter === 'balanced') return load <= cap && load > cap * 0.5;
        if (workloadFilter === 'underloaded') return load <= cap * 0.5;
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      if (teamSortBy === 'name') return a.name.localeCompare(b.name);
      if (teamSortBy === 'workload') return Number(b.current_workload_hours) - Number(a.current_workload_hours);
      if (teamSortBy === 'capacity') return b.availability_hours - a.availability_hours;
      return 0;
    });

    return result;
  }, [team, searchQuery, roleFilter, workloadFilter, teamSortBy]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Workload Tasks Modal State ─────────────────────────────────────────────
  const [workloadMember, setWorkloadMember] = useState<any | null>(null);
  const [workloadSearch, setWorkloadSearch] = useState('');
  const [workloadStatusFilter, setWorkloadStatusFilter] = useState<'all' | 'todo' | 'in_progress' | 'done'>('all');
  const [workloadDueFilter, setWorkloadDueFilter] = useState<'all' | 'overdue' | 'upcoming'>('all');
  const [workloadSortBy, setWorkloadSortBy] = useState<'newest' | 'oldest' | 'estimate'>('newest');

  const { data: workloadTasks = [], isLoading: isWorkloadTasksLoading } = useQuery({
    queryKey: ['member_tasks', workloadMember?.id],
    queryFn: () => getTasksByMember((workloadMember as any).id),
    enabled: !!workloadMember
  });

  const openWorkloadModal = (member: any) => {
    setWorkloadMember(member);
    setWorkloadSearch('');
    setWorkloadStatusFilter('all');
    setWorkloadDueFilter('all');
    setWorkloadSortBy('newest');
  };

  useEffect(() => {
    if (!workloadMember) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setWorkloadMember(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [workloadMember]);

  const filteredWorkloadTasks = useMemo(() => {
    let result = [...workloadTasks] as any[];
    const q = workloadSearch.trim().toLowerCase();
    const now = new Date();

    // Search
    if (q) {
      result = result.filter(t =>
        String(t.title || '').toLowerCase().includes(q) ||
        String(t.description || '').toLowerCase().includes(q)
      );
    }

    // Status filter
    if (workloadStatusFilter !== 'all') {
      result = result.filter(t => t.status === workloadStatusFilter);
    }

    // Due date filter (relative to now)
    if (workloadDueFilter !== 'all') {
      result = result.filter(t => {
        if (!t.due_date) return false;
        const due = new Date(t.due_date);
        if (workloadDueFilter === 'overdue') return t.status !== 'done' && due < now;
        if (workloadDueFilter === 'upcoming') return t.status !== 'done' && due >= now;
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      if (workloadSortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (workloadSortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      // estimate
      return Number(b.estimated_hours) - Number(a.estimated_hours);
    });

    return result;
  }, [workloadTasks, workloadSearch, workloadStatusFilter, workloadDueFilter, workloadSortBy]);

  const createMutation = useMutation({
    mutationFn: (data: any) => createMember({
      ...data,
      skills: (data.skills || '').split(',').map((s: string) => s.trim()).filter((s: string) => !!s)
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      setShowAddModal(false);
      setNewMember({ name: '', email: '', role: '', availability_hours: 40, skills: '' });
      showToast('✅ Team member added.');
    },
    onError: () => showToast('❌ Failed to add member.')
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => updateMember(id, {
      ...data,
      skills: (data.skills || '').split(',').map((s: string) => s.trim()).filter((s: string) => !!s)
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      setEditingMember(null);
      showToast('✅ Member details updated.');
    },
    onError: () => showToast('❌ Failed to update member.')
  });

  const handleMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.name.trim() || !newMember.email.trim() || !newMember.role) {
      showToast('⚠️ Please fill in all required fields: Name, Email, and Role.');
      return;
    }
    createMutation.mutate(newMember);
  };

  const handleMemberUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember.name.trim() || !editingMember.email.trim() || !editingMember.role) {
      showToast('⚠️ Please fill in all required fields: Name, Email, and Role.');
      return;
    }
    updateMutation.mutate({ id: editingMember.id, data: editingMember });
  };

  const deleteMutation = useMutation({
    mutationFn: deleteMember,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
    }
  });

  const roleUpdateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateRole(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      qc.invalidateQueries({ queryKey: ['team'] });
    }
  });

  const roleDeleteMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
    }
  });

  const roleAddMutation = useMutation({
    mutationFn: apiCreateRole,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
    }
  });

  if (isTeamLoading || isRolesLoading) return <div className="loader"><div className="spinner" /> Loading team...</div>;

  const overloadedMembers = team.filter((m: any) => Number(m.current_workload_hours) > m.availability_hours);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Team & Resources</h1>
          <p className="page-subtitle">Manage availability and track real-time workload across the organization.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-secondary" onClick={() => setShowRolesModal(true)}>
            ⚙️ Manage Roles
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            + Add Team Member
          </button>
        </div>
      </div>

      <div className="search-filter-bar">
        <div className="search-pill" style={{ flex: 1 }}>
          <span className="search-pill-icon">🔍</span>
          <input 
            className="form-input" 
            placeholder="Search team members by name, email, or role..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', width: '100%', height: '100%' }}
          />
        </div>

        <select 
          className="form-select" 
          style={{ width: 160 }}
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="all">All Roles</option>
          {roles.map((r: any) => (
            <option key={r.id} value={r.name}>{r.name}</option>
          ))}
        </select>

        <select 
          className="form-select" 
          style={{ width: 160 }}
          value={workloadFilter}
          onChange={e => setWorkloadFilter(e.target.value)}
        >
          <option value="all">All Workloads</option>
          <option value="overloaded">🔥 Overloaded</option>
          <option value="balanced">⚖️ Balanced</option>
          <option value="underloaded">🟢 Underloaded</option>
        </select>

        <select 
          className="form-select" 
          style={{ width: 150 }}
          value={teamSortBy}
          onChange={e => setTeamSortBy(e.target.value)}
        >
          <option value="name">Sort by Name</option>
          <option value="workload">Sort by Workload</option>
          <option value="capacity">Sort by Capacity</option>
        </select>
      </div>

      {overloadedMembers.length > 0 && (
        <div
          className="alert alert-danger"
          style={{
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger)',
            fontSize: 14,
            fontWeight: 600
          }}
        >
          <span style={{ fontSize: 20 }}>⚠️</span>
          <span>{overloadedMembers.length} team member{overloadedMembers.length > 1 ? 's are' : ' is'} currently overloaded. Consider re-assigning tasks.</span>
        </div>
      )}

      <div className="three-col" style={{ marginBottom: 32 }}>
        <div className="stat-card">
          <span className="stat-label">Total Staff</span>
          <span className="stat-value">{team.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Capacity</span>
          <span className="stat-value">{team.reduce((acc: number, m: any) => acc + m.availability_hours, 0)}h</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Active Load</span>
          <span className="stat-value" style={{ color: 'var(--info)' }}>
            {team.reduce((acc: number, m: any) => acc + Number(m.current_workload_hours), 0)}h
          </span>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Resource Management</h2>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Showing {filteredTeam.length} member{filteredTeam.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {filteredTeam.map((member: any) => {
            const loadPercent = Math.min(Math.round((Number(member.current_workload_hours) / member.availability_hours) * 100), 100);
            return (
              <div key={member.id} className="card-glass" style={{ padding: 20, border: '1px solid var(--border)', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {member.name}
                      {loadPercent >= 100 && <span title="Overloaded" style={{ cursor: 'help' }}>⚠️</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{member.role?.toUpperCase() || 'NO ROLE'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setEditingMember({ ...member, skills: (member.skills || []).join(', ') })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                      title="Edit member"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Remove Team Member?',
                          message: `Are you sure you want to remove "${member.name}"? This will unassign them from all active tasks.`,
                          type: 'danger'
                        });
                        if (ok) deleteMutation.mutate(member.id);
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                      title="Remove member"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div
                  style={{ marginBottom: 12, cursor: 'pointer' }}
                  title="View assigned tasks"
                  onClick={() => openWorkloadModal(member)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') openWorkloadModal(member);
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Workload</span>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{member.current_workload_hours}h / {member.availability_hours}h</span>
                  </div>
                  <div className="progress-bar-wrap">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${loadPercent}%`,
                        background: loadPercent > 90 ? 'var(--danger)' : loadPercent > 70 ? 'var(--warning)' : 'var(--success)'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(member.skills || []).map((skill: string) => (
                    <span key={skill} className="badge badge-todo" style={{ fontSize: 10 }}>{skill}</span>
                  ))}
                  {(member.skills || []).length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No skills listed</span>}
                </div>
              </div>
            );
          })}
        </div>

        {filteredTeam.length === 0 && searchQuery.trim() && (
          <div className="empty-state" style={{ padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>👥</div>
            <div className="empty-state-title">No team members found</div>
            <p className="empty-state-desc">Try adjusting your filters or search terms.</p>
            <button className="btn btn-secondary" onClick={() => { setSearchQuery(''); setRoleFilter('all'); setWorkloadFilter('all'); }}>Clear Filters</button>
          </div>
        )}
      </div>

      {/* Workload Tasks Modal */}
      {workloadMember && (
        <div className="modal-overlay" onClick={() => setWorkloadMember(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 920 }}>
            <div className="modal-header">
              <span className="modal-title">👥 Workload: {workloadMember.name}</span>
              <button className="modal-close" onClick={() => setWorkloadMember(null)}>✕</button>
            </div>

            <div className="task-toolbar" style={{ marginBottom: 16 }}>
              <div className="search-pill">
                <span className="search-pill-icon" style={{ opacity: 0.6 }}>🔎</span>
                <input
                  className="form-input"
                  placeholder="Search tasks..."
                  value={workloadSearch}
                  onChange={e => setWorkloadSearch(e.target.value)}
                />
              </div>

              <select
                className="form-select"
                value={workloadStatusFilter}
                onChange={e => setWorkloadStatusFilter(e.target.value as any)}
                style={{ width: 140 }}
              >
                <option value="all">All Status</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>

              <select
                className="form-select"
                value={workloadDueFilter}
                onChange={e => setWorkloadDueFilter(e.target.value as any)}
                style={{ width: 150 }}
              >
                <option value="all">Due Date: Anywhere</option>
                <option value="overdue">Overdue</option>
                <option value="upcoming">Upcoming</option>
              </select>

              <select
                className="form-select"
                value={workloadSortBy}
                onChange={e => setWorkloadSortBy(e.target.value as any)}
                style={{ width: 170 }}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="estimate">Highest Effort</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Showing <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{filteredWorkloadTasks.length}</span> task(s)
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                Capacity: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{workloadMember.current_workload_hours}h</span> / {workloadMember.availability_hours}h
              </div>
            </div>

            {isWorkloadTasksLoading ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading tasks...
              </div>
            ) : (
              <div style={{ maxHeight: '54vh', overflowY: 'auto', paddingRight: 4 }}>
                {filteredWorkloadTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No matching tasks found.</div>
                ) : (
                  filteredWorkloadTasks.map((task: any) => {
                    const due = task.due_date ? new Date(task.due_date) : null;
                    const now = new Date();
                    const isOverdue = !!due && task.status !== 'done' && due < now;
                    const statusStyle =
                      task.status === 'done'
                        ? { color: 'var(--success)' }
                        : task.status === 'in_progress'
                          ? { color: 'var(--warning)' }
                          : { color: 'var(--text-muted)' };

                    return (
                      <div key={task.id} className="task-item" style={{ marginBottom: 10, alignItems: 'flex-start' }}>
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            marginTop: 6,
                            background:
                              task.status === 'done'
                                ? 'var(--success)'
                                : task.status === 'in_progress'
                                  ? 'var(--warning)'
                                  : 'rgba(255,255,255,0.25)'
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color: task.status === 'done' ? 'var(--text-muted)' : 'var(--text-primary)',
                                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                                  wordBreak: 'break-word'
                                }}
                              >
                                {task.title}
                              </div>
                              {task.description && (
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                                  {task.description}
                                </div>
                              )}
                            </div>

                            <div style={{ textAlign: 'right', whiteSpace: 'nowrap', ...statusStyle }}>
                              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>
                                {String(task.status || '').replace('_', ' ')}
                              </div>
                              {task.due_date && (
                                <div style={{ marginTop: 6, fontSize: 12, color: isOverdue ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isOverdue ? 700 : 400 }}>
                                  📅 {new Date(task.due_date).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📁 {task.project_name || '—'}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⏱️ Est: {Number(task.estimated_hours)}h</span>
                            {Number(task.actual_hours) > 0 && (
                              <span style={{ fontSize: 12, color: 'var(--accent-light)', fontWeight: 700 }}>
                                Act: {Number(task.actual_hours)}h
                              </span>
                            )}
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              👤 {task.assigned_to_name || workloadMember.name}
                            </span>
                            {Array.isArray(task.dependencies) && task.dependencies.length > 0 && (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>🔗 Deps: {task.dependencies.length}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">+ Add Team Member</span>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleMemberSubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" value={newMember.name} onChange={e => setNewMember({ ...newMember, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input type="email" className="form-input" value={newMember.email} onChange={e => setNewMember({ ...newMember, email: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Role *</label>
                <SearchableRoleSelect
                  value={newMember.role}
                  onChange={(val) => setNewMember({ ...newMember, role: val })}
                  roles={roles}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Weekly Availability (hrs)</label>
                <input type="number" className="form-input" value={newMember.availability_hours} onChange={e => setNewMember({ ...newMember, availability_hours: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label className="form-label">Skills (comma separated)</label>
                <input className="form-input" placeholder="React, Node.js, Design..." value={newMember.skills} onChange={e => setNewMember({ ...newMember, skills: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <div className="modal-overlay" onClick={() => setEditingMember(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">✏️ Edit Team Member</span>
              <button className="modal-close" onClick={() => setEditingMember(null)}>✕</button>
            </div>
            <form onSubmit={handleMemberUpdate} className="modal-form">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" value={editingMember.name} onChange={e => setEditingMember({ ...editingMember, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input type="email" className="form-input" value={editingMember.email} onChange={e => setEditingMember({ ...editingMember, email: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Role *</label>
                <SearchableRoleSelect
                  value={editingMember.role}
                  onChange={(val) => setEditingMember({ ...editingMember, role: val })}
                  roles={roles}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Weekly Availability (hrs)</label>
                <input type="number" className="form-input" value={editingMember.availability_hours} onChange={e => setEditingMember({ ...editingMember, availability_hours: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label className="form-label">Skills (comma separated)</label>
                <input className="form-input" placeholder="React, Node.js, Design..." value={editingMember.skills} onChange={e => setEditingMember({ ...editingMember, skills: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingMember(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Roles Modal */}
      {showRolesModal && (
        <div className="modal-overlay" onClick={() => setShowRolesModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <span className="modal-title">⚙️ Manage Team Roles</span>
              <button className="modal-close" onClick={() => setShowRolesModal(false)}>✕</button>
            </div>

            {/* Quick Add Role Section */}
            <div style={{ marginTop: 20, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <label className="form-label" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>Add New Role</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="new-role-input"
                  className="form-input"
                  placeholder="e.g. Security Specialist"
                  style={{ flex: 1, height: 38 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.currentTarget as HTMLInputElement).value.trim();
                      if (val) {
                        roleAddMutation.mutate(val);
                        (e.currentTarget as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
                <button
                  className="btn btn-primary"
                  style={{ height: 38, padding: '0 16px' }}
                  onClick={() => {
                    const input = document.getElementById('new-role-input') as HTMLInputElement;
                    if (input.value.trim()) {
                      roleAddMutation.mutate(input.value.trim());
                      input.value = '';
                    }
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="role-management-list" style={{ marginTop: 20, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
              <label className="form-label" style={{ fontSize: 12, marginBottom: 12, display: 'block', opacity: 0.6 }}>Existing Roles (click to edit)</label>
              {roles.map((role: any) => (
                <div key={role.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <input
                    className="form-input"
                    style={{ flex: 1, padding: '6px 10px', height: 'auto', fontSize: 14 }}
                    defaultValue={role.name}
                    onBlur={(e) => {
                      if (e.target.value !== role.name && e.target.value.trim()) {
                        roleUpdateMutation.mutate({ id: role.id, name: e.target.value.trim() });
                      }
                    }}
                  />
                  <button
                    onClick={async () => { 
                      const ok = await confirm({
                        title: 'Delete Role?',
                        message: `Permanently delete the role "${role.name}"?`,
                        type: 'danger'
                      });
                      if (ok) roleDeleteMutation.mutate(role.id); 
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
                    title="Delete role"
                  >
                    🗑️
                  </button>
                </div>
              ))}
              {roles.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No roles defined yet.</div>}
            </div>

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setShowRolesModal(false)}>Done</button>
            </div>
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
