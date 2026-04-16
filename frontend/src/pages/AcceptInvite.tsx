import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function AcceptInvite() {
  const { user, login } = useAuth();
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<{ email: string; orgName: string } | null>(null);
  
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing invitation token.');
      setLoading(false);
      return;
    }

    const verify = async () => {
      try {
        const res = await api.get(`/users/invite/verify/${token}`);
        setInviteData(res.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to verify invitation.');
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || password.length < 6) return setError('Password must be at least 6 characters.');
    
    setSubmitting(true);
    try {
      const res = await api.post('/users/invite/accept', { token, name, password });
      // Clear current session if logged in as someone else (user request preference)
      if (user && user.email !== inviteData?.email) {
        // Technically the accept endpoint doesn't need us to logout first, 
        // but we want to ensure the AuthContext updates cleanly.
      }
      login(res.data.user, res.data.token);
      window.location.href = '/'; // Simple redirect to dashboard
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="auth-page"><div className="spinner" /></div>;

  if (error || !inviteData) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>🛑</div>
          <h2 style={{ marginBottom: 12 }}>Invitation Issue</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>{error}</p>
          <button className="btn btn-primary" onClick={() => window.location.href = '/'}>Go to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="bg-glow" />
      
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div className="logo-icon" style={{ margin: '0 auto 16px', fontSize: 32 }}>⚡</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Welcome to PlanAI</h1>
          <p style={{ color: 'var(--text-secondary)' }}>You've been invited to join <strong>{inviteData.orgName}</strong></p>
        </div>

        {user && user.email !== inviteData.email && (
          <div className="alert alert-warning" style={{ marginBottom: 24, padding: 12, borderRadius: 8, fontSize: 13, background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            ⚠️ You are currently logged in as <strong>{user.email}</strong>. 
            Accepting this invite will switch your account to <strong>{inviteData.email}</strong>.
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" value={inviteData.email} disabled style={{ opacity: 0.6 }} />
          </div>

          <div className="form-group">
            <label className="form-label">Your Full Name</label>
            <input 
              className="form-input" 
              placeholder="Enter your name" 
              required 
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Create Password</label>
            <input 
              type="password"
              className="form-input" 
              placeholder="At least 6 characters" 
              required 
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            className="auth-button" 
            disabled={submitting}
            style={{ marginTop: 8 }}
          >
            {submitting ? 'Setting up...' : 'Accept Invitation & Join'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
          By joining, you agree to the organization's policies.
        </div>
      </div>
    </div>
  );
}
