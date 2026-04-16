import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

interface SignupProps {
  onLoginClick: () => void;
}

export default function Signup({ onLoginClick }: SignupProps) {
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    orgName: '',
    name: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/signup', formData);
      login(res.data.token, res.data.user);
    } catch (err: any) {
      const errorData = err.response?.data;
      const message = typeof errorData === 'string' 
        ? errorData 
        : (errorData?.error || errorData?.message || 'Signup failed. Please try again.');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="auth-page">
      <div className="bg-glow" style={{ position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)', opacity: 0.5 }} />
      
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo">⚡</span>
          <h1>Create Organization</h1>
          <p>Get started with PlanAI and supercharge your projects</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Organization Name</label>
            <input 
              name="orgName"
              type="text" 
              placeholder="e.g. Acme Studio" 
              required 
              value={formData.orgName}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Full Name</label>
            <input 
              name="name"
              type="text" 
              placeholder="John Doe" 
              required 
              value={formData.name}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Email Address</label>
            <input 
              name="email"
              type="email" 
              placeholder="name@company.com" 
              required 
              value={formData.email}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input 
              name="password"
              type="password" 
              placeholder="Create a secure password" 
              required 
              value={formData.password}
              onChange={handleChange}
            />
          </div>

          <button className="auth-button" type="submit" disabled={loading}>
            {loading ? 'Creating Account...' : 'Get Started Free'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? 
          <button onClick={onLoginClick}>Sign In</button>
        </div>
      </div>
    </div>
  );
}
