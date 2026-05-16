const router = require('express').Router();
const { body } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const ROUTE_SELECT = `
  SELECT r.id, r.route_code, r.distance_km, r.duration_minutes,
         r.price_first_class, r.price_economy, r.price_student, r.active,
         r.created_at, r.updated_at,
         st1.id AS from_id, st1.code AS from_code, st1.name_en AS from_en, st1.name_ar AS from_ar, st1.city_en AS from_city_en, st1.city_ar AS from_city_ar,
         st2.id AS to_id,   st2.code AS to_code,   st2.name_en AS to_en,   st2.name_ar AS to_ar,   st2.city_en AS to_city_en,   st2.city_ar AS to_city_ar,
         (SELECT COUNT(*) FROM schedules s WHERE s.route_id = r.id AND s.travel_date >= CURDATE()) AS upcoming_trips,
         (SELECT COUNT(*) FROM schedules s JOIN bookings b ON b.schedule_id = s.id WHERE s.route_id = r.id AND b.booking_status = 'confirmed') AS total_bookings
  FROM routes r
  JOIN stations st1 ON st1.id = r.from_station_id
  JOIN stations st2 ON st2.id = r.to_station_id
`;

// ── GET /api/routes ───────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  const { active } = req.query;
  const where  = active !== undefined ? `WHERE r.active = ${active === 'true' ? 1 : 0}` : '';
  const [rows] = await query(`${ROUTE_SELECT} ${where} ORDER BY r.route_code`);
  res.json({ success: true, data: rows });
});

// ── GET /api/routes/:id ───────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  const [rows] = await query(`${ROUTE_SELECT} WHERE r.id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Route not found' });
  res.json({ success: true, data: rows[0] });
});

// ── POST /api/routes ──────────────────────────────────────────
router.post('/',
  authenticate, requireRole('admin'),
  body('routeCode').notEmpty().isLength({ max: 20 }),
  body('fromStationId').isInt({ min: 1 }),
  body('toStationId').isInt({ min: 1 }),
  body('distanceKm').isFloat({ min: 1 }),
  body('durationMinutes').isInt({ min: 1 }),
  body('priceFirstClass').isFloat({ min: 0 }),
  body('priceEconomy').isFloat({ min: 0 }),
  body('priceStudent').isFloat({ min: 0 }),
  validate,
  async (req, res) => {
    const { routeCode, fromStationId, toStationId, distanceKm, durationMinutes, priceFirstClass, priceEconomy, priceStudent } = req.body;

    if (fromStationId === toStationId) return res.status(400).json({ success: false, message: 'From and To stations must be different' });

    const [exists] = await query('SELECT id FROM routes WHERE route_code = ?', [routeCode]);
    if (exists.length) return res.status(409).json({ success: false, message: 'Route code already exists' });

    const [result] = await query(
      `INSERT INTO routes (route_code, from_station_id, to_station_id, distance_km, duration_minutes, price_first_class, price_economy, price_student, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [routeCode, fromStationId, toStationId, distanceKm, durationMinutes, priceFirstClass, priceEconomy, priceStudent, req.user.id]
    );

    const [newRoute] = await query(`${ROUTE_SELECT} WHERE r.id = ?`, [result.insertId]);
    res.status(201).json({ success: true, message: 'Route created', data: newRoute[0] });
  }
);

// ── PUT /api/routes/:id ───────────────────────────────────────
router.put('/:id',
  authenticate, requireRole('admin'),
  body('priceFirstClass').optional().isFloat({ min: 0 }),
  body('priceEconomy').optional().isFloat({ min: 0 }),
  body('priceStudent').optional().isFloat({ min: 0 }),
  validate,
  async (req, res) => {
    const [existing] = await query('SELECT * FROM routes WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Route not found' });

    const r = existing[0];
    const { distanceKm, durationMinutes, priceFirstClass, priceEconomy, priceStudent, active } = req.body;

    await query(
      `UPDATE routes SET distance_km=?, duration_minutes=?, price_first_class=?, price_economy=?, price_student=?, active=? WHERE id=?`,
      [
        distanceKm     || r.distance_km,
        durationMinutes|| r.duration_minutes,
        priceFirstClass!== undefined ? priceFirstClass : r.price_first_class,
        priceEconomy   !== undefined ? priceEconomy    : r.price_economy,
        priceStudent   !== undefined ? priceStudent     : r.price_student,
        active         !== undefined ? (active ? 1 : 0) : r.active,
        req.params.id,
      ]
    );

    const [updated] = await query(`${ROUTE_SELECT} WHERE r.id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Route updated', data: updated[0] });
  }
);

// ── DELETE /api/routes/:id ────────────────────────────────────
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const [rows] = await query('SELECT id FROM routes WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Route not found' });

  const [schedules] = await query('SELECT COUNT(*) AS c FROM schedules WHERE route_id = ? AND travel_date >= CURDATE()', [req.params.id]);
  if (schedules[0].c > 0) return res.status(409).json({ success: false, message: 'Cannot delete route with upcoming schedules' });

  await query('UPDATE routes SET active = 0 WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'Route deactivated' });
});

// ── GET /api/routes/stations/all ──────────────────────────────
router.get('/stations/all', authenticate, async (req, res) => {
  const [rows] = await query('SELECT * FROM stations WHERE active = 1 ORDER BY name_en');
  res.json({ success: true, data: rows });
});

module.exports = router;
