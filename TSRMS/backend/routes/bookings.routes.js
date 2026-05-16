const router   = require('express').Router();
const { body } = require('express-validator');
const QRCode   = require('qrcode');
const { query, beginTransaction, commitTransaction, rollbackTransaction } = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const notificationService = require('../services/notification.service');
const logger = require('../config/logger');

function genBookingRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'BK-';
  for (let i = 0; i < 5; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

function genQrRef() {
  const ts = Date.now().toString(36).toUpperCase();
  return `RWSA-${ts}`;
}

async function generateQRCode(bookingRef, trainId, fromCode, toCode, date, seat, passengerName) {
  const qrData = `RWSA|${bookingRef}|${trainId}|${fromCode}-${toCode}|${date}|${seat}|${passengerName}`;
  return await QRCode.toDataURL(qrData, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    width: 300,
    margin: 2,
    color: { dark: '#006633', light: '#FFFFFF' },
  });
}

// ── GET /api/bookings ─────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  const { page = 1, limit = 20, status, from, to, date } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const where  = [];

  // Passengers only see their own bookings
  if (req.user.role === 'passenger') {
    where.push('b.user_id = ?');
    params.push(req.user.id);
  }

  if (status) { where.push('b.booking_status = ?'); params.push(status); }
  if (date)   { where.push('s.travel_date = ?');    params.push(date); }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await query(`
    SELECT b.id, b.booking_ref, b.seat_number, b.passenger_first, b.passenger_last,
           b.national_id, b.phone, b.email, b.amount_paid, b.payment_method,
           b.payment_status, b.booking_status, b.qr_ref, b.created_at, b.cancelled_at,
           s.train_id, s.departure_time, s.arrival_time, s.travel_date, s.class,
           st1.name_en AS from_en, st1.name_ar AS from_ar, st1.code AS from_code,
           st2.name_en AS to_en,   st2.name_ar AS to_ar,   st2.code AS to_code
    FROM bookings b
    JOIN schedules s  ON s.id  = b.schedule_id
    JOIN routes r     ON r.id  = s.route_id
    JOIN stations st1 ON st1.id = r.from_station_id
    JOIN stations st2 ON st2.id = r.to_station_id
    ${whereClause}
    ORDER BY b.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, parseInt(limit), offset]);

  const [[{ total }]] = await query(
    `SELECT COUNT(*) AS total FROM bookings b JOIN schedules s ON s.id=b.schedule_id JOIN routes r ON r.id=s.route_id JOIN stations st1 ON st1.id=r.from_station_id JOIN stations st2 ON st2.id=r.to_station_id ${whereClause}`,
    params
  );

  res.json({ success: true, data: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
});

// ── GET /api/bookings/:ref ────────────────────────────────────
router.get('/:ref', authenticate, async (req, res) => {
  const [rows] = await query(`
    SELECT b.*, s.train_id, s.departure_time, s.arrival_time, s.travel_date, s.class,
           st1.name_en AS from_en, st1.name_ar AS from_ar, st1.code AS from_code,
           st2.name_en AS to_en,   st2.name_ar AS to_ar,   st2.code AS to_code,
           r.price_first_class, r.price_economy, r.price_student
    FROM bookings b
    JOIN schedules s  ON s.id  = b.schedule_id
    JOIN routes r     ON r.id  = s.route_id
    JOIN stations st1 ON st1.id = r.from_station_id
    JOIN stations st2 ON st2.id = r.to_station_id
    WHERE b.booking_ref = ?
  `, [req.params.ref]);

  if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found' });

  const booking = rows[0];
  // Passengers can only view their own
  if (req.user.role === 'passenger' && booking.user_id !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  res.json({ success: true, data: booking });
});

// ── POST /api/bookings ────────────────────────────────────────
router.post('/',
  authenticate,
  body('scheduleId').isInt({ min: 1 }),
  body('seatNumber').notEmpty().isLength({ max: 10 }),
  body('passengerFirst').notEmpty().isLength({ max: 100 }),
  body('passengerLast').notEmpty().isLength({ max: 100 }),
  body('nationalId').optional().isLength({ min: 10, max: 10 }),
  body('phone').optional().isMobilePhone('any'),
  body('email').optional().isEmail(),
  body('paymentMethod').isIn(['mada', 'visa', 'mastercard', 'apple_pay', 'cash']),
  validate,
  async (req, res) => {
    const { scheduleId, seatNumber, passengerFirst, passengerLast, nationalId, phone, email, paymentMethod } = req.body;

    const conn = await beginTransaction();
    try {
      // Lock schedule row
      const [[schedule]] = await conn.execute(
        `SELECT s.*, r.price_first_class, r.price_economy, r.price_student,
                st1.code AS from_code, st2.code AS to_code,
                st1.name_en AS from_en, st2.name_en AS to_en
         FROM schedules s
         JOIN routes r ON r.id = s.route_id
         JOIN stations st1 ON st1.id = r.from_station_id
         JOIN stations st2 ON st2.id = r.to_station_id
         WHERE s.id = ? FOR UPDATE`,
        [scheduleId]
      );

      if (!schedule) {
        await rollbackTransaction(conn);
        return res.status(404).json({ success: false, message: 'Schedule not found' });
      }
      if (schedule.status === 'cancelled') {
        await rollbackTransaction(conn);
        return res.status(400).json({ success: false, message: 'Schedule is cancelled' });
      }
      if (schedule.available_seats <= 0) {
        await rollbackTransaction(conn);
        return res.status(409).json({ success: false, message: 'No seats available on this train' });
      }

      // Check seat not already taken
      const [[existingSeat]] = await conn.execute(
        'SELECT id FROM bookings WHERE schedule_id = ? AND seat_number = ? AND booking_status IN ("confirmed","pending")',
        [scheduleId, seatNumber]
      );
      if (existingSeat) {
        await rollbackTransaction(conn);
        return res.status(409).json({ success: false, message: `Seat ${seatNumber} is already taken` });
      }

      // Determine price
      const priceMap = { 'First Class': schedule.price_first_class, 'Economy': schedule.price_economy, 'Student': schedule.price_student };
      const amountPaid = priceMap[schedule.class] || schedule.price_economy;

      // Generate refs
      let bookingRef, qrRef;
      let attempts = 0;
      do {
        bookingRef = genBookingRef();
        qrRef      = genQrRef();
        const [[exists]] = await conn.execute('SELECT id FROM bookings WHERE booking_ref = ?', [bookingRef]);
        if (!exists) break;
      } while (++attempts < 10);

      // Generate QR
      const passengerName = `${passengerFirst} ${passengerLast}`;
      const qrDataUrl = await generateQRCode(bookingRef, schedule.train_id, schedule.from_code, schedule.to_code, schedule.travel_date, seatNumber, passengerName);

      // Insert booking
      const [result] = await conn.execute(
        `INSERT INTO bookings (booking_ref, user_id, schedule_id, seat_number, passenger_first, passenger_last,
          national_id, phone, email, amount_paid, payment_method, payment_status, booking_status, qr_code, qr_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'confirmed', ?, ?)`,
        [bookingRef, req.user.id, scheduleId, seatNumber, passengerFirst, passengerLast,
         nationalId || null, phone || null, email || null, amountPaid, paymentMethod, qrDataUrl, qrRef]
      );

      // Decrement available seats
      await conn.execute('UPDATE schedules SET available_seats = available_seats - 1 WHERE id = ?', [scheduleId]);

      await commitTransaction(conn);

      // Send notifications (non-blocking)
      const notifPayload = {
        bookingRef, trainId: schedule.train_id,
        from: schedule.from_en, to: schedule.to_en,
        date: schedule.travel_date, dep: schedule.departure_time,
        seat: seatNumber, amount: amountPaid,
        passengerName,
      };

      notificationService.sendBookingConfirmation({
        phone:  phone || req.user.phone,
        email:  email || req.user.email,
        ...notifPayload,
      }).catch(err => logger.error('Notification failed:', err.message));

      const [newBooking] = await query('SELECT * FROM bookings WHERE id = ?', [result.insertId]);

      res.status(201).json({
        success: true,
        message: 'Booking confirmed! Confirmation sent via SMS and email.',
        data: { ...newBooking[0], qr_code: qrDataUrl },
        notifications: {
          sms:   !!(phone || req.user.phone),
          email: !!(email || req.user.email),
        },
      });
    } catch (err) {
      await rollbackTransaction(conn);
      throw err;
    }
  }
);

// ── DELETE /api/bookings/:ref (cancel) ────────────────────────
router.delete('/:ref', authenticate, async (req, res) => {
  const [rows] = await query('SELECT * FROM bookings WHERE booking_ref = ?', [req.params.ref]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found' });

  const booking = rows[0];

  if (req.user.role === 'passenger' && booking.user_id !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  if (booking.booking_status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
  }
  if (booking.booking_status === 'completed') {
    return res.status(400).json({ success: false, message: 'Cannot cancel a completed booking' });
  }

  const { reason } = req.body;
  await query(
    'UPDATE bookings SET booking_status="cancelled", payment_status="refunded", cancelled_at=NOW(), cancel_reason=? WHERE booking_ref=?',
    [reason || null, req.params.ref]
  );
  await query('UPDATE schedules SET available_seats = available_seats + 1 WHERE id = ?', [booking.schedule_id]);

  res.json({ success: true, message: 'Booking cancelled and refund initiated' });
});

// ── GET /api/bookings/:ref/qr ──────────────────────────────────
router.get('/:ref/qr', authenticate, async (req, res) => {
  const [rows] = await query('SELECT booking_ref, qr_code, booking_status, user_id FROM bookings WHERE booking_ref = ?', [req.params.ref]);
  if (!rows.length) return res.status(404).json({ success: false, message: 'Booking not found' });
  const b = rows[0];
  if (req.user.role === 'passenger' && b.user_id !== req.user.id) return res.status(403).json({ success: false, message: 'Access denied' });
  if (b.booking_status === 'cancelled') return res.status(400).json({ success: false, message: 'Booking is cancelled' });
  res.json({ success: true, data: { bookingRef: b.booking_ref, qrCode: b.qr_code } });
});

module.exports = router;
