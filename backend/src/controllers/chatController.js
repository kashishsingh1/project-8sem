const express = require('express');
const router = express.Router();
const db = require('../config/db');
const geminiService = require('../services/geminiService');
const { auth, checkPermission } = require('../middleware/authMiddleware');

/**
 * @route GET /api/chat/sessions
 * @desc Get all chat sessions (history)
 */
router.get('/sessions', auth, checkPermission('ai:assistant'), async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM chat_sessions WHERE org_id = $1 ORDER BY updated_at DESC',
      [req.user.org_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/chat/sessions
 * @desc Create a new chat session
 */
router.post('/sessions', auth, checkPermission('ai:assistant'), async (req, res) => {
  try {
    const { title, projectId } = req.body;
    
    // Verify project belongs to org if provided
    if (projectId) {
      const pCheck = await db.query('SELECT id FROM projects WHERE id = $1 AND org_id = $2', [projectId, req.user.org_id]);
      if (pCheck.rows.length === 0) return res.status(403).json({ error: 'Access denied to project' });
    }

    const result = await db.query(
      'INSERT INTO chat_sessions (title, project_id, org_id) VALUES ($1, $2, $3) RETURNING *',
      [title || 'New Conversation', projectId || null, req.user.org_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route PATCH /api/chat/sessions/:sessionId
 * @desc Rename a chat session
 */
router.patch('/sessions/:sessionId', auth, checkPermission('ai:assistant'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title } = req.body;
    const result = await db.query(
      'UPDATE chat_sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND org_id = $3 RETURNING *',
      [title, sessionId, req.user.org_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found or access denied' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/chat/sessions/:sessionId
 * @desc Delete a chat session and its messages
 */
router.delete('/sessions/:sessionId', auth, checkPermission('ai:assistant'), async (req, res) => {
  try {
    await db.query('DELETE FROM chat_sessions WHERE id = $1 AND org_id = $2', [sessionId, req.user.org_id]);
    res.json({ message: 'Session deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/chat/sessions/:sessionId/messages
 * @desc Get all messages for a session
 */
router.get('/sessions/:sessionId/messages', auth, checkPermission('ai:assistant'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await db.query(
      `SELECT m.* FROM chat_messages m
       JOIN chat_sessions s ON m.session_id = s.id
       WHERE m.session_id = $1 AND s.org_id = $2
       ORDER BY m.created_at ASC`,
      [sessionId, req.user.org_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/chat
 * @desc AI Project Assistant — answers questions with session persistence
 */
router.post('/', auth, checkPermission('ai:assistant'), async (req, res) => {
  try {
    const { message, projectId, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    let activeSessionId = sessionId;

    // 1. Create a session if none exists (fallback)
    if (!activeSessionId) {
      const sessionResult = await db.query(
        'INSERT INTO chat_sessions (title, project_id, org_id) VALUES ($1, $2, $3) RETURNING id',
        [message.substring(0, 30) + (message.length > 30 ? '...' : ''), projectId || null, req.user.org_id]
      );
      activeSessionId = sessionResult.rows[0].id;
    } else {
      // Verify session belongs to user org
      const sCheck = await db.query('SELECT id FROM chat_sessions WHERE id = $1 AND org_id = $2', [activeSessionId, req.user.org_id]);
      if (sCheck.rows.length === 0) return res.status(403).json({ error: 'Access denied to session' });
    }

    // 2. Save User Message
    await db.query(
      'INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)',
      [activeSessionId, 'user', message]
    );

    // 3. Gather Context (RAG-lite)
    let contextData = '';
    const targetProjectId = projectId || null; // Could also pull from session if needed

    if (targetProjectId) {
      const [project, tasks, team] = await Promise.all([
        db.query('SELECT * FROM projects WHERE id = $1', [targetProjectId]),
        db.query(`
          SELECT t.title, t.status, t.estimated_hours, t.actual_hours, t.due_date, 
                 tm.name as assigned_to_name
          FROM tasks t
          LEFT JOIN team_members tm ON t.assigned_to = tm.id
          WHERE t.project_id = $1
        `, [targetProjectId]),
        db.query(`
          SELECT tm.name, tm.role, tm.availability_hours,
            COALESCE(SUM(t.estimated_hours) FILTER (WHERE t.status != 'done'), 0) as current_workload
          FROM team_members tm
          LEFT JOIN tasks t ON tm.id = t.assigned_to
          WHERE tm.org_id = $1
          GROUP BY tm.id
        `, [req.user.org_id]),
      ]);

      const p = project.rows[0];
      if (p) {
        contextData = `**Project: ${p.name}**\n${p.description}\nTasks: ${tasks.rows.length}\nTeam Workload:\n${team.rows.map(m => `- ${m.name}: ${m.current_workload}h`).join('\n')}`;
      }
    } else {
      const [projects, team] = await Promise.all([
        db.query(`SELECT p.name, p.status, COUNT(t.id) as tasks FROM projects p LEFT JOIN tasks t ON t.project_id = p.id WHERE p.org_id = $1 GROUP BY p.id`, [req.user.org_id]),
        db.query(`
          SELECT tm.name, tm.role, tm.availability_hours,
            COALESCE(SUM(t.estimated_hours) FILTER (WHERE t.status != 'done'), 0) as current_workload
          FROM team_members tm
          LEFT JOIN tasks t ON tm.id = t.assigned_to
          WHERE tm.org_id = $1
          GROUP BY tm.id
        `, [req.user.org_id])
      ]);
      contextData = `**Portfolio Overview:**\n${projects.rows.map(p => `- ${p.name} (${p.status})`).join('\n')}\n\n**Team Workload:**\n${team.rows.map(m => `- ${m.name}: ${m.current_workload}h`).join('\n')}`;
    }

    const enhancedMessage = `[CONTEXT]\n${contextData}\n\n[USER QUESTION]\n${message}`;

    // 4. Fetch History for Gemini
    const historyResult = await db.query(
      'SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT 20',
      [activeSessionId]
    );
    
    // Format for Gemini (map user/assistant to user/model)
    // Note: Gemini expects history to start with 'user' and alternate. 
    // Since we just saved the current user message but haven't sent it yet, 
    // we provide the history *before* this message.
    const geminiHistory = historyResult.rows.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    // 5. Call Gemini
    const reply = await geminiService.chat(enhancedMessage, geminiHistory);

    // 6. Save Assistant Reply
    await db.query(
      'INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)',
      [activeSessionId, 'assistant', reply]
    );

    // 7. Update Session timestamp
    await db.query('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [activeSessionId]);

    res.json({
      message: reply,
      sessionId: activeSessionId
    });
  } catch (error) {
    console.error('Chat Assistant Error:', error);
    res.status(500).json({ error: 'AI Assistant failed', message: error.message });
  }
});

module.exports = router;
