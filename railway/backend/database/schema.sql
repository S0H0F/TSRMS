-- ============================================================
-- RailWay SA — MySQL Database Schema
-- ============================================================
-- Run:  mysql -u root -p < database/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS railway_sa
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE railway_sa;

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  email         VARCHAR(255)    NOT NULL UNIQUE,
  password_hash VARCHAR(255)    NULL,           -- NULL for Nafath-only users
  first_name    VARCHAR(100)    NOT NULL,
  last_name     VARCHAR(100)    NOT NULL,
  phone         VARCHAR(20)     NULL,
  national_id   VARCHAR(20)     NULL UNIQUE,
  role          ENUM('admin','staff','passenger') NOT NULL DEFAULT 'passenger',
  status        ENUM('active','inactive','pending') NOT NULL DEFAULT 'active',
  verified      TINYINT(1)      NOT NULL DEFAULT 0,
  auth_method   ENUM('email','nafath','both') NOT NULL DEFAULT 'email',
  last_login    DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_email       (email),
  INDEX idx_national_id (national_id),
  INDEX idx_role        (role),
  INDEX idx_status      (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── User Permissions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_permissions (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id         INT UNSIGNED NOT NULL,
  can_schedules   TINYINT(1)   NOT NULL DEFAULT 0,
  can_bookings    TINYINT(1)   NOT NULL DEFAULT 0,
  can_routes      TINYINT(1)   NOT NULL DEFAULT 0,
  can_users       TINYINT(1)   NOT NULL DEFAULT 0,
  can_reports     TINYINT(1)   NOT NULL DEFAULT 0,
  can_pricing     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Refresh Tokens ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  token       VARCHAR(512) NOT NULL UNIQUE,
  expires_at  DATETIME     NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_token   (token(255)),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Stations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stations (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code       VARCHAR(10)  NOT NULL UNIQUE,
  name_en    VARCHAR(100) NOT NULL,
  name_ar    VARCHAR(100) NOT NULL,
  city_en    VARCHAR(100) NOT NULL,
  city_ar    VARCHAR(100) NOT NULL,
  latitude   DECIMAL(9,6) NULL,
  longitude  DECIMAL(9,6) NULL,
  active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Routes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
  id                 INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  route_code         VARCHAR(20)      NOT NULL UNIQUE,
  from_station_id    INT UNSIGNED     NOT NULL,
  to_station_id      INT UNSIGNED     NOT NULL,
  distance_km        DECIMAL(8,2)     NOT NULL,
  duration_minutes   INT UNSIGNED     NOT NULL,
  price_first_class  DECIMAL(10,2)    NOT NULL,
  price_economy      DECIMAL(10,2)    NOT NULL,
  price_student      DECIMAL(10,2)    NOT NULL,
  active             TINYINT(1)       NOT NULL DEFAULT 1,
  created_by         INT UNSIGNED     NULL,
  created_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_route_code    (route_code),
  INDEX idx_from_station  (from_station_id),
  INDEX idx_to_station    (to_station_id),
  FOREIGN KEY (from_station_id) REFERENCES stations(id),
  FOREIGN KEY (to_station_id)   REFERENCES stations(id),
  FOREIGN KEY (created_by)      REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Schedules ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedules (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  train_id         VARCHAR(20)   NOT NULL,
  route_id         INT UNSIGNED  NOT NULL,
  departure_time   TIME          NOT NULL,
  arrival_time     TIME          NOT NULL,
  travel_date      DATE          NOT NULL,
  total_seats      INT UNSIGNED  NOT NULL DEFAULT 200,
  available_seats  INT UNSIGNED  NOT NULL DEFAULT 200,
  class            ENUM('First Class','Economy','Student') NOT NULL DEFAULT 'Economy',
  status           ENUM('scheduled','active','delayed','cancelled') NOT NULL DEFAULT 'scheduled',
  delay_minutes    INT           NOT NULL DEFAULT 0,
  notes            TEXT          NULL,
  created_by       INT UNSIGNED  NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_train_id    (train_id),
  INDEX idx_route_id    (route_id),
  INDEX idx_travel_date (travel_date),
  INDEX idx_status      (status),
  FOREIGN KEY (route_id)   REFERENCES routes(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Bookings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  booking_ref     VARCHAR(20)     NOT NULL UNIQUE,
  user_id         INT UNSIGNED    NOT NULL,
  schedule_id     INT UNSIGNED    NOT NULL,
  seat_number     VARCHAR(10)     NOT NULL,
  passenger_first VARCHAR(100)    NOT NULL,
  passenger_last  VARCHAR(100)    NOT NULL,
  national_id     VARCHAR(20)     NULL,
  phone           VARCHAR(20)     NULL,
  email           VARCHAR(255)    NULL,
  amount_paid     DECIMAL(10,2)   NOT NULL,
  payment_method  ENUM('mada','visa','mastercard','apple_pay','cash') NOT NULL DEFAULT 'mada',
  payment_status  ENUM('pending','paid','refunded','failed') NOT NULL DEFAULT 'pending',
  booking_status  ENUM('confirmed','completed','cancelled','pending') NOT NULL DEFAULT 'pending',
  qr_code         TEXT            NULL,
  qr_ref          VARCHAR(50)     NULL UNIQUE,
  cancelled_at    DATETIME        NULL,
  cancel_reason   TEXT            NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_booking_ref   (booking_ref),
  INDEX idx_user_id       (user_id),
  INDEX idx_schedule_id   (schedule_id),
  INDEX idx_booking_status (booking_status),
  INDEX idx_national_id   (national_id),
  FOREIGN KEY (user_id)     REFERENCES users(id),
  FOREIGN KEY (schedule_id) REFERENCES schedules(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Notifications Log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED  NOT NULL,
  booking_id  INT UNSIGNED  NULL,
  type        ENUM('sms','email','push') NOT NULL,
  channel     VARCHAR(100)  NOT NULL,
  subject     VARCHAR(255)  NULL,
  message     TEXT          NOT NULL,
  status      ENUM('sent','failed','pending') NOT NULL DEFAULT 'pending',
  sent_at     DATETIME      NULL,
  error_msg   TEXT          NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_id    (user_id),
  INDEX idx_booking_id (booking_id),
  FOREIGN KEY (user_id)    REFERENCES users(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Audit Log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED  NULL,
  action      VARCHAR(100)  NOT NULL,
  entity_type VARCHAR(50)   NULL,
  entity_id   INT UNSIGNED  NULL,
  old_value   JSON          NULL,
  new_value   JSON          NULL,
  ip_address  VARCHAR(45)   NULL,
  user_agent  VARCHAR(500)  NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_id     (user_id),
  INDEX idx_action      (action),
  INDEX idx_entity      (entity_type, entity_id),
  INDEX idx_created_at  (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Occupancy Snapshot (for analytics) ───────────────────────
CREATE TABLE IF NOT EXISTS occupancy_snapshots (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  schedule_id   INT UNSIGNED  NOT NULL,
  snapshot_time DATETIME      NOT NULL,
  total_seats   INT UNSIGNED  NOT NULL,
  occupied      INT UNSIGNED  NOT NULL,
  reserved      INT UNSIGNED  NOT NULL,
  available     INT UNSIGNED  NOT NULL,
  occupancy_pct DECIMAL(5,2)  NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_schedule_id   (schedule_id),
  INDEX idx_snapshot_time (snapshot_time),
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Revenue Summary (materialized daily) ─────────────────────
CREATE TABLE IF NOT EXISTS revenue_daily (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  report_date   DATE          NOT NULL UNIQUE,
  total_revenue DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_bookings INT UNSIGNED NOT NULL DEFAULT 0,
  cancelled     INT UNSIGNED  NOT NULL DEFAULT 0,
  refunded      DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_report_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
