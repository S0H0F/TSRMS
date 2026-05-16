const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { body } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const USER_SELECT = `
  SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.national_id,
         u.role, u.status, u.verified, u.auth_method, u.last_login, u.created_at,
         p.can_schedules, p.can_bookings, p.can_routes, p.can_users, p.can_reports, p.can_pricing,
         (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id AND b.booking_status != 'cancelled') AS total_bookings,
         (SELECT COALESCE(SUM(b.amount_paid),0) FROM bookings b WHERE b.user_id = u.id AND b.payment_status = 'paid') AS total_spent
  FROM users u
  LEFT JOIN user_permissions p ON p.user_id = u.id
`;

// ── GET /api/users ────────────────────────────────────────────
router.get('/', authenticate, requireRole('admin'), async (req, res) => {
  const { role, status, verified, search, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = []; const where = [];

  if (role)     { where.push('u.role = ?');     params.push(role); }
  if (status)   { where.push('u.status = ?');   params.push(status); }
  if (verified !== undefined) { where.push('u.verified = ?'); params.push(verified === 'true' ? 1 : 0); }
  if (search)   {
    where.push('(u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.national_id LIKE ? OR u.phone LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }

  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await query(`${USER_SELECT} ${w} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
  const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM users u ${w}`, params);

  res.json({ success: true, data: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
});

// ── GET /api/users/:id ────────────────────────────────────────
router.get('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const [rows] = await query(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: rows[0] });
});

// ── POST /api/users ───────────────────────────────────────────
router.post('/',
  authenticate, requireRole('admin'),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').notEmpty().isLength({ max: 100 }),
  body('lastName').notEmpty().isLength({ max: 100 }),
  body('role').isIn(['admin', 'staff', 'passenger']),
  body('phone').optional().isMobilePhone('any'),
  body('nationalId').optional().isLength({ min: 10, max: 10 }),
  validate,
  async (req, res) => {
    const { email, password, firstName, lastName, phone, nationalId, role, status = 'active', permissions = {} } = req.body;

    const [exists] = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length) return res.status(409).json({ success: false, message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, national_id, role, status, verified, auth_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'email')`,
      [email, hash, firstName, lastName, phone || null, nationalId || null, role, status]
    );

    await query(
      `INSERT INTO user_permissions (user_id, can_schedules, can_bookings, can_routes, can_users, can_reports, can_pricing)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [result.insertId,
        permissions.canSchedules ? 1 : 0,
        permissions.canBookings  ? 1 : 0,
        permissions.canRoutes    ? 1 : 0,
        permissions.canUsers     ? 1 : 0,
        permissions.canReports   ? 1 : 0,
        permissions.canPricing   ? 1 : 0,
      ]
    );

    const [newUser] = await query(`${USER_SELECT} WHERE u.id = ?`, [result.insertId]);
    res.status(201).json({ success: true, message: 'User created', data: newUser[0] });
  }
);

// ── PUT /api/users/:id ────────────────────────────────────────
router.put('/:id',
  authenticate, requireRole('admin'),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().isIn(['admin', 'staff', 'passenger']),
  body('status').optional().isIn(['active', 'inactive', 'pending']),
  validate,
  async (req, res) => {
    const [existing] = await query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'User not found' });

    const u = existing[0];
    const { firstName, lastName, email, phone, nationalId, role, status, verified, password, permissions } = req.body;

    let hash = u.password_hash;
    if (password) hash = await bcrypt.hash(password, 12);

    await query(
      `UPDATE users SET first_name=?, last_name=?, email=?, phone=?, national_id=?,
       role=?, status=?, verified=?, password_hash=? WHERE id=?`,
      [firstName || u.first_name, lastName || u.last_name, email || u.email,
       phone !== undefined ? phone : u.phone, nationalId !== undefined ? nationalId : u.national_id,
       role || u.role, status || u.status, verified !== undefined ? (verified ? 1 : 0) : u.verified,
       hash, req.params.id]
    );

    if (permissions) {
      await query(
        `INSERT INTO user_permissions (user_id, can_schedules, can_bookings, can_routes, can_users, can_reports, can_pricing)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE can_schedules=VALUES(can_schedules), can_bookings=VALUES(can_bookings),
         can_routes=VALUES(can_routes), can_users=VALUES(can_users), can_reports=VALUES(can_reports), can_pricing=VALUES(can_pricing)`,
        [req.params.id,
          permissions.canSchedules ? 1 : 0, permissions.canBookings ? 1 : 0,
          permissions.canRoutes ? 1 : 0, permissions.canUsers ? 1 : 0,
          permissions.canReports ? 1 : 0, permissions.canPricing ? 1 : 0]
      );
    }

    const [updated] = await query(`${USER_SELECT} WHERE u.id = ?`, [req.params.id]);
    res.json({ success: true, message: 'User updated', data: updated[0] });
  }
);

// ── DELETE /api/users/:id ─────────────────────────────────────
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
  }
  const [rows] = await query('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });

  await query('UPDATE users SET status = "inactive" WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'User deactivated' });
});

module.exports = router;
