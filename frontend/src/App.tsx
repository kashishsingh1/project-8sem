import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Team from './pages/Team';
import Reports from './pages/Reports';
import AIChat from './pages/AIChat';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Users from './pages/Users';
import AcceptInvite from './pages/AcceptInvite';
import { useAuth } from './context/AuthContext';
import { ModalProvider } from './context/ModalContext';

type Page = 'dashboard' | 'projects' | 'team' | 'reports' | 'chat' | 'users' | { detail: string };

export default function App() {
  const { user, loading, logout, hasPermission } = useAuth();
  const [page, setPage] = useState<Page>('dashboard');
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');

  const navigate = (to: Page) => setPage(to);

  const isAcceptingInvite = window.location.pathname === '/accept-invite';

  // ── Auth Logic ──
  if (loading) {
    return (
      <div className="auth-page" style={{ flexDirection: 'column', gap: 20 }}>
        <div className="logo-icon" style={{ fontSize: 40, animation: 'pulse 2s infinite' }}>⚡</div>
        <p style={{ color: 'var(--text-secondary)' }}>Authenticating...</p>
      </div>
    );
  }

  if (!user) {
    if (isAcceptingInvite) return <AcceptInvite />;
    
    return authView === 'login' 
      ? <Login onSignupClick={() => setAuthView('signup')} /> 
      : <Signup onLoginClick={() => setAuthView('login')} />;
  }

  // Handle case where logged in but visiting invite link
  if (isAcceptingInvite) return <AcceptInvite />;

  const renderPage = () => {
    try {
      if (page === 'dashboard') {
        if (hasPermission('dashboard:view')) return <Dashboard navigate={navigate} />;
        if (hasPermission('projects:view') || hasPermission('projects:view_all') || hasPermission('projects:manage')) return <Projects navigate={navigate} />;
        if (hasPermission('team:view')) return <Team />;
        if (hasPermission('report:access')) return <Reports />;
        if (hasPermission('chat:access')) return <AIChat />;
        if (hasPermission('team:manage')) return <Users />;
        
        return (
          <div className="empty-state" style={{ marginTop: '10vh' }}>
            <div className="empty-state-icon" style={{ fontSize: 64 }}>🔒</div>
            <h2 className="empty-state-title" style={{ fontSize: 24, marginTop: 16 }}>Access Restricted</h2>
            <p className="empty-state-desc" style={{ fontSize: 16 }}>You do not have permission to access any modules. Please contact your organization administrator.</p>
          </div>
        );
      }
      
      if (page === 'projects') {
        if (!hasPermission('projects:view') && !hasPermission('projects:view_all') && !hasPermission('projects:manage')) return <div className="empty-state" style={{marginTop: '10vh'}}><h2>Unauthorized</h2></div>;
        return <Projects navigate={navigate} />;
      }
      if (page === 'team') return <Team />;
      if (page === 'reports') return <Reports />;
      if (page === 'chat') return <AIChat />;
      if (page === 'users') return <Users />;
      if (typeof page === 'object' && page !== null && 'detail' in page)
        return <ProjectDetail projectId={(page as { detail: string }).detail} navigate={navigate} />;
      
      // Fallback if page state is corrupted or null
      return hasPermission('dashboard:view') ? <Dashboard navigate={navigate} /> : <div className="empty-state" style={{marginTop:'10vh'}}>🔒 Access Restricted</div>;
    } catch (err) {
      console.error('Render error:', err);
      return <div className="empty-state">Error Rendering Content</div>;
    }
  };

  const isActive = (p: Page) => JSON.stringify(p) === JSON.stringify(page);

  return (
    <ModalProvider>
      <div className="app-layout">
        <div className="bg-glow" />

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">⚡</div>
          <span>PlanAI</span>
        </div>

        <div style={{ padding: '0 12px 20px', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{user.org_name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{user.name}</div>
        </div>

        {(hasPermission('dashboard:view') || hasPermission('projects:view') || hasPermission('projects:view_all') || hasPermission('projects:manage') || hasPermission('team:view')) && (
          <>
            <span className="nav-label">Navigation</span>

            {hasPermission('dashboard:view') && (
              <button
                className={`nav-item${isActive('dashboard') ? ' active' : ''}`}
                onClick={() => navigate('dashboard')}
              >
                <span className="nav-icon">📊</span> Dashboard
              </button>
            )}

            {(hasPermission('projects:view') || hasPermission('projects:view_all') || hasPermission('projects:manage')) && (
              <button
                className={`nav-item${isActive('projects') ? ' active' : ''}`}
                onClick={() => navigate('projects')}
              >
                <span className="nav-icon">📁</span> Projects
              </button>
            )}

            {hasPermission('team:view') && (
              <button
                className={`nav-item${isActive('team') ? ' active' : ''}`}
                onClick={() => navigate('team')}
              >
                <span className="nav-icon">👥</span> Team
              </button>
            )}
          </>
        )}

        {(hasPermission('report:access') || hasPermission('chat:access')) && (
          <>
            <span className="nav-label">AI Intelligence</span>

            {hasPermission('report:access') && (
              <button
                className={`nav-item${isActive('reports') ? ' active' : ''}`}
                onClick={() => navigate('reports')}
              >
                <span className="nav-icon">📄</span> AI Reports
              </button>
            )}

            {hasPermission('chat:access') && (
              <button
                className={`nav-item${isActive('chat') ? ' active' : ''}`}
                onClick={() => navigate('chat')}
              >
                <span className="nav-icon">💬</span> AI Assistant
              </button>
            )}
          </>
        )}

        {hasPermission('team:manage') && (
          <>
            <span className="nav-label">Organization</span>
            <button
               className={`nav-item${isActive('users') ? ' active' : ''}`}
               onClick={() => navigate('users')}
            >
              <span className="nav-icon">⚙️</span> Settings / Users
            </button>
          </>
        )}

        <div className="sidebar-bottom">
           <button 
            className="nav-item" 
            style={{ width: '100%', marginTop: 'auto', color: 'var(--danger)' }}
            onClick={logout}
          >
            <span className="nav-icon">🚪</span> Logout
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '12px' }}>
            AI Project Manager v1.2
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
    </ModalProvider>
  );
}
