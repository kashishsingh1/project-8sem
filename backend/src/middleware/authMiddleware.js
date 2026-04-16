const authService = require('../services/authService');
const db = require('../config/db');

/**
 * Authentication Middleware
 * Validates JWT, fetches user, org, and permissions.
 */
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = authService.verifyToken(token);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Fetch user with org and permissions
    const userResult = await db.query(
      `SELECT u.id, u.name, u.email, u.org_id, o.name as org_name,
        json_agg(p.key) as permissions
       FROM users u
       JOIN organizations o ON u.org_id = o.id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.id = $1
       GROUP BY u.id, o.name`,
      [decoded.id]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Attach to request
    req.user = {
      ...user,
      permissions: user.permissions?.[0] === null ? [] : user.permissions
    };
    
    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error);
    res.status(401).json({ error: 'Please authenticate' });
  }
};

/**
 * Permission check middleware
 */
const checkPermission = (permissionKey) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const hasPermission = req.user.permissions.includes(permissionKey) || 
                          req.user.permissions.includes('*'); // Support wildcard for admins

    if (!hasPermission) {
      return res.status(403).json({ error: `Forbidden: Missing permission ${permissionKey}` });
    }

    next();
  };
};

module.exports = { auth, checkPermission };
