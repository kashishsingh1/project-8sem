import React from 'react';
import { motion } from 'framer-motion';
import { 
  Zap, 
  Brain, 
  Target, 
  Users, 
  BarChart3, 
  ShieldCheck, 
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import heroMockup from '../assets/hero-mockup.png';

interface Props {
  onGetStarted: () => void;
  onLogin: () => void;
}

const Landing: React.FC<Props> = ({ onGetStarted, onLogin }) => {
  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 }
  };

  const features = [
    {
      title: "AI Project Forecasting",
      desc: "Predict delays and risk scores before they happen with our proprietary neural engine.",
      icon: <Brain className="gradient-text" />,
      size: "large"
    },
    {
      title: "Smart Task Synthesis",
      desc: "Turn a single project description into a complete task board in seconds.",
      icon: <Zap className="gradient-text" />,
      size: "small"
    },
    {
      title: "Intelligent Workload",
      desc: "Auto-assign tasks based on team capacity and past velocity.",
      icon: <Users className="gradient-text" />,
      size: "small"
    },
    {
      title: "Strategic AI Reports",
      desc: "Automated insights for high-level stakeholders, delivered every morning.",
      icon: <BarChart3 className="gradient-text" />,
      size: "medium"
    },
    {
      title: "Enterprise Security",
      desc: "Bank-grade RBAC and data encryption for peace of mind.",
      icon: <ShieldCheck className="gradient-text" />,
      size: "small"
    },
    {
      title: "Zero Setup Cost",
      desc: "Integrated with your existing workflows within 5 minutes.",
      icon: <Target className="gradient-text" />,
      size: "small"
    }
  ];

  return (
    <div className="landing-page">
      <div className="hero-gradient-bg" />
      
      {/* Header */}
      <header className="landing-header">
        <div className="sidebar-logo" style={{ padding: 0 }}>
          <div className="logo-icon">⚡</div>
          <span>PlanAI</span>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <button onClick={onLogin} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontWeight: 500 }}>Login</button>
          <button className="btn btn-primary" onClick={onGetStarted}>Get Started <ChevronRight size={16}/></button>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ paddingTop: 200, paddingBottom: 80, textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <motion.div {...fadeInUp}>
            <span className="badge badge-in_progress" style={{ marginBottom: 24, padding: '6px 16px' }}>
              ✨ New: Predictive Risk Analysis v2.0
            </span>
            <h1 style={{ fontSize: 'clamp(40px, 8vw, 76px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 24 }}>
              The AI Engine for <br />
              <span className="gradient-text">Service-Driven Growth.</span>
            </h1>
            <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: 'var(--text-secondary)', maxWidth: 700, margin: '0 auto 40px', lineHeight: 1.6 }}>
              The first project management platform that thinks, predicts, and delegates. 
              Built specifically for modern agencies and service companies.
            </p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button className="btn btn-primary btn-lg" onClick={onGetStarted}>
                Start Building Today <ArrowRight size={20} />
              </button>
              <button className="btn btn-secondary btn-lg">View Demo</button>
            </div>
          </motion.div>

          {/* Hero Visual */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 1, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginTop: 80 }}
          >
            <div className="glass-morphism floating-hero" style={{ borderRadius: 24, padding: 8, maxWidth: 1000, margin: '0 auto', overflow: 'hidden' }}>
              <img 
                src={heroMockup} 
                alt="PlanAI Dashboard" 
                style={{ width: '100%', borderRadius: 16, display: 'block', boxShadow: '0 20px 80px rgba(0,0,0,0.4)' }}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section style={{ padding: '100px 0', borderTop: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'left', marginBottom: 60 }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>Engineered for Results.</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 18 }}>Everything you need to scale your service agency without the overhead.</p>
          </div>
          
          <div className="bento-grid">
            {features.map((f, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`bento-item ${f.size === 'large' ? 'glass-morphism' : ''}`}
                style={{ 
                  gridColumn: f.size === 'large' ? '1 / -1' : 'auto',
                  minHeight: f.size === 'large' ? 320 : 'auto'
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.03)', display: 'grid', placeItems: 'center', marginBottom: 24 }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>{f.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6 }}>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof / Stats */}
      <section style={{ padding: '80px 0', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 40, textAlign: 'center' }}>
          <div>
            <div className="gradient-text" style={{ fontSize: 48, fontWeight: 900 }}>40%</div>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginTop: 8 }}>Avg. Efficiency Boost</div>
          </div>
          <div>
            <div className="gradient-text" style={{ fontSize: 48, fontWeight: 900 }}>99.4%</div>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginTop: 8 }}>Forecast Accuracy</div>
          </div>
          <div>
            <div className="gradient-text" style={{ fontSize: 48, fontWeight: 900 }}>100ms</div>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginTop: 8 }}>Real-time Prediction</div>
          </div>
          <div>
            <div className="gradient-text" style={{ fontSize: 48, fontWeight: 900 }}>Secured</div>
            <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginTop: 8 }}>ISO 27001 Ready</div>
          </div>
        </div>
      </section>

      {/* Pricing / Final CTA */}
      <section style={{ padding: '120px 0', textAlign: 'center' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px' }}>
          <h2 style={{ fontSize: 48, fontWeight: 900, marginBottom: 24 }}>Ready to outpace the competition?</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 20, marginBottom: 40 }}>Join the professional beta program and be the first to ship with PlanAI.</p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <button className="btn btn-primary btn-lg" onClick={onGetStarted}>Create Free Account</button>
            <button className="btn btn-secondary btn-lg" onClick={onLogin}>Contact Sales</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '60px 24px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 32 }}>
          <a href="#" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Product</a>
          <a href="#" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Security</a>
          <a href="#" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Privacy</a>
          <a href="#" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>API</a>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          © 2026 PlanAI Intelligence. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default Landing;
