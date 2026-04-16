const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authService = require('../services/authService');
const { auth } = require('../middleware/authMiddleware');

/**
 * @route POST /api/auth/signup
 * @desc Create a new organization and the first owner user
 */
router.post('/signup', async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { orgName, name, email, password } = req.body;

    if (!orgName || !name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    await client.query('BEGIN');

    // 1. Create Organization
    const orgResult = await client.query(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
      [orgName]
    );
    const orgId = orgResult.rows[0].id;

    // 2. Create Admin Role for this Org
    const roleResult = await client.query(
      "INSERT INTO roles (org_id, name, key) VALUES ($1, 'Organization Manager', 'admin') RETURNING id",
      [orgId]
    );
    const roleId = roleResult.rows[0].id;

    // 3. Grant all permissions to this role
    await client.query(
      'INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions',
      [roleId]
    );

    // 4. Create User
    const hashedPassword = await authService.hashPassword(password);
    const userResult = await client.query(
      'INSERT INTO users (org_id, email, password_hash, name) VALUES ($1, $2, $3, $4) RETURNING id',
      [orgId, email.toLowerCase(), hashedPassword, name]
    );
    const userId = userResult.rows[0].id;

    // 5. Assign Role to User
    await client.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
      [userId, roleId]
    );

    await client.query('COMMIT');

    const token = authService.signToken({ id: userId });
    res.status(201).json({
      token,
      user: { 
        id: userId, 
        name, 
        email, 
        org_id: orgId, 
        org_name: orgName,
        permissions: ['*'] // New owners get full permissions immediately
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Signup Error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create account' });
  } finally {
    client.release();
  }
});

/**
 * @route POST /api/auth/login
 * @desc Authenticate user and return token
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Fetch user with org and permissions (Consistent with middleware)
    const loginResult = await db.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.org_id, o.name as org_name,
        json_agg(p.key) as permissions
       FROM users u
       JOIN organizations o ON u.org_id = o.id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.email = $1
       GROUP BY u.id, o.name`,
      [email.toLowerCase()]
    );

    const user = loginResult.rows[0];
    if (!user || !(await authService.comparePassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = authService.signToken({ id: user.id });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        org_id: user.org_id,
        org_name: user.org_name,
        permissions: user.permissions?.[0] === null ? [] : user.permissions
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current user profile
 */
router.get('/me', auth, (req, res) => {
  res.json(req.user);
});

/**
 * @route POST /api/auth/internal/migrate
 * @desc TEMPORARY: Migrate all existing data to Demo Org
 */
router.post('/internal/migrate', async (req, res) => {
  try {
    const orgRes = await db.query("SELECT id FROM organizations WHERE name = 'Demo Solutions Inc.' LIMIT 1");
    if (orgRes.rows.length === 0) return res.status(404).json({ error: 'Demo Org not found' });
    const orgId = orgRes.rows[0].id;

    const userRes = await db.query("SELECT id FROM users WHERE email = 'admin@demo.com' LIMIT 1");
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'Admin user not found' });
    const adminId = userRes.rows[0].id;

    // 1. Ensure org_id exists (Harden schema)
    await db.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)');
    await db.query('ALTER TABLE team_members ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)');
    await db.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)');
    await db.query('ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)');
    await db.query('ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id)');

    // 2. Bulk Update
    await db.query('UPDATE projects SET org_id = $1, owner_id = $2 WHERE org_id IS NULL OR owner_id IS NULL', [orgId, adminId]);
    await db.query('UPDATE tasks SET org_id = $1 WHERE org_id IS NULL', [orgId]);
    await db.query('UPDATE team_members SET org_id = $1 WHERE org_id IS NULL', [orgId]);
    await db.query('UPDATE chat_sessions SET org_id = $1 WHERE org_id IS NULL', [orgId]);
    await db.query('UPDATE generated_reports SET org_id = $1 WHERE org_id IS NULL', [orgId]);

    res.json({ message: 'Migration completed', orgId, adminId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
