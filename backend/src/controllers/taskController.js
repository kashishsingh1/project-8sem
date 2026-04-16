const express = require('express');
const router = express.Router();
const db = require('../config/db');
const mailService = require('../services/mailService');

/**
 * @route GET /api/tasks/:projectId
 * @desc Get all tasks for a project
 */
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const result = await db.query(
      `SELECT t.*, 
        COALESCE(
          json_agg(
            json_build_object('depends_on', td.depends_on_task_id)
          ) FILTER (WHERE td.depends_on_task_id IS NOT NULL), 
          '[]'
        ) AS dependencies
       FROM tasks t
       LEFT JOIN task_dependencies td ON td.task_id = t.id
       WHERE t.project_id = $1
       GROUP BY t.id
       ORDER BY t.created_at ASC`,
      [projectId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route PATCH /api/tasks/:taskId
 * @desc Update a task (status, actual_hours, etc.)
 */
router.patch('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, actual_hours, title, description, due_date, estimated_hours, assigned_to } = req.body;

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (actual_hours !== undefined) {
      fields.push(`actual_hours = $${paramIndex++}`);
      values.push(actual_hours);
    }
    if (title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (due_date !== undefined) {
      fields.push(`due_date = $${paramIndex++}`);
      values.push(due_date);
    }
    if (estimated_hours !== undefined) {
      fields.push(`estimated_hours = $${paramIndex++}`);
      values.push(estimated_hours);
    }
    if (assigned_to !== undefined) {
      fields.push(`assigned_to = $${paramIndex++}`);
      values.push(assigned_to === '' ? null : assigned_to);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(taskId);
    const query = `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(result.rows[0]);

    // Async notification (don't await to avoid blocking response)
    if (assigned_to) {
      (async () => {
        try {
          const task = result.rows[0];
          const [memberRes, projectRes] = await Promise.all([
            db.query('SELECT name, email FROM team_members WHERE id = $1', [assigned_to]),
            db.query('SELECT name FROM projects WHERE id = $1', [task.project_id])
          ]);
          
          if (memberRes.rows[0] && projectRes.rows[0]) {
            await mailService.sendTaskAssignmentEmail(memberRes.rows[0], task, projectRes.rows[0]);
          }
        } catch (err) {
          console.error('Failed to send assignment email:', err);
        }
      })();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/tasks/:taskId
 * @desc Delete a task
 */
router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    await db.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/tasks
 * @desc Manually create a new task
 */
router.post('/', async (req, res) => {
  try {
    const { project_id, title, description, estimated_hours, due_date, assigned_to } = req.body;
    
    if (!project_id || !title) {
      return res.status(400).json({ error: 'project_id and title are required' });
    }

    const result = await db.query(
      `INSERT INTO tasks (project_id, title, description, estimated_hours, due_date, assigned_to) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [project_id, title, description, estimated_hours || 0, due_date, assigned_to]
    );

    res.status(201).json(result.rows[0]);

    // Async notification
    if (assigned_to) {
      (async () => {
        try {
          const task = result.rows[0];
          const [memberRes, projectRes] = await Promise.all([
            db.query('SELECT name, email FROM team_members WHERE id = $1', [assigned_to]),
            db.query('SELECT name FROM projects WHERE id = $1', [project_id])
          ]);
          
          if (memberRes.rows[0] && projectRes.rows[0]) {
            await mailService.sendTaskAssignmentEmail(memberRes.rows[0], task, projectRes.rows[0]);
          }
        } catch (err) {
          console.error('Failed to send assignment email:', err);
        }
      })();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
