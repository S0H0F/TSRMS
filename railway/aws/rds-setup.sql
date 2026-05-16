-- ============================================================
-- AWS RDS MySQL Setup
-- Run this once after RDS instance is created
-- ============================================================

-- Create dedicated user (do NOT use root in production)
CREATE USER IF NOT EXISTS 'railway_user'@'%' IDENTIFIED BY 'STRONG_PASSWORD_HERE';

-- Grant only what's needed
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, INDEX, ALTER
  ON railway_sa.* TO 'railway_user'@'%';

FLUSH PRIVILEGES;

-- Then run:
-- mysql -h YOUR_RDS_ENDPOINT -u admin -p < database/schema.sql
-- node backend/database/seed.js
