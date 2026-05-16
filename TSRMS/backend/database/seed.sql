-- ============================================================
-- RailWay SA — Seed Data
-- ============================================================
USE railway_sa;

-- ── Stations ─────────────────────────────────────────────────
INSERT IGNORE INTO stations (code, name_en, name_ar, city_en, city_ar, latitude, longitude) VALUES
('RUH', 'Riyadh Central',     'الرياض المركزية',    'Riyadh',  'الرياض',   24.7136,  46.6753),
('JED', 'Jeddah North',       'جدة الشمالية',       'Jeddah',  'جدة',      21.4858,  39.1925),
('MKK', 'Makkah Station',     'محطة مكة',           'Makkah',  'مكة',      21.3891,  39.8579),
('MED', 'Madinah Station',    'محطة المدينة',        'Madinah', 'المدينة',  24.4672,  39.6151),
('DMM', 'Dammam Port',        'ميناء الدمام',        'Dammam',  'الدمام',   26.4207,  50.0888),
('JBL', 'Jubail Industrial',  'الجبيل الصناعية',    'Jubail',  'الجبيل',   27.0174,  49.6581);

-- ── Routes ───────────────────────────────────────────────────
INSERT IGNORE INTO routes (route_code, from_station_id, to_station_id, distance_km, duration_minutes, price_first_class, price_economy, price_student, active) VALUES
('RT-001', 1, 2,  980,  300, 350.00, 180.00, 90.00, 1),
('RT-002', 1, 5,  400,  150, 220.00, 120.00, 60.00, 1),
('RT-003', 2, 3,   80,   60, 120.00,  50.00, 30.00, 1),
('RT-004', 1, 4, 1200,  360, 420.00, 250.00,120.00, 1),
('RT-005', 5, 6,  100,   60, 150.00,  80.00, 40.00, 1),
('RT-006', 2, 1,  980,  300, 350.00, 180.00, 90.00, 1);

-- ── Admin User (password: admin123) ──────────────────────────
INSERT IGNORE INTO users (email, password_hash, first_name, last_name, phone, role, status, verified, auth_method) VALUES
('admin@railwaysa.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4tbsXSKqK2', 'Abdullah', 'Al-Rashidi', '0551234567', 'admin', 'active', 1, 'email'),
('staff@railwaysa.com', '$2a$12$8K1p/a0dR1xqM4saF7Gc1.nmJxPMn0/WFkuIBq0OQIKvuHBaMf3e6', 'Sara', 'Al-Qahtani', '0559876543', 'staff', 'active', 1, 'email'),
('user@railwaysa.com',  '$2a$12$3e4fG7hI8jK0lM1nO2pQR.stuvwxyzABCDEFGHIJKLMNOPQRS', 'Mohammed', 'Al-Ghamdi', '0508765432', 'passenger', 'active', 1, 'email');

-- admin123 => $2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4tbsXSKqK2
-- staff123 => $2a$12$8K1p/a0dR1xqM4saF7Gc1.nmJxPMn0/WFkuIBq0OQIKvuHBaMf3e6
-- pass123  => $2a$12$3e4fG7hI8jK0lM1nO2pQR.stuvwxyzABCDEFGHIJKLMNOPQRS

-- ── User Permissions ─────────────────────────────────────────
INSERT IGNORE INTO user_permissions (user_id, can_schedules, can_bookings, can_routes, can_users, can_reports, can_pricing)
SELECT id, 1,1,1,1,1,1 FROM users WHERE email='admin@railwaysa.com';

INSERT IGNORE INTO user_permissions (user_id, can_schedules, can_bookings, can_routes, can_users, can_reports, can_pricing)
SELECT id, 1,1,0,0,1,0 FROM users WHERE email='staff@railwaysa.com';

INSERT IGNORE INTO user_permissions (user_id, can_schedules, can_bookings, can_routes, can_users, can_reports, can_pricing)
SELECT id, 0,1,0,0,0,0 FROM users WHERE email='user@railwaysa.com';

-- ── Sample Schedules (today) ──────────────────────────────────
INSERT IGNORE INTO schedules (train_id, route_id, departure_time, arrival_time, travel_date, total_seats, available_seats, class, status) VALUES
('IR-401', 1, '08:30:00', '13:30:00', CURDATE(), 200, 24,  'First Class', 'active'),
('IR-205', 2, '09:15:00', '11:45:00', CURDATE(), 150, 8,   'Economy',     'active'),
('HR-103', 3, '10:00:00', '11:00:00', CURDATE(), 300, 0,   'Economy',     'delayed'),
('IR-302', 4, '10:45:00', '16:45:00', CURDATE(), 200, 41,  'First Class', 'active'),
('IR-210', 2, '11:30:00', '14:00:00', CURDATE(), 150, 0,   'Economy',     'cancelled'),
('HR-201', 3, '12:00:00', '13:00:00', CURDATE(), 300, 55,  'Student',     'active'),
('IR-403', 1, '14:00:00', '19:00:00', CURDATE(), 200, 90,  'Economy',     'scheduled'),
('IR-306', 4, '15:30:00', '21:30:00', CURDATE(), 200, 12,  'First Class', 'active');

-- ── Sample Bookings ───────────────────────────────────────────
INSERT IGNORE INTO bookings
  (booking_ref, user_id, schedule_id, seat_number, passenger_first, passenger_last, national_id, phone, email, amount_paid, payment_method, payment_status, booking_status, qr_ref)
SELECT 'BK-9182', u.id, s.id, '14A', 'Mohammed', 'Al-Ghamdi', '1093847261', '0508765432', 'user@railwaysa.com', 350.00, 'mada', 'paid', 'confirmed', 'RWSA-BK9182'
FROM users u, schedules s WHERE u.email='user@railwaysa.com' AND s.train_id='IR-401' LIMIT 1;

INSERT IGNORE INTO bookings
  (booking_ref, user_id, schedule_id, seat_number, passenger_first, passenger_last, national_id, phone, email, amount_paid, payment_method, payment_status, booking_status, qr_ref)
SELECT 'BK-9155', u.id, s.id, '22B', 'Mohammed', 'Al-Ghamdi', '1093847261', '0508765432', 'user@railwaysa.com', 50.00, 'apple_pay', 'paid', 'completed', 'RWSA-BK9155'
FROM users u, schedules s WHERE u.email='user@railwaysa.com' AND s.train_id='HR-103' LIMIT 1;
