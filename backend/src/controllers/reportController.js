const express = require('express');
const router = express.Router();
const db = require('../config/db');
const geminiService = require('../services/geminiService');

/**
 * @route POST /api/reports/generate
 * @desc Generate an AI-powered client update report for a project
 */
router.post('/generate', async (req, res) => {
  try {
    const { projectId } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    // 1. Fetch project data
    const [projectResult, tasksResult] = await Promise.all([
      db.query('SELECT * FROM projects WHERE id = $1', [projectId]),
      db.query('SELECT title, status, estimated_hours, actual_hours, due_date FROM tasks WHERE project_id = $1', [projectId]),
    ]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];
    const tasks = tasksResult.rows;

    const completed = tasks.filter(t => t.status === 'done').length;
    const total = tasks.length;
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    // 2. Build a rich prompt for Gemini
    const prompt = `You are a professional project manager writing a client-facing weekly status update.

**Project:** ${project.name}
**Description:** ${project.description}
**Status:** ${project.status}
**Timeline:** ${project.start_date || 'N/A'} to ${project.end_date || 'N/A'}
**Risk Score:** ${project.risk_score}/1.00

**Task Summary:**
- Total Tasks: ${total}
- Completed: ${completed} (${completionPct}%)
- In Progress: ${tasks.filter(t => t.status === 'in_progress').length}
- To Do: ${tasks.filter(t => t.status === 'todo').length}

**Task Details:**
${tasks.map(t => `- [${t.status.toUpperCase()}] ${t.title} (Est: ${t.estimated_hours}h, Actual: ${t.actual_hours}h)`).join('\n')}

Generate a professional, concise client update report with these sections:
1. **Executive Summary** (2-3 sentences)
2. **Progress Highlights** (bullet points of completed/in-progress work)
3. **Upcoming Milestones** (what's next)
4. **Risks & Concerns** (if risk score > 0.3, highlight potential delays)
5. **Next Steps** (clear action items)

Use a professional but friendly tone. Keep it under 300 words. Use markdown formatting.`;

    const report = await geminiService.generateText(prompt);
    
    // Save to history
    await db.query(
      'INSERT INTO generated_reports (project_id, report_type, content) VALUES ($1, $2, $3)',
      [projectId, 'client_update', report]
    );

    res.json({
      projectId,
      projectName: project.name,
      generatedAt: new Date().toISOString(),
      completionPercent: completionPct,
      report,
    });
  } catch (error) {
    console.error('Report Generation Error:', error);
    res.status(500).json({ error: 'Failed to generate report', message: error.message });
  }
});

/**
 * @route GET /api/reports/:projectId/history
 * @desc Get past reports for a project
 */
router.get('/:projectId/history', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await db.query('SELECT * FROM generated_reports WHERE project_id = $1 ORDER BY generated_at DESC', [projectId]);
    res.json(result.rows);
  } catch (error) {
    console.error('History Query Error:', error);
    res.status(500).json({ error: 'Failed to fetch report history', message: error.message });
  }
});

/**
 * @route DELETE /api/reports/history/:id
 * @desc Delete a report from history
 */
router.delete('/history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM generated_reports WHERE id = $1', [id]);
    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Delete History Error:', error);
    res.status(500).json({ error: 'Failed to delete report', message: error.message });
  }
});

/**
 * @route GET /api/reports/summary
 * @desc Generate a portfolio-level summary across all projects
 */
router.get('/summary', async (req, res) => {
  try {
    const projectsResult = await db.query(`
      SELECT p.name, p.status, p.risk_score,
        COUNT(t.id) as total_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'done') as completed_tasks
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);

    const projects = projectsResult.rows;

    if (projects.length === 0) {
      return res.json({ report: 'No projects found. Create a project to generate reports.' });
    }

    const prompt = `You are a senior project manager presenting a portfolio overview to leadership.

**Active Projects:**
${projects.map(p => `- **${p.name}** | Status: ${p.status} | Risk: ${(Number(p.risk_score) * 100).toFixed(0)}% | Tasks: ${p.completed_tasks}/${p.total_tasks} done`).join('\n')}

Write a brief portfolio summary (150 words max) covering:
1. Overall health of the portfolio
2. Any projects needing attention (high risk)
3. Key recommendations

Use markdown. Be concise and data-driven.`;

    const report = await geminiService.generateText(prompt);
    res.json({ generatedAt: new Date().toISOString(), report });
  } catch (error) {
    console.error('Summary Error:', error);
    res.status(500).json({ error: 'Failed to generate summary', message: error.message });
  }
});

module.exports = router;
