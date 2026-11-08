// Usage: npm run db:migrate
// Applies each src/db/migrations/*.sql file once, in filename order, tracked
// in a schema_migrations table. Safe to run repeatedly - already-applied
// migrations are skipped. `npm run db:init` (fresh installs) pre-marks every
// migration that exists at the time as applied, since schema.sql already
// reflects their combined result; this script is for upgrading a database
// that was created before a given migration existed.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureTrackingTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function run() {
  const connection = await mysql.createConnection({ ...env.db, multipleStatements: true });
  await ensureTrackingTable(connection);

  const [applied] = await connection.query('SELECT id FROM schema_migrations');
  const appliedIds = new Set(applied.map((r) => r.id));

  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    : [];

  let ran = 0;
  for (const file of files) {
    if (appliedIds.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`Applying migration ${file}...`);
    await connection.query(sql);
    await connection.query('INSERT INTO schema_migrations (id) VALUES (?)', [file]);
    ran += 1;
  }

  await connection.end();
  console.log(ran > 0 ? `Applied ${ran} migration(s).` : 'Already up to date.');
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
