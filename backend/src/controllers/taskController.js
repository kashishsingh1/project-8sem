const express = require('express');
const router = express.Router();
const db = require('../config/db');
const mailService = require('../services/mailService');
const { auth, checkPermission } = require('../middleware/authMiddleware');

/**
 * @route GET /api/tasks/:projectId
 * @desc Get all tasks for a project
 */
router.get('/:projectId', auth, checkPermission('tasks:view'), async (req, res) => {
  try {
    const { projectId } = req.params;

    // Verify project belongs to user org
    const projectCheck = await db.query('SELECT id FROM projects WHERE id = $1 AND org_id = $2', [projectId, req.user.org_id]);
    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

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
router.patch('/:taskId', auth, checkPermission('tasks:manage'), async (req, res) => {
  try {
    const { taskId } = req.params;

    // Verify task belongs to user org via project
    const taskCheck = await db.query(
      'SELECT t.id, t.assigned_to FROM tasks t JOIN projects p ON t.project_id = p.id WHERE t.id = $1 AND p.org_id = $2',
      [taskId, req.user.org_id]
    );
    if (taskCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

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
    // Extra safety: re-check org_id in UPDATE
    const query = `
      UPDATE tasks SET ${fields.join(', ')} 
      WHERE id = $${paramIndex} 
      AND project_id IN (SELECT id FROM projects WHERE org_id = $${paramIndex + 1}) 
      RETURNING *`;
    
    values.push(req.user.org_id);
    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(result.rows[0]);

    // 2. Async Notifications
    (async () => {
      try {
        const task = result.rows[0];
        const prevTask = taskCheck.rows[0]; // I'll need to fetch more fields in the check query
        
        // Fetch assignee and project details
        const [memberRes, projectRes] = await Promise.all([
          db.query('SELECT name, email FROM team_members WHERE id = $1', [task.assigned_to]),
          db.query('SELECT name FROM projects WHERE id = $1', [task.project_id])
        ]);

        const member = memberRes.rows[0];
        const project = projectRes.rows[0];

        if (member && project) {
          // If the assignee just changed or was newly set
          if (assigned_to && assigned_to !== prevTask.assigned_to && assigned_to !== '') {
            await mailService.sendTaskAssignmentEmail(member, task, project);
          } 
          // If the task was already assigned to this person, but other fields changed
          else if (task.assigned_to && (status || title || due_date)) {
            const changes = [
              status ? `Status changed to <strong>${status}</strong>` : null,
              title ? `Title updated to <strong>${title}</strong>` : null,
              due_date ? `Due date moved to <strong>${new Date(due_date).toLocaleDateString()}</strong>` : null
            ].filter(Boolean).join(', ');
            
            await mailService.sendTaskUpdateEmail(member, task, project, changes);
          }
        }
      } catch (err) {
        console.error('Failed to send task notification:', err);
      }
    })();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/tasks/:taskId
 * @desc Delete a task
 */
router.delete('/:taskId', auth, checkPermission('tasks:manage'), async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const result = await db.query(
      `DELETE FROM tasks 
       WHERE id = $1 
       AND project_id IN (SELECT id FROM projects WHERE org_id = $2)
       RETURNING *`, 
      [taskId, req.user.org_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }
    
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/tasks
 * @desc Manually create a new task
 */
router.post('/', auth, checkPermission('tasks:manage'), async (req, res) => {
  try {
    const { project_id, title, description, estimated_hours, due_date, assigned_to } = req.body;
    
    // Verify project belongs to user org
    const projectCheck = await db.query('SELECT id FROM projects WHERE id = $1 AND org_id = $2', [project_id, req.user.org_id]);
    if (projectCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    
    if (!project_id || !title) {
      return res.status(400).json({ error: 'project_id and title are required' });
    }

    const result = await db.query(
      `INSERT INTO tasks (project_id, title, description, estimated_hours, due_date, assigned_to, org_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [project_id, title, description, estimated_hours || 0, due_date, assigned_to, req.user.org_id]
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
