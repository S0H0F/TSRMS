const router = require('express').Router();
const { query } = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

// ── GET /api/dashboard/overview ───────────────────────────────
router.get('/overview', authenticate, requireRole('admin', 'staff'), async (req, res) => {
  const [[todayStats]] = await query(`
    SELECT
      COUNT(DISTINCT s.id)                                                       AS trips_today,
      COALESCE(SUM(CASE WHEN s.status='active' THEN 1 ELSE 0 END),0)            AS on_time,
      COALESCE(SUM(CASE WHEN s.status='delayed' THEN 1 ELSE 0 END),0)           AS delayed,
      COALESCE(SUM(CASE WHEN s.status='cancelled' THEN 1 ELSE 0 END),0)         AS cancelled,
      COALESCE(SUM(s.total_seats - s.available_seats),0)                        AS total_occupied,
      COALESCE(SUM(s.total_seats),0)                                             AS total_capacity
    FROM schedules s WHERE s.travel_date = CURDATE()
  `);

  const [[revenueStats]] = await query(`
    SELECT
      COALESCE(SUM(CASE WHEN DATE(b.created_at)=CURDATE() THEN b.amount_paid ELSE 0 END),0)  AS revenue_today,
      COALESCE(SUM(CASE WHEN MONTH(b.created_at)=MONTH(NOW()) THEN b.amount_paid ELSE 0 END),0) AS revenue_month,
      COUNT(CASE WHEN b.booking_status='confirmed' THEN 1 END)                               AS active_bookings,
      COUNT(CASE WHEN DATE(b.created_at)=CURDATE() THEN 1 END)                               AS bookings_today
    FROM bookings b WHERE b.payment_status='paid'
  `);

  const [[userStats]] = await query(`
    SELECT
      COUNT(*)                                                              AS total_users,
      COUNT(CASE WHEN role='passenger' THEN 1 END)                         AS passengers,
      COUNT(CASE WHEN role='staff' THEN 1 END)                             AS staff,
      COUNT(CASE WHEN role='admin' THEN 1 END)                             AS admins,
      COUNT(CASE WHEN DATE(created_at)=CURDATE() THEN 1 END)               AS new_today
    FROM users WHERE status='active'
  `);

  const occupancyPct = todayStats.total_capacity > 0
    ? ((todayStats.total_occupied / todayStats.total_capacity) * 100).toFixed(1)
    : 0;

  res.json({
    success: true,
    data: {
      trips:     { today: todayStats.trips_today, onTime: todayStats.on_time, delayed: todayStats.delayed, cancelled: todayStats.cancelled },
      occupancy: { pct: parseFloat(occupancyPct), occupied: todayStats.total_occupied, capacity: todayStats.total_capacity },
      revenue:   { today: revenueStats.revenue_today, month: revenueStats.revenue_month },
      bookings:  { active: revenueStats.active_bookings, today: revenueStats.bookings_today },
      users:     userStats,
    },
  });
});

// ── GET /api/dashboard/revenue-trend ─────────────────────────
router.get('/revenue-trend', authenticate, requireRole('admin'), async (req, res) => {
  const { days = 7 } = req.query;
  const [rows] = await query(`
    SELECT
      DATE(b.created_at)         AS report_date,
      COUNT(*)                   AS bookings,
      COALESCE(SUM(b.amount_paid),0) AS revenue
    FROM bookings b
    WHERE b.payment_status = 'paid'
      AND b.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    GROUP BY DATE(b.created_at)
    ORDER BY report_date ASC
  `, [parseInt(days)]);
  res.json({ success: true, data: rows });
});

// ── GET /api/dashboard/route-performance ─────────────────────
router.get('/route-performance', authenticate, requireRole('admin', 'staff'), async (req, res) => {
  const [rows] = await query(`
    SELECT
      r.route_code,
      st1.name_en AS from_en, st2.name_en AS to_en,
      COUNT(DISTINCT s.id)                                    AS total_trips,
      COUNT(b.id)                                             AS total_passengers,
      COALESCE(SUM(b.amount_paid),0)                         AS total_revenue,
      ROUND(AVG(
        (s.total_seats - s.available_seats) / s.total_seats * 100
      ),1)                                                    AS avg_load_pct
    FROM routes r
    JOIN stations st1 ON st1.id = r.from_station_id
    JOIN stations st2 ON st2.id = r.to_station_id
    LEFT JOIN schedules s  ON s.route_id  = r.id
    LEFT JOIN bookings  b  ON b.schedule_id = s.id AND b.booking_status IN ('confirmed','completed')
    GROUP BY r.id
    ORDER BY total_revenue DESC
  `);
  res.json({ success: true, data: rows });
});

// ── GET /api/dashboard/occupancy-live ────────────────────────
router.get('/occupancy-live', authenticate, requireRole('admin', 'staff'), async (req, res) => {
  const [rows] = await query(`
    SELECT
      s.id, s.train_id, s.departure_time, s.arrival_time, s.status, s.class,
      s.total_seats, s.available_seats,
      (s.total_seats - s.available_seats)                      AS occupied,
      ROUND((s.total_seats - s.available_seats) / s.total_seats * 100, 1) AS occupancy_pct,
      st1.name_en AS from_en, st1.name_ar AS from_ar,
      st2.name_en AS to_en,   st2.name_ar AS to_ar
    FROM schedules s
    JOIN routes r     ON r.id   = s.route_id
    JOIN stations st1 ON st1.id = r.from_station_id
    JOIN stations st2 ON st2.id = r.to_station_id
    WHERE s.travel_date = CURDATE()
    ORDER BY s.departure_time
  `);
  res.json({ success: true, data: rows });
});

// ── GET /api/dashboard/top-stations ──────────────────────────
router.get('/top-stations', authenticate, requireRole('admin'), async (req, res) => {
  const [rows] = await query(`
    SELECT st.code, st.name_en, st.name_ar, COUNT(b.id) AS total_passengers
    FROM stations st
    JOIN routes r ON r.from_station_id = st.id OR r.to_station_id = st.id
    JOIN schedules s ON s.route_id = r.id
    JOIN bookings b ON b.schedule_id = s.id AND b.booking_status IN ('confirmed','completed')
    GROUP BY st.id
    ORDER BY total_passengers DESC
    LIMIT 10
  `);
  res.json({ success: true, data: rows });
});

module.exports = router;
