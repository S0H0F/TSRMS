const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body } = require('express-validator');
const { query, beginTransaction, commitTransaction, rollbackTransaction } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const logger = require('../config/logger');

// ── Helpers ──────────────────────────────────────────────────
function signAccessToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}
function signRefreshToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
}

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['admin', 'staff', 'passenger']),
  validate,
  async (req, res) => {
    const { email, password, role } = req.body;

    const [rows] = await query(
      'SELECT id, email, password_hash, first_name, last_name, phone, role, status, verified FROM users WHERE email = ?',
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = rows[0];

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is inactive. Contact support.' });
    }

    if (user.role !== role) {
      return res.status(403).json({ success: false, message: `This account is not registered as ${role}` });
    }

    const valid = await bcrypt.compare(password, user.password_hash || '');
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const accessToken  = signAccessToken(user.id, user.role);
    const refreshToken = signRefreshToken(user.id);

    // Store refresh token
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, refreshToken, expiresAt]
    );

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    logger.info(`Login: ${email} (${role})`);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id:         user.id,
        email:      user.email,
        firstName:  user.first_name,
        lastName:   user.last_name,
        phone:      user.phone,
        role:       user.role,
        verified:   Boolean(user.verified),
      },
    });
  }
);

// ── POST /api/auth/nafath ─────────────────────────────────────
router.post('/nafath',
  body('nationalId').isLength({ min: 10, max: 10 }).isNumeric(),
  body('role').isIn(['admin', 'staff', 'passenger']),
  validate,
  async (req, res) => {
    const { nationalId, role } = req.body;

    // In production, call real Nafath API here
    // const nafathResult = await callNafathAPI(nationalId);

    // Find or create user by national_id
    let [rows] = await query(
      'SELECT id, email, first_name, last_name, phone, role, status, verified FROM users WHERE national_id = ?',
      [nationalId]
    );

    let user;
    if (!rows.length) {
      // Auto-register passenger via Nafath
      const [result] = await query(
        `INSERT INTO users (email, first_name, last_name, national_id, role, status, verified, auth_method)
         VALUES (?, ?, ?, ?, 'passenger', 'active', 1, 'nafath')`,
        [`${nationalId}@nafath.sa`, 'Nafath', 'User', nationalId]
      );
      const [newRows] = await query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      user = newRows[0];
      await query(
        'INSERT INTO user_permissions (user_id, can_bookings) VALUES (?, 1)',
        [user.id]
      );
    } else {
      user = rows[0];
    }

    if (user.role !== role && role !== 'passenger') {
      return res.status(403).json({ success: false, message: 'Role mismatch' });
    }

    const accessToken  = signAccessToken(user.id, user.role);
    const refreshToken = signRefreshToken(user.id);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, refreshToken, expiresAt]);
    await query('UPDATE users SET last_login = NOW(), verified = 1 WHERE id = ?', [user.id]);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id:         user.id,
        email:      user.email,
        firstName:  user.first_name,
        lastName:   user.last_name,
        phone:      user.phone,
        role:       user.role,
        verified:   true,
        nationalId,
      },
    });
  }
);

// ── POST /api/auth/refresh ────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token required' });

  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );

    const [rows] = await query(
      'SELECT * FROM refresh_tokens WHERE token = ? AND user_id = ? AND expires_at > NOW()',
      [refreshToken, decoded.userId]
    );
    if (!rows.length) return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });

    const [users] = await query('SELECT id, role FROM users WHERE id = ? AND status = "active"', [decoded.userId]);
    if (!users.length) return res.status(401).json({ success: false, message: 'User not found' });

    const newAccessToken = signAccessToken(users[0].id, users[0].role);
    res.json({ success: true, accessToken: newAccessToken });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await query('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
  }
  res.json({ success: true, message: 'Logged out' });
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  const [rows] = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.national_id,
            u.role, u.status, u.verified, u.last_login, u.created_at,
            p.can_schedules, p.can_bookings, p.can_routes, p.can_users, p.can_reports, p.can_pricing
     FROM users u
     LEFT JOIN user_permissions p ON p.user_id = u.id
     WHERE u.id = ?`,
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user: rows[0] });
});

// ── PUT /api/auth/change-password ────────────────────────────
router.put('/change-password',
  authenticate,
  body('currentPassword').isLength({ min: 6 }),
  body('newPassword').isLength({ min: 6 }),
  validate,
  async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const [rows] = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash || '');
    if (!valid) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ success: true, message: 'Password changed successfully' });
  }
);

module.exports = router;
