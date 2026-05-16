require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function setup() {
  const reset = process.argv.includes('--reset');

  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    if (reset) {
      console.log('⚠️  Dropping database railway_sa...');
      await conn.execute('DROP DATABASE IF EXISTS railway_sa');
    }

    console.log('📦 Running schema.sql...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await conn.query(schema);
    console.log('✅ Schema applied');

    conn.end();
    console.log('🎉 Database setup complete. Run `npm run db:seed` next.');
  } catch (err) {
    console.error('❌ Setup error:', err.message);
    conn.end();
    process.exit(1);
  }
}

setup();
