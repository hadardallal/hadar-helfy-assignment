const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 4000,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'appdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Simple test function (optional)
async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT 1 AS result');
    console.log('DB connection OK:', rows[0]);
  } catch (err) {
    console.error('DB connection FAILED:', err.message);
  }
}

async function findUserByUsernameAndPassword(username, password) {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password]
  );
  return rows[0] || null;
}

async function createToken(userId, token) {
  await pool.query(
    'INSERT INTO tokens (user_id, token) VALUES (?, ?)',
    [userId, token]
  );
}

async function findUserByToken(token) {
  const [rows] = await pool.query(
    `SELECT u.* 
     FROM users u
     JOIN tokens t ON t.user_id = u.id
     WHERE t.token = ?`,
    [token]
  );
  return rows[0] || null;
}

module.exports = {
  pool,
  testConnection,
  findUserByUsernameAndPassword,
  createToken,
  findUserByToken
};
