// Usage: npm run db:init  -> creates the database and tables from schema.sql
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

(async () => {
  const { database, ...conn } = env.db;
  const connection = await mysql.createConnection({ ...conn, multipleStatements: true });
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await connection.query(sql);

  // schema.sql already reflects every migration's end result, so a fresh
  // database does not need them re-applied - just record them as done.
  await connection.query(`USE ${env.db.database}`);
  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
    : [];
  for (const file of files) {
    await connection.query('INSERT IGNORE INTO schema_migrations (id) VALUES (?)', [file]);
  }

  await connection.end();
  console.log('Database initialised.');
})().catch((err) => {
  console.error('DB init failed:', err.message);
  process.exit(1);
});
