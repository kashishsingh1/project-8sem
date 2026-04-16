const express = require('express');
const router = express.Router();
const db = require('../config/db');
const riskService = require('../services/riskService');
const ganttService = require('../services/ganttService');
const { auth, checkPermission } = require('../middleware/authMiddleware');

/**
 * @route GET /api/dashboard
 * @desc Get aggregated KPIs for the main dashboard
 */
router.get('/', auth, async (req, res) => {
  try {
    const orgId = req.user.org_id;
    const [projects, taskStats] = await Promise.all([
      db.query(
        `SELECT p.id, p.name, p.status, p.risk_score, p.start_date, p.end_date, p.created_at, u.name as owner_name 
         FROM projects p 
         LEFT JOIN users u ON p.owner_id = u.id 
         WHERE p.org_id = $1 
         ORDER BY p.created_at DESC`,
        [orgId]
      ),
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'done') AS completed_tasks,
          COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_tasks,
          COUNT(*) FILTER (WHERE status = 'todo') AS todo_tasks,
          COUNT(*) AS total_tasks,
          COALESCE(SUM(estimated_hours), 0) AS total_estimated_hours,
          COALESCE(SUM(actual_hours), 0) AS total_actual_hours
        FROM tasks
        WHERE project_id IN (SELECT id FROM projects WHERE org_id = $1)
      `, [orgId])
    ]);

    res.json({
      projects: projects.rows,
      stats: taskStats.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/dashboard/:projectId
 * @desc Get full dashboard for a specific project including risk analysis
 */
router.get('/:projectId', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const orgId = req.user.org_id;

    // Verify project belongs to org
    const projectCheck = await db.query('SELECT id FROM projects WHERE id = $1 AND org_id = $2', [projectId, orgId]);
    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const riskData = await riskService.updateProjectRiskScore(projectId);

    const [project, tasks, riskHistory] = await Promise.all([
      db.query(
        `SELECT p.*, u.name as owner_name 
         FROM projects p 
         LEFT JOIN users u ON p.owner_id = u.id 
         WHERE p.id = $1`, 
        [projectId]
      ),
      db.query(
        `SELECT t.*, tm.name as assigned_to_name
         FROM tasks t 
         LEFT JOIN team_members tm ON t.assigned_to = tm.id 
         WHERE t.project_id = $1 
         ORDER BY t.created_at ASC`,
        [projectId]
      ),
      db.query('SELECT risk_score, predicted_delay_days, recorded_at FROM risk_snapshots WHERE project_id = $1 ORDER BY recorded_at ASC', [projectId])
    ]);

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const taskList = tasks.rows;
    const completedTasks = taskList.filter(t => t.status === 'done').length;
    const completionPercent = taskList.length > 0
      ? Math.round((completedTasks / taskList.length) * 100)
      : 0;

    res.json({
      project: project.rows[0],
      tasks: taskList,
      stats: {
        total: taskList.length,
        completed: completedTasks,
        in_progress: taskList.filter(t => t.status === 'in_progress').length,
        todo: taskList.filter(t => t.status === 'todo').length,
        completion_percent: completionPercent
      },
      risk: riskData,
      risk_history: riskHistory.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/dashboard/:projectId/gantt
 * @desc Get computed gantt chart data
 */
router.get('/:projectId/gantt', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const orgId = req.user.org_id;

    // Verify project belongs to org
    const projectCheck = await db.query('SELECT id FROM projects WHERE id = $1 AND org_id = $2', [projectId, orgId]);
    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const ganttData = await ganttService.computeGanttData(projectId);
    res.json(ganttData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

