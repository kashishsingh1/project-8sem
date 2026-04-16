const express = require('express');
const router = express.Router();
const db = require('../config/db');
const riskService = require('../services/riskService');
const ganttService = require('../services/ganttService');

/**
 * @route GET /api/dashboard
 * @desc Get aggregated KPIs for the main dashboard
 */
router.get('/', async (req, res) => {
  try {
    const [projects, taskStats] = await Promise.all([
      db.query(`SELECT id, name, status, risk_score, start_date, end_date, created_at FROM projects ORDER BY created_at DESC`),
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'done') AS completed_tasks,
          COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_tasks,
          COUNT(*) FILTER (WHERE status = 'todo') AS todo_tasks,
          COUNT(*) AS total_tasks,
          COALESCE(SUM(estimated_hours), 0) AS total_estimated_hours,
          COALESCE(SUM(actual_hours), 0) AS total_actual_hours
        FROM tasks
      `)
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
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const riskData = await riskService.updateProjectRiskScore(projectId);

    const [project, tasks, riskHistory] = await Promise.all([
      db.query('SELECT * FROM projects WHERE id = $1', [projectId]),
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
router.get('/:projectId/gantt', async (req, res) => {
  try {
    const { projectId } = req.params;
    const ganttData = await ganttService.computeGanttData(projectId);
    res.json(ganttData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

