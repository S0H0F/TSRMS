const mysql = require('mysql2/promise');
const logger = require('../config/logger');

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  port:             parseInt(process.env.DB_PORT) || 3306,
  database:         process.env.DB_NAME     || 'railway_sa',
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  connectionLimit:  parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  waitForConnections: true,
  queueLimit:       0,
  timezone:         '+03:00',   // KSA time
  charset:          'utf8mb4',
  decimalNumbers:   true,
  dateStrings:      false,
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    logger.info('✅ MySQL connected successfully');
    conn.release();
  })
  .catch(err => {
    logger.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  });

/**
 * Execute a query with optional params
 * Returns [rows, fields]
 */
async function query(sql, params = []) {
  const [rows, fields] = await pool.execute(sql, params);
  return [rows, fields];
}

/**
 * Begin a transaction — returns a connection
 * Usage: const conn = await beginTransaction();
 *        await conn.execute(sql, params);
 *        await commitTransaction(conn) OR await rollbackTransaction(conn);
 */
async function beginTransaction() {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  return conn;
}

async function commitTransaction(conn) {
  await conn.commit();
  conn.release();
}

async function rollbackTransaction(conn) {
  await conn.rollback();
  conn.release();
}

module.exports = { pool, query, beginTransaction, commitTransaction, rollbackTransaction };
