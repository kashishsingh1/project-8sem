import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001/api',
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor to add JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('planai_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('planai_token');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth & Users ───────────────────────────────────────────
export const loginUser = (data: any) => api.post('/auth/login', data).then(r => r.data);
export const signupUser = (data: any) => api.post('/auth/signup', data).then(r => r.data);
export const getMe = () => api.get('/auth/me').then(r => r.data);
export const getOrgUsers = () => api.get('/users').then(r => r.data);
export const inviteUser = (email: string, roleKey: string) => api.post('/users/invite', { email, roleKey }).then(r => r.data);

// ── Projects ──────────────────────────────────────────────
export const getProjects = () =>
  api.get('/projects').then(r => r.data);

export const createProject = (data: {
  name: string;
  description: string;
  start_date?: string;
  end_date?: string;
}) => api.post('/projects', data).then(r => r.data);

export const updateProject = (projectId: string, data: any) =>
  api.patch(`/projects/${projectId}`, data).then(r => r.data);

export const deleteProject = (projectId: string) =>
  api.delete(`/projects/${projectId}`).then(r => r.data);

// ── Tasks ──────────────────────────────────────────────────
export const getTasksByProject = (projectId: string) =>
  api.get(`/tasks/${projectId}`).then(r => r.data);

export const createTask = (data: {
  project_id: string;
  title: string;
  description?: string;
  estimated_hours?: number;
  due_date?: string;
  assigned_to?: string;
}) => api.post('/tasks', data).then(r => r.data);

export const updateTask = (taskId: string, data: Partial<{
  status: string;
  actual_hours: number;
  title: string;
  description: string;
  due_date: string;
  assigned_to: string;
}>) => api.patch(`/tasks/${taskId}`, data).then(r => r.data);

export const deleteTask = (taskId: string) =>
  api.delete(`/tasks/${taskId}`).then(r => r.data);

// ── Dashboard ──────────────────────────────────────────────
export const getDashboard = () =>
  api.get('/dashboard').then(r => r.data);

export const getProjectDashboard = (projectId: string) =>
  api.get(`/dashboard/${projectId}`).then(r => r.data);

export const getGanttData = (projectId: string) =>
  api.get(`/dashboard/${projectId}/gantt`).then(r => r.data);

// ── Team ──────────────────────────────────────────────────
export const getTeam = () =>
  api.get('/team').then(r => r.data);

export const getTasksByMember = (memberId: string) =>
  api.get(`/team/${memberId}/tasks`).then(r => r.data);

export const createMember = (data: {
  name: string;
  email: string;
  role?: string;
  availability_hours?: number;
}) => api.post('/team', data).then(r => r.data);

export const updateMember = (memberId: string, data: any) =>
  api.patch(`/team/${memberId}`, data).then(r => r.data);

export const deleteMember = (memberId: string) =>
  api.delete(`/team/${memberId}`).then(r => r.data);

export const getRoles = () =>
  api.get('/team/roles').then(r => r.data);

export const createRole = (name: string) =>
  api.post('/team/roles', { name }).then(r => r.data);

export const updateRole = (id: string, name: string) =>
  api.patch(`/team/roles/${id}`, { name }).then(r => r.data);

export const deleteRole = (id: string) =>
  api.delete(`/team/roles/${id}`).then(r => r.data);

export const assignTask = (taskId: string, memberId: string) =>
  api.post('/team/assign', { taskId, memberId }).then(r => r.data);

export const suggestTeam = (projectId: string) =>
  api.post('/team/suggest', { projectId }).then(r => r.data);

// ── Reports ───────────────────────────────────────────────
export const generateReport = (projectId: string) =>
  api.post('/reports/generate', { projectId }).then(r => r.data);

export const getReportHistory = (projectId: string) =>
  api.get(`/reports/${projectId}/history`).then(r => r.data);

export const deleteReport = (reportId: string) =>
  api.delete(`/reports/history/${reportId}`).then(r => r.data);

export const getPortfolioSummary = () =>
  api.get('/reports/summary').then(r => r.data);

// ── AI Chat ───────────────────────────────────────────────
export const sendChatMessage = (message: string, projectId?: string, history: any[] = [], sessionId?: string) =>
  api.post('/chat', { message, projectId, history, sessionId }).then(r => r.data);

export const getChatSessions = () =>
  api.get('/chat/sessions').then(r => r.data);

export const createChatSession = (title?: string, projectId?: string) =>
  api.post('/chat/sessions', { title, projectId }).then(r => r.data);

export const renameChatSession = (id: string, title: string) =>
  api.patch(`/chat/sessions/${id}`, { title }).then(r => r.data);

export const deleteChatSession = (id: string) =>
  api.delete(`/chat/sessions/${id}`).then(r => r.data);

export const getChatMessages = (sessionId: string) =>
  api.get(`/chat/sessions/${sessionId}/messages`).then(r => r.data);

export default api;

