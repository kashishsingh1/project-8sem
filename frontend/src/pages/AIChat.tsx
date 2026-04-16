import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  sendChatMessage, 
  getProjects, 
  getChatSessions, 
  createChatSession, 
  deleteChatSession, 
  renameChatSession, 
  getChatMessages 
} from '../lib/api';
import { useModal } from '../context/ModalContext';

export default function AIChat() {
  const qc = useQueryClient();
  const { confirm } = useModal();
  const [input, setInput] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Queries ───────────────────────────────────────────────
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const { data: sessions = [], isLoading: isSessionsLoading } = useQuery({ queryKey: ['chat_sessions'], queryFn: getChatSessions });
  const { data: messages = [] } = useQuery({
    queryKey: ['chat_messages', activeSessionId],
    queryFn: () => activeSessionId ? getChatMessages(activeSessionId) : Promise.resolve([]),
    enabled: !!activeSessionId,
  });

  // ── Mutations ─────────────────────────────────────────────
  const createSessionMutation = useMutation({
    mutationFn: () => createChatSession('New Conversation', selectedProjectId || undefined),
    onSuccess: (newSession) => {
      qc.invalidateQueries({ queryKey: ['chat_sessions'] });
      setActiveSessionId(newSession.id);
    }
  });

  const deleteSessionMutation = useMutation({
    mutationFn: deleteChatSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat_sessions'] });
      if (sessions.length > 1) {
        const remaining = sessions.filter((s: any) => s.id !== activeSessionId);
        if (remaining.length > 0) setActiveSessionId(remaining[0].id);
        else setActiveSessionId(null);
      } else setActiveSessionId(null);
    }
  });

  const renameSessionMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameChatSession(id, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat_sessions'] });
      setEditingSessionId(null);
    }
  });

  const chatMutation = useMutation({
    mutationFn: (msg: string) => {
      const history = messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
      return sendChatMessage(msg, selectedProjectId || undefined, history, activeSessionId || undefined);
    },
    onSuccess: (data) => {
      if (!activeSessionId) setActiveSessionId(data.sessionId);
      qc.invalidateQueries({ queryKey: ['chat_messages', activeSessionId || data.sessionId] });
      qc.invalidateQueries({ queryKey: ['chat_sessions'] });
    }
  });

  // ── Effects ───────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, chatMutation.isPending]);

  useEffect(() => {
    if (!activeSessionId && sessions.length > 0) setActiveSessionId(sessions[0].id);
  }, [sessions]);

  // ── Handlers ──────────────────────────────────────────────
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;
    const userMsg = input.trim();
    setInput('');
    chatMutation.mutate(userMsg);
  };

  const handleNewChat = () => createSessionMutation.mutate();

  const startRename = (e: React.MouseEvent, session: any) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const submitRename = () => {
    if (editingSessionId && editTitle.trim()) renameSessionMutation.mutate({ id: editingSessionId, title: editTitle.trim() });
  };

  return (
    <div style={{ height: 'calc(100vh - 72px)', display: 'flex', borderRadius: 24, overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* ── History Sidebar ───────────────────────────────────── */}
      <div style={{ 
        width: 300, 
        background: 'var(--bg-surface)', 
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 5
      }}>
        <div style={{ padding: '24px 20px' }}>
          <button 
            className="btn btn-primary btn-block glow-on-hover" 
            style={{ height: 44, borderRadius: 12, fontSize: 13, justifyContent: 'center' }}
            onClick={handleNewChat}
          >
            + New Chat
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 24px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 16, padding: '0 12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            History
          </div>
          
          <div className="sidebar-chat-list">
            {isSessionsLoading ? (
              <div style={{ padding: '0 12px', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
            ) : sessions.length === 0 ? (
              <div style={{ padding: '0 12px', color: 'var(--text-muted)', fontSize: 12 }}>No conversations.</div>
            ) : (
              sessions.map((session: any) => (
                <div 
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`sidebar-chat-item chat-history-item ${activeSessionId === session.id ? 'history-item-active' : ''}`}
                >
                  <span style={{ fontSize: 14 }}>💬</span>
                  {editingSessionId === session.id ? (
                    <input 
                      autoFocus
                      className="form-input"
                      style={{ height: 26, fontSize: 12, padding: '2px 8px', flex: 1, borderRadius: 6 }}
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onBlur={submitRename}
                      onKeyDown={e => e.key === 'Enter' && submitRename()}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {session.title}
                    </span>
                  )}
                  
                  <div className="history-actions" style={{ display: 'flex', gap: 6 }}>
                    <button onClick={(e) => startRename(e, session)} style={{ background: 'none', border: 'none', fontSize: 11, padding: 0 }}>✏️</button>
                    <button onClick={async (e) => { 
                      e.stopPropagation(); 
                      const ok = await confirm({
                        title: 'Delete Conversation?',
                        message: `Permanently delete "${session.title}" and all its messages?`,
                        type: 'danger'
                      });
                      if(ok) deleteSessionMutation.mutate(session.id); 
                    }} style={{ background: 'none', border: 'none', fontSize: 11, padding: 0 }}>🗑️</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Chat Container ───────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Header */}
        <div style={{ 
          padding: '20px 32px', 
          borderBottom: '1px solid var(--border)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: 'rgba(10, 13, 20, 0.4)',
          backdropFilter: 'blur(10px)'
        }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>AI Assistant</h1>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {activeSessionId ? 'Ready for your request' : 'Select a conversation to start'}
            </div>
          </div>
          
          <div style={{ minWidth: 200 }}>
             <select 
               className="form-select" 
               style={{ height: 36, fontSize: 13, background: 'var(--bg-card)' }}
               value={selectedProjectId}
               onChange={(e) => setSelectedProjectId(e.target.value)}
             >
               <option value="">Full Portfolio Context</option>
               {projects.map((p: any) => (
                 <option key={p.id} value={p.id}>{p.name}</option>
               ))}
             </select>
          </div>
        </div>

        {/* Message Pool */}
        <div 
          ref={scrollRef}
          style={{ 
            flex: 1, 
            padding: '40px 15% 20px', 
            overflowY: 'auto', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 24 
          }}
        >
          {messages.length === 0 && !chatMutation.isPending && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 64 }}>⚡</div>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>PlanAI Intelligent Agent</h3>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 300 }}>
                  Ask questions about project timelines, team capacity, or identify potential risks early.
                </p>
              </div>
            </div>
          )}

          {messages.map((m: any, i: number) => (
            <div 
              key={m.id || i}
              style={{ 
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                display: 'flex',
                gap: 12,
                flexDirection: m.role === 'user' ? 'row-reverse' : 'row'
              }}
            >
              <div style={{ 
                width: 32, height: 32, borderRadius: 8, background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-card)',
                display: 'grid', placeItems: 'center', fontSize: 14, flexShrink: 0, marginTop: 4,
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
              }}>
                {m.role === 'user' ? '👤' : '🤖'}
              </div>
              <div 
                className={m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}
                style={{ 
                  padding: '16px 20px',
                  borderRadius: 16,
                  fontSize: 14.5,
                  lineHeight: '1.6',
                  maxWidth: '100%',
                  wordBreak: 'break-word'
                }}
              >
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm] as any}>
                    {m.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}

          {chatMutation.isPending && (
            <div style={{ display: 'flex', gap: 12 }}>
               <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-card)', display: 'grid', placeItems: 'center' }}>🤖</div>
               <div className="chat-bubble-assistant" style={{ padding: '12px 20px', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Analyzing data...</span>
               </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div style={{ padding: '20px 15% 40px', background: 'transparent' }}>
          <form onSubmit={handleSend} className="pill-input-container">
            <input 
              className="form-input" 
              placeholder="Message PlanAI Assistant..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={chatMutation.isPending}
              style={{ flex: 1, background: 'none', border: 'none', boxShadow: 'none', height: 44, padding: 0 }}
            />
            <button className="btn-icon-glow" disabled={chatMutation.isPending || !input.trim()}>
               <span style={{ fontSize: 18 }}>➤</span>
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>
            Powered by Gemini AI • Live Contextual Reasoning
          </div>
        </div>
      </div>

      <style>{`
        .chat-history-item .history-actions { visibility: hidden; }
        .chat-history-item:hover .history-actions { visibility: visible; }
        .chat-history-item:hover { color: var(--text-primary); }
      `}</style>
    </div>
  );
}
