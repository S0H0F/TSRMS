const jwt  = require('jsonwebtoken');
const { query } = require('../config/database');

/**
 * Verify JWT — attaches req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [rows] = await query(
      'SELECT id, email, first_name, last_name, role, status, verified FROM users WHERE id = ? AND status = "active"',
      [decoded.userId]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

/**
 * Require specific role(s)
 * Usage: requireRole('admin') or requireRole(['admin','staff'])
 */
const requireRole = (...roles) => {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowed.join(' or ')}`,
      });
    }
    next();
  };
};

/**
 * Optional auth — attaches req.user if token present, doesn't fail if not
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return next();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await query('SELECT id, email, first_name, last_name, role FROM users WHERE id = ?', [decoded.userId]);
    if (rows.length) req.user = rows[0];
  } catch (_) { /* ignore */ }
  next();
};

module.exports = { authenticate, requireRole, optionalAuth };
