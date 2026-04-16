import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';

interface Member {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
  roles: string[];
}

interface Invite {
  id: string;
  email: string;
  role_name: string;
  expires_at: string;
}

interface Role {
  id: string;
  name: string;
  key: string;
  permissions?: Permission[];
}

interface Permission {
  id: string;
  name: string;
  key: string;
  group_name: string;
}

export default function Users() {
  const { user } = useAuth();
  const { confirm } = useModal();
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'members' | 'roles'>('members');
  
  // Data
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form States
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('admin');
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Role Editor States
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleFormName, setRoleFormName] = useState('');
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);

  const fetchData = async () => {
    try {
      const [usersRes, rolesRes, permsRes] = await Promise.all([
        api.get('/users'),
        api.get('/users/roles/list'), // Get detailed list
        api.get('/users/permissions')
      ]);
      setMembers(usersRes.data.members);
      setInvites(usersRes.data.invites);
      setRoles(rolesRes.data);
      setAllPermissions(permsRes.data);
      
      if (rolesRes.data.length > 0 && !inviteRole) {
        setInviteRole(rolesRes.data.find((r: Role) => r.key === 'admin')?.key || rolesRes.data[0].key);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showStatus = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: '', type: '' }), 4000);
  };

  // ── INVITES ──
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessingId('invite');
    try {
      await api.post('/users/invite', { email: inviteEmail, roleKey: inviteRole });
      showStatus('Invitation sent successfully!', 'success');
      setInviteEmail('');
      fetchData();
    } catch (err: any) {
      showStatus(err.response?.data?.error || 'Failed to send invite', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRevoke = async (id: string) => {
    const ok = await confirm({
      title: 'Revoke Invitation?',
      message: 'This link will immediately become invalid and the invitee will not be able to join.',
      type: 'danger'
    });
    if (!ok) return;
    setProcessingId(id);
    try {
      await api.delete(`/users/invites/${id}`);
      showStatus('Invitation revoked.', 'success');
      fetchData();
    } catch (err) {
      showStatus('Failed to revoke invite', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleResend = async (email: string, roleKey: string) => {
    const ok = await confirm({
      title: 'Resend Invitation?',
      message: `Send a fresh invite link to ${email}? The previous link will be revoked.`,
    });
    if (!ok) return;
    setProcessingId(email);
    try {
      await api.post('/users/invite', { email, roleKey });
      showStatus('Invitation resent successfully!', 'success');
      fetchData();
    } catch (err) {
      showStatus('Failed to resend invite', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // ── MEMBERS ──
  const updateRole = async (userId: string, roleId: string) => {
    const ok = await confirm({
      title: 'Update Access Level?',
      message: 'This will change the permissions for this team member immediately.',
    });
    if (!ok) return;
    setProcessingId(userId);
    try {
      await api.patch(`/users/${userId}/role`, { roleId });
      showStatus('Role updated successfully.', 'success');
      fetchData();
    } catch (err) {
      showStatus('Failed to update role', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const removeMember = async (id: string) => {
    const ok = await confirm({
      title: 'Remove Team Member?',
      message: 'Are you sure you want to permanently remove this member from the organization?',
      type: 'danger'
    });
    if (!ok) return;
    setProcessingId(id);
    try {
      await api.delete(`/users/${id}`);
      showStatus('Member removed.', 'success');
      fetchData();
    } catch (err) {
      showStatus('Failed to remove member', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // ── ROLE CRUD ──
  const openRoleEditor = (role: Role | null) => {
    setEditingRole(role);
    setRoleFormName(role ? role.name : '');
    setSelectedPermissionIds(role ? role.permissions?.map(p => p.id) || [] : []);
    setShowRoleModal(true);
  };

  const saveRole = async () => {
    if (!roleFormName.trim()) return;
    setProcessingId('role');
    try {
      if (editingRole) {
        await api.patch(`/users/roles/${editingRole.id}`, { 
          name: roleFormName, 
          permissionIds: selectedPermissionIds 
        });
        showStatus('Role updated successfully', 'success');
      } else {
        await api.post('/users/roles', { 
          name: roleFormName, 
          permissionIds: selectedPermissionIds 
        });
        showStatus('New role created', 'success');
      }
      setShowRoleModal(false);
      fetchData();
    } catch (err: any) {
      showStatus(err.response?.data?.error || 'Failed to save role', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const deleteRole = async (id: string) => {
    const ok = await confirm({
      title: 'Delete Access Role?',
      message: 'This will permanently remove this role. Only roles not currently assigned to users can be deleted.',
      type: 'danger'
    });
    if (!ok) return;
    setProcessingId(id);
    try {
      await api.delete(`/users/roles/${id}`);
      showStatus('Role deleted successfully', 'success');
      fetchData();
    } catch (err: any) {
      showStatus(err.response?.data?.error || 'Failed to delete role', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <div className="loader"><div className="spinner" /> Loading organization...</div>;

  return (
    <div className="users-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Organization Management</h1>
          <p className="page-subtitle">Control access levels and manage team members for <strong>{user?.org_name}</strong></p>
        </div>
      </header>

      {/* Tab Header with premium styling */}
      <div className="tab-group" style={{ marginBottom: 32 }}>
        <button 
          className={`tab ${activeTab === 'members' ? 'active' : ''}`} 
          onClick={() => setActiveTab('members')}
        >
          Team Directory
        </button>
        <button 
          className={`tab ${activeTab === 'roles' ? 'active' : ''}`} 
          onClick={() => setActiveTab('roles')}
        >
          Access Roles
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'members' ? (
          <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 360px', alignItems: 'start' }}>
            
            {/* MEMBERS TABLE */}
            <div className="card-glass">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Team Directory</h2>
                <span className="badge badge-info">{members.length} Members</span>
              </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>User</th>
                    <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Access Role</th>
                    <th style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Management</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)', transition: 'var(--transition)' }} className="table-row-hover">
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.email}</div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        {m.id === user?.id ? (
                          <span className="badge badge-active">{m.roles?.[0] || 'Member'}</span>
                        ) : (
                          <select 
                            className="form-select"
                            value={roles.find(r => r.name === m.roles?.[0])?.id || ''}
                            disabled={processingId === m.id}
                            onChange={(e) => updateRole(m.id, e.target.value)}
                            style={{ padding: '4px 8px', fontSize: 13, minWidth: 120 }}
                          >
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.status === 'active' ? 'var(--success)' : 'var(--warning)' }} />
                          {m.status}
                        </div>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        {m.id !== user?.id && (
                          <button 
                            className="btn btn-danger btn-sm"
                            disabled={processingId === m.id}
                            onClick={() => removeMember(m.id)}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SIDEBAR */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card">
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Invite New Member</h3>
              <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input 
                    className="form-input"
                    type="email" 
                    placeholder="name@company.com" 
                    required 
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Default Role</label>
                  <select 
                    className="form-select"
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value)}
                  >
                    {roles.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
                  </select>
                </div>
                <button 
                  className="btn btn-primary" 
                  type="submit" 
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={processingId === 'invite'}
                >
                  {processingId === 'invite' ? 'Sending...' : 'Send Invitation'}
                </button>
              </form>
            </div>

            <div className="card" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                Pending Invites <span style={{ fontSize: 11, background: 'var(--border)', padding: '2px 6px', borderRadius: 4 }}>{invites.length}</span>
              </h3>
              
              {invites.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No pending invitations.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {invites.map(i => (
                    <div key={i.id} className="glass" style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', wordBreak: 'break-all', maxWidth: '70%' }}>{i.email}</div>
                        <span className="badge badge-todo">{i.role_name}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                        Expires {new Date(i.expires_at).toLocaleDateString()}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          style={{ flex: 1, justifyContent: 'center' }}
                          disabled={processingId === i.email}
                          onClick={() => handleResend(i.email, roles.find(r => r.name === i.role_name)?.key || 'member')}
                        >
                          Resend
                        </button>
                        <button 
                          className="btn btn-danger btn-sm" 
                          style={{ padding: '6px 10px', background: 'transparent' }}
                          disabled={processingId === i.id}
                          onClick={() => handleRevoke(i.id)}
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        ) : (
          /* ── ROLES MANAGEMENT ── */
          <div className="roles-management">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Organization Roles</h2>
              <button className="btn btn-primary" onClick={() => openRoleEditor(null)}>+ Create New Role</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 24 }}>
              {roles.map(r => (
                <div key={r.id} className="card-glass" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{r.name}</h3>
                      <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>Role Key: {r.key}</code>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" disabled={r.key === 'admin'} onClick={() => openRoleEditor(r)}>Edit</button>
                      {r.key !== 'admin' && (
                        <button className="btn btn-danger btn-sm" style={{ background: 'transparent' }} onClick={() => deleteRole(r.id)}>Delete</button>
                      )}
                    </div>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Permissions</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {r.permissions?.length ? r.permissions.map(p => (
                        <span key={p.id} className="badge" style={{ background: 'var(--border)', color: 'var(--text-secondary)', fontSize: 11 }}>
                          {p.name}
                        </span>
                      )) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No special permissions</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {statusMsg.text && (
        <div className={`toast toast-${statusMsg.type}`} style={{ position: 'fixed', bottom: 32, right: 32, zIndex: 1000 }}>
          {statusMsg.type === 'success' ? '✅' : '❌'} {statusMsg.text}
        </div>
      )}

      {/* Role Editor Modal */}
      {showRoleModal && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ maxWidth: 640, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: 24 }}>{editingRole ? 'Edit Access Role' : 'Create New Role'}</h2>
            
            <div className="form-group" style={{ marginBottom: 24 }}>
              <label className="form-label">Role Name</label>
              <input 
                className="form-input"
                placeholder="e.g. Project Manager, Viewer, etc."
                value={roleFormName}
                onChange={e => setRoleFormName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="permissions-editor">
              <label className="form-label" style={{ marginBottom: 16 }}>Grant Permissions</label>
              
              {/* Grouped Permissions */}
              {Object.entries(
                allPermissions.reduce((acc, p) => {
                  if (!acc[p.group_name]) acc[p.group_name] = [];
                  acc[p.group_name].push(p);
                  return acc;
                }, {} as Record<string, Permission[]>)
              ).map(([group, perms]) => (
                <div key={group} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                    {group}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {perms.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }} className="checkbox-item">
                        <input 
                          type="checkbox"
                          checked={selectedPermissionIds.includes(p.id)}
                          onChange={e => {
                            if (e.target.checked) setSelectedPermissionIds([...selectedPermissionIds, p.id]);
                            else setSelectedPermissionIds(selectedPermissionIds.filter(id => id !== p.id));
                          }}
                        />
                        <span>{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowRoleModal(false)}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={saveRole}
                disabled={!roleFormName.trim() || processingId === 'role'}
              >
                {processingId === 'role' ? 'Saving...' : 'Save Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
