const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { auth, checkPermission } = require('../middleware/authMiddleware');
const crypto = require('crypto');
const mailService = require('../services/mailService');
const authService = require('../services/authService');

/**
 * @route GET /api/users
 * @desc Get all users in the same organization
 */
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.status, u.created_at,
        json_agg(r.name) as roles
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.org_id = $1
       GROUP BY u.id
       ORDER BY u.name ASC`,
      [req.user.org_id]
    );

    const invitesResult = await db.query(
      `SELECT i.*, r.name as role_name 
       FROM invites i 
       JOIN roles r ON i.role_id = r.id 
       WHERE i.org_id = $1`,
      [req.user.org_id]
    );

    res.json({
      members: result.rows,
      invites: invitesResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/users/roles
 * @desc Get available roles for the organization
 */
router.get('/roles', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, key FROM roles WHERE org_id = $1 ORDER BY name ASC',
      [req.user.org_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/users/invite
 * @desc Invite a new user to the organization
 */
router.post('/invite', auth, checkPermission('team:manage'), async (req, res) => {
  try {
    const { email, roleKey } = req.body;

    if (!email || !roleKey) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    // 1. Check if user already exists as active member
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User is already a member of an organization' });
    }

    // 2. Check for existing pending invite and revoke it (per user request)
    await db.query('DELETE FROM invites WHERE email = $1 AND org_id = $2', [email.toLowerCase(), req.user.org_id]);

    // 2. Get role ID
    const roleResult = await db.query(
      'SELECT id FROM roles WHERE org_id = $1 AND key = $2',
      [req.user.org_id, roleKey]
    );
    if (roleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    const roleId = roleResult.rows[0].id;

    // 3. Create Invite
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48); // 48 hour expiry

    await db.query(
      `INSERT INTO invites (org_id, email, role_id, token, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.org_id, email.toLowerCase(), roleId, token, expiresAt]
    );

    // 4. Send Email (Dynamic discovery of base URL)
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    let baseUrl = process.env.FRONTEND_URL || `${protocol}://${host}`;
    
    // Localhost fallback: Redirect from backend port (5001) to frontend port (5173)
    if (baseUrl.includes('localhost:5001')) {
      baseUrl = baseUrl.replace('5001', '5173');
    }
    
    const inviteLink = `${baseUrl}/accept-invite?token=${token}`;
    
    await mailService.sendEmail({
      to: email,
      subject: `Invite to join ${req.user.org_name} on PlanAI`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>You're Invited!</h2>
          <p><strong>${req.user.name}</strong> has invited you to join the <strong>${req.user.org_name}</strong> organization on PlanAI.</p>
          <p>Click the button below to set up your account and get started:</p>
          <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
          <p style="margin-top: 20px; font-size: 12px; color: #666;">This link will expire in 48 hours.</p>
        </div>
      `
    });

    res.json({ message: 'Invitation sent successfully' });
  } catch (error) {
    console.error('Invite Error:', error);
    res.status(500).json({ error: 'Failed to send invite' });
  }
});

/**
 * @route DELETE /api/users/:userId
 * @desc Remove a user from the organization
 */
router.delete('/:userId', auth, checkPermission('team:manage'), async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent deleting self
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot remove yourself' });
    }

    const result = await db.query(
      'DELETE FROM users WHERE id = $1 AND org_id = $2 RETURNING *',
      [userId, req.user.org_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/users/invites/:inviteId
 * @desc Revoke a pending invitation
 */
router.delete('/invites/:inviteId', auth, checkPermission('team:manage'), async (req, res) => {
  try {
    const { inviteId } = req.params;
    const result = await db.query(
      'DELETE FROM invites WHERE id = $1 AND org_id = $2 RETURNING *',
      [inviteId, req.user.org_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    res.json({ message: 'Invitation revoked' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route PATCH /api/users/:userId/role
 * @desc Update a user's primary role
 */
router.patch('/:userId/role', auth, checkPermission('team:manage'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { userId } = req.params;
    const { roleId } = req.body;

    if (!roleId) return res.status(400).json({ error: 'roleId is required' });

    await client.query('BEGIN');

    // 1. Verify user belongs to org
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1 AND org_id = $2', [userId, req.user.org_id]);
    if (userCheck.rows.length === 0) throw new Error('User not found in organization');

    // 2. Verify role belongs to org
    const roleCheck = await client.query('SELECT id FROM roles WHERE id = $1 AND org_id = $2', [roleId, req.user.org_id]);
    if (roleCheck.rows.length === 0) throw new Error('Role not found in organization');

    // 3. Clear old roles (assuming single primary role for now as per user preference)
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);

    // 4. Insert new primary role
    await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleId]);

    await client.query('COMMIT');
    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});



/**
 * @route GET /api/users/invite/verify/:token
 * @desc Verify an invitation token is valid
 */
router.get('/invite/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const result = await db.query(
      `SELECT i.email, i.expires_at, o.name as org_name 
       FROM invites i 
       JOIN organizations o ON i.org_id = o.id 
       WHERE i.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation link is invalid.' });
    }

    const invite = result.rows[0];
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Invitation has expired. Please ask for a new one.' });
    }

    res.json({ email: invite.email, orgName: invite.org_name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/users/invite/accept
 * @desc Accept invitation and create user account
 */
router.post('/invite/accept', async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { token, name, password } = req.body;
    if (!token || !name || !password) {
      return res.status(400).json({ error: 'Name and password are required' });
    }

    await client.query('BEGIN');

    // 1. Verify token again
    const inviteRes = await client.query(
      `SELECT i.*, o.name as org_name FROM invites i 
       JOIN organizations o ON i.org_id = o.id 
       WHERE i.token = $1`,
      [token]
    );
    if (inviteRes.rows.length === 0) throw new Error('Invalid or expired invitation token');
    const invite = inviteRes.rows[0];

    if (new Date(invite.expires_at) < new Date()) throw new Error('Invitation has expired');

    // 2. Create User
    const authService = require('../services/authService');
    const hashedPassword = await authService.hashPassword(password);
    
    const userResult = await client.query(
      'INSERT INTO users (org_id, email, password_hash, name, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [invite.org_id, invite.email, hashedPassword, name, 'active']
    );
    const userId = userResult.rows[0].id;

    // 3. Assign Role
    await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, invite.role_id]);

    // 4. Cleanup Invite
    await client.query('DELETE FROM invites WHERE id = $1', [invite.id]);

    await client.query('COMMIT');

    // 5. Generate Token and Return User Info
    const loginInfo = await db.query(
      `SELECT u.id, u.name, u.email, u.org_id, o.name as org_name,
        json_agg(p.key) as permissions
       FROM users u
       JOIN organizations o ON u.org_id = o.id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.id = $1
       GROUP BY u.id, o.name`,
      [userId]
    );

    const user = loginInfo.rows[0];
    const authToken = authService.signToken({ id: user.id });

    res.json({
      token: authToken,
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
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * @route GET /api/users/permissions
 * @desc Get all available system permissions
 */
router.get('/permissions', auth, checkPermission('team:manage'), async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM permissions ORDER BY group_name, name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/users/roles/list
 * @desc Get detailed list of roles with their permissions
 */
router.get('/roles/list', auth, checkPermission('team:manage'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.id, r.name, r.key, r.is_default,
        json_agg(json_build_object('id', p.id, 'key', p.key, 'name', p.name)) as permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON r.id = rp.role_id
       LEFT JOIN permissions p ON rp.permission_id = p.id
       WHERE r.org_id = $1
       GROUP BY r.id
       ORDER BY r.name ASC`,
      [req.user.org_id]
    );

    res.json(result.rows.map(r => ({
      ...r,
      permissions: r.permissions?.[0]?.id === null ? [] : r.permissions
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/users/roles
 * @desc Create a new role with permissions
 */
router.post('/roles', auth, checkPermission('team:manage'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { name, permissionIds } = req.body;
    if (!name) return res.status(400).json({ error: 'Role name is required' });

    const key = name.toLowerCase().replace(/\s+/g, '_');

    await client.query('BEGIN');

    // 1. Create Role
    const roleRes = await client.query(
      'INSERT INTO roles (org_id, name, key) VALUES ($1, $2, $3) RETURNING id',
      [req.user.org_id, name, key]
    );
    const roleId = roleRes.rows[0].id;

    // 2. Link Permissions
    if (permissionIds && permissionIds.length > 0) {
      const fullAccessRes = await client.query("SELECT id FROM permissions WHERE key = '*'");
      const fullAccessId = fullAccessRes.rows[0]?.id;

      if (fullAccessId && permissionIds.includes(fullAccessId)) {
        await client.query(
          'INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions',
          [roleId]
        );
      } else {
        for (const pId of permissionIds) {
          await client.query(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
            [roleId, pId]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ id: roleId, name, key });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * @route PATCH /api/users/roles/:id
 * @desc Update role permissions
 */
router.patch('/roles/:id', auth, checkPermission('team:manage'), async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const { name, permissionIds } = req.body;

    await client.query('BEGIN');

    // Verify role belongs to org and is NOT protected
    const roleCheck = await client.query('SELECT key FROM roles WHERE id = $1 AND org_id = $2', [id, req.user.org_id]);
    if (roleCheck.rows.length === 0) throw new Error('Role not found or access denied');
    
    // Safety: Prevent editing admin role key or wildcard (optional requirement)
    // if (roleCheck.rows[0].key === 'admin') throw new Error('Cannot edit protected Admin role');

    // 1. Update Name if provided
    if (name) {
      await client.query('UPDATE roles SET name = $1 WHERE id = $2', [name, id]);
    }

    // 2. Sync Permissions
    if (permissionIds) {
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      
      const fullAccessRes = await client.query("SELECT id FROM permissions WHERE key = '*'");
      const fullAccessId = fullAccessRes.rows[0]?.id;

      if (fullAccessId && permissionIds.includes(fullAccessId)) {
        await client.query(
          'INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions',
          [id]
        );
      } else {
        for (const pId of permissionIds) {
          await client.query(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
            [id, pId]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Role updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * @route DELETE /api/users/roles/:id
 * @desc Delete a role if not in use
 */
router.delete('/roles/:id', auth, checkPermission('team:manage'), async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Check if role is in use
    const usageCheck = await db.query('SELECT 1 FROM user_roles WHERE role_id = $1 LIMIT 1', [id]);
    if (usageCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete role while it is assigned to team members.' });
    }

    // 2. Check if protected
    const roleCheck = await db.query('SELECT key FROM roles WHERE id = $1 AND org_id = $2', [id, req.user.org_id]);
    if (roleCheck.rows.length === 0) return res.status(404).json({ error: 'Role not found' });
    if (roleCheck.rows[0].key === 'admin') return res.status(400).json({ error: 'Protected system roles cannot be deleted.' });

    await db.query('DELETE FROM roles WHERE id = $1 AND org_id = $2', [id, req.user.org_id]);
    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
