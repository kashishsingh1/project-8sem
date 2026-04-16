import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Team from './pages/Team';
import Reports from './pages/Reports';
import AIChat from './pages/AIChat';

type Page = 'dashboard' | 'projects' | 'team' | 'reports' | 'chat' | { detail: string };

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');

  const navigate = (to: Page) => setPage(to);

  const renderPage = () => {
    if (page === 'dashboard') return <Dashboard navigate={navigate} />;
    if (page === 'projects') return <Projects navigate={navigate} />;
    if (page === 'team') return <Team />;
    if (page === 'reports') return <Reports />;
    if (page === 'chat') return <AIChat />;
    if (typeof page === 'object' && 'detail' in page)
      return <ProjectDetail projectId={page.detail} navigate={navigate} />;
    return null;
  };

  const isActive = (p: Page) => JSON.stringify(p) === JSON.stringify(page);

  return (
    <div className="app-layout">
      <div className="bg-glow" />

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">⚡</div>
          <span>PlanAI</span>
        </div>

        <span className="nav-label">Navigation</span>

        <button
          className={`nav-item${isActive('dashboard') ? ' active' : ''}`}
          onClick={() => navigate('dashboard')}
        >
          <span className="nav-icon">📊</span> Dashboard
        </button>

        <button
          className={`nav-item${isActive('projects') ? ' active' : ''}`}
          onClick={() => navigate('projects')}
        >
          <span className="nav-icon">📁</span> Projects
        </button>

        <button
          className={`nav-item${isActive('team') ? ' active' : ''}`}
          onClick={() => navigate('team')}
        >
          <span className="nav-icon">👥</span> Team
        </button>

        <span className="nav-label">AI Intelligence</span>

        <button
          className={`nav-item${isActive('reports') ? ' active' : ''}`}
          onClick={() => navigate('reports')}
        >
          <span className="nav-icon">📄</span> AI Reports
        </button>

        <button
          className={`nav-item${isActive('chat') ? ' active' : ''}`}
          onClick={() => navigate('chat')}
        >
          <span className="nav-icon">💬</span> AI Assistant
        </button>

        <div className="sidebar-bottom">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px' }}>
            AI Project Manager v1.2
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
