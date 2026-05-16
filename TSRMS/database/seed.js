require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');
const bcrypt = require('bcryptjs');

async function seed() {
  const conn = await mysql.createConnection({
    host:               process.env.DB_HOST || 'localhost',
    port:               parseInt(process.env.DB_PORT) || 3306,
    database:           process.env.DB_NAME || 'railway_sa',
    user:               process.env.DB_USER || 'root',
    password:           process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    // Hash passwords properly
    const adminHash = await bcrypt.hash('admin123', 12);
    const staffHash = await bcrypt.hash('staff123', 12);
    const passHash  = await bcrypt.hash('pass123',  12);

    // Read seed SQL and replace placeholder hashes
    let seedSQL = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    seedSQL = seedSQL
      .replace('$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4tbsXSKqK2', adminHash)
      .replace('$2a$12$8K1p/a0dR1xqM4saF7Gc1.nmJxPMn0/WFkuIBq0OQIKvuHBaMf3e6', staffHash)
      .replace('$2a$12$3e4fG7hI8jK0lM1nO2pQR.stuvwxyzABCDEFGHIJKLMNOPQRS', passHash);

    console.log('🌱 Seeding database...');
    await conn.query(seedSQL);
    console.log('✅ Seed data inserted');
    console.log('\nDemo credentials:');
    console.log('  Admin:     admin@railwaysa.com / admin123');
    console.log('  Staff:     staff@railwaysa.com / staff123');
    console.log('  Passenger: user@railwaysa.com  / pass123');

    conn.end();
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    conn.end();
    process.exit(1);
  }
}

seed();
