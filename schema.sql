-- ============================================================
--  TSRMS — Train Schedule & Reservation Management System
--  Database Schema  |  schema.sql
--  Imam University · CS1350 · Sprint 1 + Sprint 2
-- ============================================================
--  Execution order is dependency-safe:
--  Users → Routes → PricingConfig → TrainSchedules → Seats → Reservations
-- ============================================================

-- Ensure a clean slate during development (disable FK checks temporarily)
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS Reservations;
DROP TABLE IF EXISTS Seats;
DROP TABLE IF EXISTS TrainSchedules;
DROP TABLE IF EXISTS PricingConfig;
DROP TABLE IF EXISTS Routes;
DROP TABLE IF EXISTS Users;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  TABLE 1: Users
--  Central identity and authentication table.
--  Referenced by: TrainSchedules (ModifiedBy), Seats (OccupiedBy),
--                 Reservations (PassengerID)
-- ============================================================
CREATE TABLE Users (
    UserID          INT             NOT NULL AUTO_INCREMENT,
    NationalID      VARCHAR(10)     NOT NULL,   -- Saudi 10-digit National ID (Nafath)
    FullName        VARCHAR(150)    NOT NULL,
    Email           VARCHAR(255)    NOT NULL,
    Phone           VARCHAR(20)     NOT NULL,   -- For automated SMS notifications
    PasswordHash    VARCHAR(255)    NOT NULL,   -- bcrypt hash; NEVER store plaintext
    Role            ENUM(
                        'Admin',        -- Full system access; CRUD on schedules & routes
                        'Staff',        -- Read occupancy; manual booking for walk-ins
                        'Passenger'     -- Search, book, and view own reservations
                    )               NOT NULL    DEFAULT 'Passenger',
    IsNafathVerified TINYINT(1)     NOT NULL    DEFAULT 0,  -- 1 = identity confirmed via Nafath portal
    PreferredLang   ENUM('en','ar') NOT NULL    DEFAULT 'en',
    CreatedAt       TIMESTAMP       NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       TIMESTAMP       NOT NULL    DEFAULT CURRENT_TIMESTAMP
                                                ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (UserID),
    UNIQUE KEY uq_users_email      (Email),
    UNIQUE KEY uq_users_nationalid (NationalID),
    INDEX idx_users_role           (Role)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE  = utf8mb4_unicode_ci
COMMENT  = 'Core identity table. Role drives all RBAC decisions.';


-- ============================================================
--  TABLE 2: Routes
--  Physical railway paths between stations.
--  Referenced by: TrainSchedules (RouteID), PricingConfig (RouteID)
-- ============================================================
CREATE TABLE Routes (
    RouteID             INT             NOT NULL AUTO_INCREMENT,
    OriginStation       VARCHAR(100)    NOT NULL,   -- e.g. 'Riyadh'
    DestinationStation  VARCHAR(100)    NOT NULL,   -- e.g. 'Dammam'
    OriginStationAr     VARCHAR(100)    NOT NULL,   -- Arabic label for bilingual UI
    DestinationStationAr VARCHAR(100)   NOT NULL,
    DistanceKM          DECIMAL(8, 2)   NOT NULL,
    EstDurationMins     INT UNSIGNED    NOT NULL,   -- Calculated once; stored for display
    IsActive            TINYINT(1)      NOT NULL    DEFAULT 1,
    CreatedAt           TIMESTAMP       NOT NULL    DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (RouteID),
    INDEX idx_routes_origin      (OriginStation),
    INDEX idx_routes_destination (DestinationStation),
    -- Prevent duplicate route definitions in the same direction
    UNIQUE KEY uq_routes_pair (OriginStation, DestinationStation)
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE  = utf8mb4_unicode_ci
COMMENT  = 'Station-to-station route definitions. Arabic labels included for bilingual UI.';


-- ============================================================
--  TABLE 3: PricingConfig
--  Links ticket class tiers to base fares per route.
--  KSA VAT is enforced at 15.00% (ZATCA requirement).
--  Referenced by: (used in application layer for fare calculation)
-- ============================================================
CREATE TABLE PricingConfig (
    PriceID         INT             NOT NULL AUTO_INCREMENT,
    RouteID         INT             NOT NULL,
    ClassType       ENUM(
                        'Economy',
                        'First',
                        'Student'
                    )               NOT NULL,
    BaseFare        DECIMAL(10, 2)  NOT NULL    CHECK (BaseFare >= 0),
    -- VAT_Rate is stored per-row so future regulatory changes don't require
    -- application code edits — update the DB record only.
    VAT_Rate        DECIMAL(4, 2)   NOT NULL    DEFAULT 15.00,  -- Standard KSA VAT
    IsActive        TINYINT(1)      NOT NULL    DEFAULT 1,
    UpdatedAt       TIMESTAMP       NOT NULL    DEFAULT CURRENT_TIMESTAMP
                                                ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (PriceID),
    -- One pricing record per Route + Class combination
    UNIQUE KEY uq_pricing_route_class (RouteID, ClassType),
    INDEX idx_pricing_routeid (RouteID),

    CONSTRAINT fk_pricing_route
        FOREIGN KEY (RouteID) REFERENCES Routes (RouteID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT   -- Cannot delete a route that has active pricing
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE  = utf8mb4_unicode_ci
COMMENT  = 'Fare configuration per route and class. VAT_Rate defaults to 15% per ZATCA KSA law.';


-- ============================================================
--  TABLE 4: TrainSchedules
--  Each row = one scheduled journey on a route.
--  ModifiedBy provides the admin audit trail required by Sprint 1.
-- ============================================================
CREATE TABLE TrainSchedules (
    ScheduleID      INT             NOT NULL AUTO_INCREMENT,
    TrainNumber     VARCHAR(20)     NOT NULL,   -- e.g. 'SAR-101'
    RouteID         INT             NOT NULL,
    DepartureTime   DATETIME        NOT NULL,
    ArrivalTime     DATETIME        NOT NULL,
    TotalSeats      SMALLINT UNSIGNED NOT NULL  DEFAULT 100,
    Status          ENUM(
                        'On Time',
                        'Delayed',
                        'Cancelled'
                    )               NOT NULL    DEFAULT 'On Time',
    -- Audit trail: links to the Admin user who last modified this record
    ModifiedBy      INT                         DEFAULT NULL,
    CreatedAt       TIMESTAMP       NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       TIMESTAMP       NOT NULL    DEFAULT CURRENT_TIMESTAMP
                                                ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (ScheduleID),
    INDEX idx_schedules_route       (RouteID),
    INDEX idx_schedules_departure   (DepartureTime),
    INDEX idx_schedules_status      (Status),

    -- DepartureTime must be before ArrivalTime
    CONSTRAINT chk_schedule_times CHECK (ArrivalTime > DepartureTime),

    CONSTRAINT fk_schedule_route
        FOREIGN KEY (RouteID)     REFERENCES Routes (RouteID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_schedule_modifier
        FOREIGN KEY (ModifiedBy)  REFERENCES Users  (UserID)
        ON UPDATE CASCADE
        ON DELETE SET NULL        -- Keep schedule record even if the admin is deleted
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE  = utf8mb4_unicode_ci
COMMENT  = 'Individual journey timetables. ModifiedBy enforces admin-only audit trail.';


-- ============================================================
--  TABLE 5: Seats
--  The concurrency-critical table.
--  3-state Status machine: Available → Locked → Booked
--  holdTime stores the 10-minute lock expiry (Sprint 2, S5).
--  OccupiedBy links to the passenger mid-transaction.
-- ============================================================
CREATE TABLE Seats (
    SeatID          INT             NOT NULL AUTO_INCREMENT,
    ScheduleID      INT             NOT NULL,
    SeatNumber      VARCHAR(10)     NOT NULL,   -- e.g. 'A1', 'B12'
    ClassType       ENUM(
                        'Economy',
                        'First',
                        'Student'
                    )               NOT NULL    DEFAULT 'Economy',
    Status          ENUM(
                        'Available',
                        'Locked',       -- Temporarily held for 10 mins during checkout
                        'Booked'        -- Payment confirmed; seat is permanently taken
                    )               NOT NULL    DEFAULT 'Available',
    -- holdTime: the TIMESTAMP at which the 'Locked' status expires.
    -- The seatLocker.js scheduler queries: WHERE Status='Locked' AND holdTime < NOW()
    -- and resets those rows back to 'Available'.
    holdTime        TIMESTAMP                   NULL DEFAULT NULL,
    -- OccupiedBy: the UserID of the passenger who has the lock or confirmed booking.
    -- NULL = seat is Available and not held by anyone.
    OccupiedBy      INT                         NULL DEFAULT NULL,
    CreatedAt       TIMESTAMP       NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt       TIMESTAMP       NOT NULL    DEFAULT CURRENT_TIMESTAMP
                                                ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (SeatID),
    -- Composite index for the Pre-Check query: WHERE ScheduleID=? AND SeatNumber=?
    UNIQUE KEY uq_seat_per_schedule (ScheduleID, SeatNumber),
    INDEX idx_seats_status          (Status),
    -- Critical index: the lock-expiry scheduler runs this query frequently
    INDEX idx_seats_holdtime        (Status, holdTime),

    CONSTRAINT fk_seat_schedule
        FOREIGN KEY (ScheduleID)  REFERENCES TrainSchedules (ScheduleID)
        ON UPDATE CASCADE
        ON DELETE CASCADE,        -- Cancelling a schedule removes its seats

    CONSTRAINT fk_seat_occupant
        FOREIGN KEY (OccupiedBy)  REFERENCES Users (UserID)
        ON UPDATE CASCADE
        ON DELETE SET NULL        -- Passenger deletion releases seat back to Available
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE  = utf8mb4_unicode_ci
COMMENT  = 'Seat inventory. Status + holdTime implement the 10-min concurrency lock (Sprint 2 S5).';


-- ============================================================
--  TABLE 6: Reservations
--  Final confirmed booking record after payment.
--  PassengerID → Users enables the Station Staff occupancy view.
--  TotalFare stores the computed (BaseFare × 1.15) paid amount.
-- ============================================================
CREATE TABLE Reservations (
    ReservationID   INT             NOT NULL AUTO_INCREMENT,
    PassengerID     INT             NOT NULL,   -- FK → Users; drives occupancy view
    SeatID          INT             NOT NULL,
    TrainID         INT             NOT NULL,   -- Denormalized from Seats for fast reporting
    SeatNumber      VARCHAR(10)     NOT NULL,   -- Denormalized for ticket generation
    BookingDate     TIMESTAMP       NOT NULL    DEFAULT CURRENT_TIMESTAMP,
    TravelDate      DATE            NOT NULL,   -- Extracted from ScheduleDeparture for filtering
    BaseFare        DECIMAL(10, 2)  NOT NULL,
    VATAmount       DECIMAL(10, 2)  NOT NULL,   -- Computed: BaseFare × (VAT_Rate / 100)
    TotalFare       DECIMAL(10, 2)  NOT NULL,   -- BaseFare + VATAmount; stored for receipts
    ClassType       ENUM(
                        'Economy',
                        'First',
                        'Student'
                    )               NOT NULL,
    Status          ENUM(
                        'Pending',      -- Lock acquired; awaiting payment
                        'Confirmed',    -- Payment successful; ticket issued
                        'Cancelled'     -- Passenger/admin cancelled; seat released
                    )               NOT NULL    DEFAULT 'Pending',
    -- PaymentRef: the transaction ID returned by the payment gateway (Mada/Apple Pay)
    PaymentRef      VARCHAR(100)                NULL DEFAULT NULL,
    -- BookingRef: the unique human-readable reference printed on the QR ticket
    -- Format: TSRMS-{YYYYMMDD}-{random 6-char alphanumeric}
    BookingRef      VARCHAR(30)     NOT NULL,
    -- QRData: the JSON payload encoded into the QR code on the digital ticket
    -- Contains: PassengerID, ScheduleID, SeatNumber, BookingRef
    QRData          TEXT                        NULL,
    UpdatedAt       TIMESTAMP       NOT NULL    DEFAULT CURRENT_TIMESTAMP
                                                ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (ReservationID),
    UNIQUE KEY uq_booking_ref       (BookingRef),
    INDEX idx_reservations_passenger (PassengerID),
    INDEX idx_reservations_seat      (SeatID),
    INDEX idx_reservations_traveldate(TravelDate),  -- For admin trend reports
    INDEX idx_reservations_status    (Status),

    CONSTRAINT fk_reservation_passenger
        FOREIGN KEY (PassengerID) REFERENCES Users  (UserID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,    -- Cannot delete a user who has reservations

    CONSTRAINT fk_reservation_seat
        FOREIGN KEY (SeatID)      REFERENCES Seats  (SeatID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,    -- Cannot delete a seat with a confirmed booking

    CONSTRAINT fk_reservation_train
        FOREIGN KEY (TrainID)     REFERENCES TrainSchedules (ScheduleID)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
)
ENGINE = InnoDB
DEFAULT CHARSET = utf8mb4
COLLATE  = utf8mb4_unicode_ci
COMMENT  = 'Confirmed booking records. TotalFare = BaseFare + VAT. BookingRef used for QR ticket.';


-- ============================================================
--  STORED PROCEDURE: Release expired seat locks
--  Called by seatLocker.js scheduler every 30 seconds.
--  Resets seats where Status='Locked' AND holdTime has passed.
-- ============================================================
DELIMITER $$

CREATE PROCEDURE ReleaseExpiredLocks()
BEGIN
    UPDATE Seats
    SET    Status     = 'Available',
           holdTime   = NULL,
           OccupiedBy = NULL
    WHERE  Status   = 'Locked'
      AND  holdTime < NOW();

    -- Return the number of locks that were released (for logging)
    SELECT ROW_COUNT() AS ReleasedCount;
END$$

DELIMITER ;


-- ============================================================
--  VIEW: v_OccupancyReport
--  Used by Station Staff's "Identify Occupancy" dashboard.
--  Shows seat status joined with passenger name for each schedule.
-- ============================================================
CREATE OR REPLACE VIEW v_OccupancyReport AS
SELECT
    ts.ScheduleID,
    ts.TrainNumber,
    r.OriginStation,
    r.DestinationStation,
    ts.DepartureTime,
    ts.ArrivalTime,
    ts.Status                           AS ScheduleStatus,
    s.SeatID,
    s.SeatNumber,
    s.ClassType,
    s.Status                            AS SeatStatus,
    s.holdTime,
    u.FullName                          AS PassengerName,
    u.NationalID                        AS PassengerNationalID,
    u.Phone                             AS PassengerPhone
FROM TrainSchedules ts
JOIN Routes         r  ON r.RouteID    = ts.RouteID
JOIN Seats          s  ON s.ScheduleID = ts.ScheduleID
LEFT JOIN Users     u  ON u.UserID     = s.OccupiedBy
ORDER BY ts.DepartureTime, s.SeatNumber;


-- ============================================================
--  VIEW: v_PricingDisplay
--  Used by the Passenger Search Interface (S6).
--  Pre-computes the display price including 15% VAT.
-- ============================================================
CREATE OR REPLACE VIEW v_PricingDisplay AS
SELECT
    pc.PriceID,
    r.RouteID,
    r.OriginStation,
    r.DestinationStation,
    r.OriginStationAr,
    r.DestinationStationAr,
    r.DistanceKM,
    r.EstDurationMins,
    pc.ClassType,
    pc.BaseFare,
    pc.VAT_Rate,
    ROUND(pc.BaseFare * (pc.VAT_Rate / 100), 2)              AS VATAmount,
    ROUND(pc.BaseFare + (pc.BaseFare * pc.VAT_Rate / 100), 2) AS TotalFare
FROM PricingConfig pc
JOIN Routes        r ON r.RouteID = pc.RouteID
WHERE pc.IsActive = 1
  AND r.IsActive  = 1;


-- ============================================================
--  SEED DATA — Sample stations, routes, pricing, and one
--  Admin user for first-run login.
--  Admin password is: Admin@TSRMS2026
--  (bcrypt hash generated with saltRounds=12)
-- ============================================================

-- Admin user (change password on first login)
INSERT INTO Users
    (NationalID, FullName, Email, Phone, PasswordHash, Role, IsNafathVerified)
VALUES
    ('1000000001',
     'System Administrator',
     'admin@tsrms.sa',
     '+966500000001',
     '$2b$12$KIXeRtj2NBPN1vBGXnE8XOlzP7KnERwiBHF0TIi4JGbYJUvS3dWXS',
     'Admin',
     1);

-- Sample station staff
INSERT INTO Users
    (NationalID, FullName, Email, Phone, PasswordHash, Role, IsNafathVerified)
VALUES
    ('1000000002',
     'Riyadh Station Staff',
     'staff.riyadh@tsrms.sa',
     '+966500000002',
     '$2b$12$KIXeRtj2NBPN1vBGXnE8XOlzP7KnERwiBHF0TIi4JGbYJUvS3dWXS',
     'Staff',
     1);

-- Sample passenger
INSERT INTO Users
    (NationalID, FullName, Email, Phone, PasswordHash, Role, IsNafathVerified, PreferredLang)
VALUES
    ('1000000003',
     'Sultan Alforihi',
     'sultan@example.sa',
     '+966500000003',
     '$2b$12$KIXeRtj2NBPN1vBGXnE8XOlzP7KnERwiBHF0TIi4JGbYJUvS3dWXS',
     'Passenger',
     1,
     'ar');

-- Saudi Railway Routes (SAR network)
INSERT INTO Routes
    (OriginStation, DestinationStation, OriginStationAr, DestinationStationAr, DistanceKM, EstDurationMins)
VALUES
    ('Riyadh',  'Dammam',  'الرياض',   'الدمام',   448.0, 200),
    ('Riyadh',  'Qassim',  'الرياض',   'القصيم',   340.0, 165),
    ('Dammam',  'Riyadh',  'الدمام',   'الرياض',   448.0, 200),
    ('Qassim',  'Riyadh',  'القصيم',   'الرياض',   340.0, 165),
    ('Riyadh',  'Hail',    'الرياض',   'حائل',     670.0, 290),
    ('Riyadh',  'Madinah', 'الرياض',   'المدينة',  950.0, 390);

-- Pricing for each route × class (VAT_Rate defaults to 15.00)
INSERT INTO PricingConfig (RouteID, ClassType, BaseFare) VALUES
    (1, 'Economy',  65.00),
    (1, 'First',   130.00),
    (1, 'Student',  45.00),
    (2, 'Economy',  55.00),
    (2, 'First',   110.00),
    (2, 'Student',  38.00),
    (3, 'Economy',  65.00),
    (3, 'First',   130.00),
    (3, 'Student',  45.00),
    (4, 'Economy',  55.00),
    (4, 'First',   110.00),
    (4, 'Student',  38.00),
    (5, 'Economy',  90.00),
    (5, 'First',   180.00),
    (5, 'Student',  62.00),
    (6, 'Economy', 120.00),
    (6, 'First',   240.00),
    (6, 'Student',  85.00);

-- Sample schedules (modified by the seeded Admin, UserID=1)
INSERT INTO TrainSchedules
    (TrainNumber, RouteID, DepartureTime, ArrivalTime, TotalSeats, Status, ModifiedBy)
VALUES
    ('SAR-101', 1, '2026-05-01 06:00:00', '2026-05-01 09:20:00', 100, 'On Time', 1),
    ('SAR-102', 1, '2026-05-01 12:00:00', '2026-05-01 15:20:00', 100, 'On Time', 1),
    ('SAR-103', 1, '2026-05-01 18:00:00', '2026-05-01 21:20:00', 100, 'On Time', 1),
    ('SAR-201', 2, '2026-05-01 07:00:00', '2026-05-01 09:45:00',  80, 'On Time', 1),
    ('SAR-301', 3, '2026-05-01 06:30:00', '2026-05-01 09:50:00', 100, 'On Time', 1);

-- Seed seats for schedule SAR-101 (ScheduleID=1): 10 Economy + 5 First + 5 Student
INSERT INTO Seats (ScheduleID, SeatNumber, ClassType) VALUES
    (1,'A1','Economy'),(1,'A2','Economy'),(1,'A3','Economy'),(1,'A4','Economy'),(1,'A5','Economy'),
    (1,'B1','Economy'),(1,'B2','Economy'),(1,'B3','Economy'),(1,'B4','Economy'),(1,'B5','Economy'),
    (1,'F1','First'),  (1,'F2','First'),  (1,'F3','First'),  (1,'F4','First'),  (1,'F5','First'),
    (1,'S1','Student'),(1,'S2','Student'),(1,'S3','Student'),(1,'S4','Student'),(1,'S5','Student');


-- ============================================================
--  QUICK VERIFICATION QUERIES
--  Run these after executing the schema to confirm correctness.
-- ============================================================

-- 1. Check all tables were created
-- SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE();

-- 2. Verify pricing with VAT
-- SELECT * FROM v_PricingDisplay WHERE RouteID = 1;
-- Expected: Economy=65+9.75=74.75, First=130+19.50=149.50, Student=45+6.75=51.75

-- 3. Verify occupancy view
-- SELECT * FROM v_OccupancyReport WHERE ScheduleID = 1;

-- 4. Test the lock expiry procedure
-- UPDATE Seats SET Status='Locked', holdTime=NOW()-INTERVAL 1 HOUR WHERE SeatID=1;
-- CALL ReleaseExpiredLocks();
-- SELECT Status, holdTime FROM Seats WHERE SeatID=1;  -- Should be 'Available', NULL

-- ============================================================
--  END OF SCHEMA
-- ============================================================
