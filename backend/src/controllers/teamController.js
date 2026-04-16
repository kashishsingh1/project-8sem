const express = require('express');
const router = express.Router();
const db = require('../config/db');
const resourceService = require('../services/resourceService');
const geminiService = require('../services/geminiService');

/**
 * @route GET /api/team
 * @desc Get all team members and their current workload
 */
router.get('/', async (req, res) => {
  try {
    const team = await resourceService.getTeamWorkload();
    res.json(team);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/team/:memberId/tasks
 * @desc Get all tasks assigned to a team member (across all projects)
 */
router.get('/:memberId/tasks', async (req, res) => {
  try {
    const { memberId } = req.params;
    const tasks = await resourceService.getTasksByMember(memberId);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/team/assign
 * @desc Assign a task to a team member
 */
router.post('/assign', async (req, res) => {
  try {
    const { taskId, memberId } = req.body;
    if (!taskId || !memberId) {
      return res.status(400).json({ error: 'taskId and memberId are required' });
    }
    const result = await resourceService.assignTask(taskId, memberId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/team/suggest
 * @desc AI suggests optimal team allocation for unassigned tasks
 */
router.post('/suggest', async (req, res) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    // Get unassigned tasks
    const tasksResult = await db.query('SELECT id, title, description, estimated_hours FROM tasks WHERE project_id = $1 AND assigned_to IS NULL', [projectId]);
    if (tasksResult.rows.length === 0) return res.json({ suggestions: [] });
    
    // Get team
    const team = await resourceService.getTeamWorkload();
    
    const prompt = `Act as an expert Resource Manager for a software company.
I have unassigned tasks and a team with varying roles, skills, and workloads.

Unassigned Tasks:
${JSON.stringify(tasksResult.rows, null, 2)}

Team Members (each has a role, skills array, current_workload_hours, and availability_hours):
${JSON.stringify(team, null, 2)}

Assignment Rules (apply in priority order):
1. **Role Match**: First, consider the member's "role" (e.g., "Fullstack Developer", "UI/UX Designer", "DevOps Engineer"). A task about frontend UI should go to a Designer or Frontend Developer, a backend API task to a Backend/Fullstack Developer, etc.
2. **Skills Match**: Among role-matched candidates, prefer the member whose "skills" array best matches the task title and description keywords.
3. **Capacity Check**: Never assign a task if doing so would overload the member (current_workload_hours + estimated_hours > availability_hours). Skip overloaded members.
4. **Load Balancing**: When multiple members are equally qualified, prefer the one with the lowest current_workload_hours to distribute work evenly.

Return ONLY a valid JSON array of objects:
[{ "taskId": "UUID", "suggestedMemberId": "UUID", "reason": "Short explanation mentioning role and skill match" }]

Do not include any text outside the JSON array.`;

    const suggestions = await geminiService.generatePlan(prompt); // Reusing generatePlan as it expects JSON
    res.json({ suggestions: Array.isArray(suggestions) ? suggestions : [] });
  } catch (error) {
    console.error('AI Suggest Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/team
 * @desc Create a new team member
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, role, availability_hours, skills } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

    const result = await db.query(
      'INSERT INTO team_members (name, email, role, availability_hours) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, role || 'developer', availability_hours || 40]
    );
    const member = result.rows[0];

    if (skills && Array.isArray(skills)) {
      await resourceService.upsertMemberSkills(member.id, skills);
    }

    res.status(201).json(member);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route PATCH /api/team/:id
 * @desc Update team member details
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, availability_hours, skills } = req.body;
    
    const fields = [];
    const values = [];
    let idx = 1;

    if (name) { fields.push(`name = $${idx++}`); values.push(name); }
    if (email) { fields.push(`email = $${idx++}`); values.push(email); }
    if (role) { fields.push(`role = $${idx++}`); values.push(role); }
    if (availability_hours !== undefined) { fields.push(`availability_hours = $${idx++}`); values.push(availability_hours); }

    let member;
    if (fields.length > 0) {
      values.push(id);
      const result = await db.query(
        `UPDATE team_members SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );
      member = result.rows[0];
    } else {
      const result = await db.query('SELECT * FROM team_members WHERE id = $1', [id]);
      member = result.rows[0];
    }

    if (!member) return res.status(404).json({ error: 'Member not found' });

    if (skills && Array.isArray(skills)) {
      await resourceService.upsertMemberSkills(id, skills);
    }

    res.json(member);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/team/roles
 * @desc Get all available team roles
 */
router.get('/roles', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM team_roles ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/team/roles
 * @desc Create a new team role
 */
router.post('/roles', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Role name is required' });

    const result = await db.query(
      'INSERT INTO team_roles (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route PATCH /api/team/roles/:id
 * @desc Update a team role name and sync with members
 */
router.patch('/roles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Role name is required' });

    // 1. Get old name
    const oldRoleResult = await db.query('SELECT name FROM team_roles WHERE id = $1', [id]);
    if (oldRoleResult.rows.length === 0) return res.status(404).json({ error: 'Role not found' });
    const oldName = oldRoleResult.rows[0].name;

    // 2. Update role name
    const result = await db.query(
      'UPDATE team_roles SET name = $1 WHERE id = $2 RETURNING *',
      [name, id]
    );

    // 3. Sync with members
    await db.query('UPDATE team_members SET role = $1 WHERE role = $2', [name, oldName]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/team/roles/:id
 * @desc Delete a team role
 */
router.delete('/roles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM team_roles WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Role not found' });
    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/team/:id
 * @desc Delete a team member
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Unassign tasks first
    await db.query('UPDATE tasks SET assigned_to = NULL WHERE assigned_to = $1', [id]);
    await db.query('DELETE FROM member_skills WHERE member_id = $1', [id]);
    const result = await db.query('DELETE FROM team_members WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Member not found' });
    res.json({ message: 'Team member removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
