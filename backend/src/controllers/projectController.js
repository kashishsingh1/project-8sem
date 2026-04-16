const express = require('express');
const router = express.Router();
const db = require('../config/db');
const geminiService = require('../services/geminiService');
const { auth, checkPermission } = require('../middleware/authMiddleware');

/**
 * @route GET /api/projects
 * @desc Get all projects
 */
router.get('/', auth, async (req, res) => {
  try {
    const hasViewAll = req.user.permissions.includes('projects:view_all') || req.user.permissions.includes('*');
    const hasView = req.user.permissions.includes('projects:view');

    if (!hasViewAll && !hasView) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to view projects.' });
    }

    
    let queryStr = '';
    let params = [req.user.org_id];

    if (hasViewAll) {
      queryStr = `
        SELECT p.*, u.name as owner_name 
        FROM projects p 
        LEFT JOIN users u ON p.owner_id = u.id 
        WHERE p.org_id = $1 
        ORDER BY p.created_at DESC
      `;
    } else {
      queryStr = `
        SELECT p.*, u.name as owner_name 
        FROM projects p 
        LEFT JOIN users u ON p.owner_id = u.id 
        WHERE p.org_id = $1 
        AND (
          p.owner_id = $2 
          OR EXISTS (
            SELECT 1 FROM tasks t 
            JOIN team_members tm ON t.assigned_to = tm.id 
            WHERE t.project_id = p.id AND tm.email = $3
          )
        )
        ORDER BY p.created_at DESC
      `;
      params.push(req.user.id, req.user.email);
    }

    const result = await db.query(queryStr, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/projects
 * @desc Create new project and generate AI tasks
 */
router.post('/', auth, checkPermission('projects:create'), async (req, res) => {
  try {
    const { name, description, start_date, end_date } = req.body;
    
    // Validation
    if (!name || !description || !start_date || !end_date) {
      return res.status(400).json({ 
        error: 'Validation Error', 
        message: 'Project name, description, start date, and end date are mandatory.' 
      });
    }

    // 1. Core Project Insertion
    const projectResult = await db.query(
      'INSERT INTO projects (name, description, start_date, end_date, org_id, owner_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, description, start_date, end_date, req.user.org_id, req.user.id]
    );
    const project = projectResult.rows[0];

    // 2. Generate AI Task Plan
    const prompt = `Act as an expert Project Manager. 
    Project: ${name}
    Goal: ${description}
    Requirements: Break this into 5-10 specific, actionable tasks with estimated hours and dependencies.
    Format: Return ONLY a JSON object with a 'tasks' array. 
    Each task: { "title": string, "hours": number, "dep_index": number | null }`;

    const aiResponse = await geminiService.generatePlan(prompt);
    const aiTasks = aiResponse.tasks || [];

    // 3. Insert Tasks into DB
    const insertedTasks = [];
    for (const task of aiTasks) {
      const taskResult = await db.query(
        'INSERT INTO tasks (project_id, title, estimated_hours) VALUES ($1, $2, $3) RETURNING *',
        [project.id, task.title, task.hours]
      );
      insertedTasks.push({ ...taskResult.rows[0], dep_index: task.dep_index });
    }

    // 4. Handle Dependencies (Self-referencing)
    for (const task of insertedTasks) {
      if (task.dep_index !== null && insertedTasks[task.dep_index]) {
        await db.query(
          'INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)',
          [task.id, insertedTasks[task.dep_index].id]
        );
      }
    }

    // 5. Trigger Confirmation Email (Async)
    (async () => {
      try {
        const mailService = require('../services/mailService');
        await mailService.sendProjectConfirmationEmail(req.user, project);
      } catch (err) {
        console.error('Failed to send project confirmation email:', err);
      }
    })();

    res.status(201).json({ project, tasks: insertedTasks });
  } catch (error) {
    console.error('AI Planning Error:', error);
    res.status(500).json({ error: 'Failed to create AI project plan', message: error.message });
  }
});

/**
 * @route PATCH /api/projects/:id
 * @desc Update project details
 */
router.patch('/:id', auth, checkPermission('projects:manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, start_date, end_date, status } = req.body;
    
    const fields = [];
    const values = [];
    let idx = 1;

    if (name) { fields.push(`name = $${idx++}`); values.push(name); }
    if (description) { fields.push(`description = $${idx++}`); values.push(description); }
    if (start_date) { fields.push(`start_date = $${idx++}`); values.push(start_date); }
    if (end_date) { fields.push(`end_date = $${idx++}`); values.push(end_date); }
    if (status) { fields.push(`status = $${idx++}`); values.push(status); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields provided' });

    values.push(id, req.user.org_id);
    const result = await db.query(
      `UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx} AND org_id = $${idx + 1} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/projects/:id
 * @desc Delete project and all associated tasks
 */
router.delete('/:id', auth, checkPermission('projects:manage'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Dependencies are handled by ON DELETE CASCADE in SQL if set up, 
    // otherwise manual deletion is needed. Let's ensure tasks are gone.
    // Only delete if it belongs to the org
    await db.query('DELETE FROM task_dependencies WHERE task_id IN (SELECT id FROM tasks WHERE project_id = $1 AND EXISTS (SELECT 1 FROM projects WHERE id = $1 AND org_id = $2))', [id, req.user.org_id]);
    await db.query('DELETE FROM tasks WHERE project_id = $1 AND EXISTS (SELECT 1 FROM projects WHERE id = $1 AND org_id = $2)', [id, req.user.org_id]);
    const result = await db.query('DELETE FROM projects WHERE id = $1 AND org_id = $2 RETURNING *', [id, req.user.org_id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project and all tasks deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
