// Usage: npm run db:seed-admin -- admin@example.com 'StrongPassword123'
// or set ADMIN_EMAIL / ADMIN_PASSWORD in the environment.
// Creates an admin user, or resets the password and promotes the user to admin if the email exists.
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

(async () => {
  const email = String(process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.argv[3] || process.env.ADMIN_PASSWORD || '');

  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    console.error("Usage: npm run db:seed-admin -- <email> <password (min 8 chars)>");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);

  if (existing[0]) {
    await pool.query("UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?", [
      hash,
      existing[0].id,
    ]);
    console.log(`Updated existing user ${email}: password reset, role set to admin.`);
  } else {
    await pool.query("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')", [
      email,
      hash,
    ]);
    console.log(`Created admin user ${email}.`);
  }
  await pool.end();
})().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
