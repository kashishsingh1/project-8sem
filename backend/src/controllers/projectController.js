const express = require('express');
const router = express.Router();
const db = require('../config/db');
const geminiService = require('../services/geminiService');

/**
 * @route GET /api/projects
 * @desc Get all projects
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM projects ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/projects
 * @desc Create new project and generate AI tasks
 */
router.post('/', async (req, res) => {
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
      'INSERT INTO projects (name, description, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, start_date, end_date]
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
router.patch('/:id', async (req, res) => {
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

    values.push(id);
    const result = await db.query(
      `UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
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
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Dependencies are handled by ON DELETE CASCADE in SQL if set up, 
    // otherwise manual deletion is needed. Let's ensure tasks are gone.
    await db.query('DELETE FROM task_dependencies WHERE task_id IN (SELECT id FROM tasks WHERE project_id = $1)', [id]);
    await db.query('DELETE FROM tasks WHERE project_id = $1', [id]);
    const result = await db.query('DELETE FROM projects WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project and all tasks deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
