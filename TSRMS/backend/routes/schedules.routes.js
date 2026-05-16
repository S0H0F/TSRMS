const router = require('express').Router();
const { body, param, query: qv } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const BASE_SELECT = `
  SELECT s.id, s.train_id, s.departure_time, s.arrival_time, s.travel_date,
         s.total_seats, s.available_seats, s.class, s.status, s.delay_minutes, s.notes,
         r.route_code, r.distance_km, r.duration_minutes,
         r.price_first_class, r.price_economy, r.price_student,
         st1.name_en AS from_name_en, st1.name_ar AS from_name_ar, st1.code AS from_code,
         st2.name_en AS to_name_en,   st2.name_ar AS to_name_ar,   st2.code AS to_code,
         s.created_at, s.updated_at
  FROM schedules s
  JOIN routes r   ON r.id = s.route_id
  JOIN stations st1 ON st1.id = r.from_station_id
  JOIN stations st2 ON st2.id = r.to_station_id
`;

// ── GET /api/schedules ────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  const { date, from, to, status, class: cls, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const where  = [];

  if (date)   { where.push('s.travel_date = ?');        params.push(date); }
  if (status) { where.push('s.status = ?');             params.push(status); }
  if (cls)    { where.push('s.class = ?');               params.push(cls); }
  if (from)   { where.push('(st1.code = ? OR st1.name_en LIKE ?)'); params.push(from, `%${from}%`); }
  if (to)     { where.push('(st2.code = ? OR st2.name_en LIKE ?)'); params.push(to,   `%${to}%`); }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await query(`${BASE_SELECT} ${whereClause} ORDER BY s.travel_date, s.departure_time LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
  const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM schedules s JOIN routes r ON r.id=s.route_id JOIN stations st1 ON st1.id=r.from_station_id JOIN stations st2 ON st2.id=r.to_station_id ${whereClause}`, params);

  res.json({ success: true, data: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
});

// ── GET /api/schedules/:id ────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  const [rows] = await query(`${BASE_SELECT} WHERE s.id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Schedule not found' });
  res.json({ success: true, data: rows[0] });
});

// ── POST /api/schedules ───────────────────────────────────────
router.post('/',
  authenticate, requireRole('admin', 'staff'),
  body('trainId').notEmpty(),
  body('routeId').isInt({ min: 1 }),
  body('departureTime').matches(/^\d{2}:\d{2}(:\d{2})?$/),
  body('arrivalTime').matches(/^\d{2}:\d{2}(:\d{2})?$/),
  body('travelDate').isDate(),
  body('totalSeats').isInt({ min: 1, max: 1000 }),
  body('class').isIn(['First Class', 'Economy', 'Student']),
  validate,
  async (req, res) => {
    const { trainId, routeId, departureTime, arrivalTime, travelDate, totalSeats, class: cls, status = 'scheduled', notes } = req.body;

    // Check route exists
    const [route] = await query('SELECT id FROM routes WHERE id = ? AND active = 1', [routeId]);
    if (!route.length) return res.status(400).json({ success: false, message: 'Route not found or inactive' });

    const [result] = await query(
      `INSERT INTO schedules (train_id, route_id, departure_time, arrival_time, travel_date, total_seats, available_seats, class, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [trainId, routeId, departureTime, arrivalTime, travelDate, totalSeats, totalSeats, cls, status, notes || null, req.user.id]
    );

    const [newSchedule] = await query(`${BASE_SELECT} WHERE s.id = ?`, [result.insertId]);
    res.status(201).json({ success: true, message: 'Schedule created', data: newSchedule[0] });
  }
);

// ── PUT /api/schedules/:id ────────────────────────────────────
router.put('/:id',
  authenticate, requireRole('admin', 'staff'),
  body('status').optional().isIn(['scheduled', 'active', 'delayed', 'cancelled']),
  validate,
  async (req, res) => {
    const { trainId, departureTime, arrivalTime, travelDate, totalSeats, class: cls, status, delayMinutes, notes } = req.body;
    const [existing] = await query('SELECT * FROM schedules WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, message: 'Schedule not found' });

    const s = existing[0];
    await query(
      `UPDATE schedules SET train_id=?, departure_time=?, arrival_time=?, travel_date=?,
       total_seats=?, class=?, status=?, delay_minutes=?, notes=? WHERE id=?`,
      [
        trainId        || s.train_id,
        departureTime  || s.departure_time,
        arrivalTime    || s.arrival_time,
        travelDate     || s.travel_date,
        totalSeats     || s.total_seats,
        cls            || s.class,
        status         || s.status,
        delayMinutes   !== undefined ? delayMinutes : s.delay_minutes,
        notes          !== undefined ? notes : s.notes,
        req.params.id,
      ]
    );

    const [updated] = await query(`${BASE_SELECT} WHERE s.id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Schedule updated', data: updated[0] });
  }
);

// ── DELETE /api/schedules/:id ─────────────────────────────────
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const [rows] = await query('SELECT id FROM schedules WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Schedule not found' });

  const [bookings] = await query('SELECT COUNT(*) AS c FROM bookings WHERE schedule_id = ? AND booking_status NOT IN ("cancelled")', [req.params.id]);
  if (bookings[0].c > 0) return res.status(409).json({ success: false, message: 'Cannot delete schedule with active bookings. Cancel or reassign first.' });

  await query('DELETE FROM schedules WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'Schedule deleted' });
});

// ── GET /api/schedules/:id/seats ──────────────────────────────
router.get('/:id/seats', authenticate, async (req, res) => {
  const [schedule] = await query('SELECT id, total_seats FROM schedules WHERE id = ?', [req.params.id]);
  if (!schedule.length) return res.status(404).json({ success: false, message: 'Schedule not found' });

  const [bookedSeats] = await query(
    'SELECT seat_number FROM bookings WHERE schedule_id = ? AND booking_status IN ("confirmed","pending")',
    [req.params.id]
  );

  const taken = new Set(bookedSeats.map(b => b.seat_number));
  const total = schedule[0].total_seats;
  const seats = [];

  for (let i = 1; i <= total; i++) {
    const seatId = `${Math.floor((i - 1) / 4) + 1}${String.fromCharCode(65 + ((i - 1) % 4))}`;
    seats.push({ id: seatId, status: taken.has(seatId) ? 'taken' : 'available' });
  }

  res.json({ success: true, data: { total, available: total - taken.size, seats } });
});

module.exports = router;
