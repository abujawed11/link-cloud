// Usage: npm run db:init  -> creates the database and tables from schema.sql
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

(async () => {
  const { database, ...conn } = env.db;
  const connection = await mysql.createConnection({ ...conn, multipleStatements: true });
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await connection.query(sql);
  await connection.end();
  console.log('Database initialised.');
})().catch((err) => {
  console.error('DB init failed:', err.message);
  process.exit(1);
});
