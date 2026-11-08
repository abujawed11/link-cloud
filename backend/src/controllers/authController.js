const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const env = require('../config/env');
const { COOKIE, cookieOptions, signToken } = require('../middleware/auth');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const publicUser = (u) => ({ id: u.id, email: u.email, role: u.role });

async function userCount() {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM users');
  return n;
}

async function registrationOpen() {
  if (env.allowRegistration) return true;
  return (await userCount()) === 0;
}

exports.status = async (req, res) => {
  res.json({ registrationOpen: await registrationOpen() });
};

exports.register = async (req, res) => {
  if (!(await registrationOpen())) throw httpError(403, 'Registration is closed');
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw httpError(400, 'Valid email required');
  if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');

  const role = (await userCount()) === 0 ? 'admin' : 'user';
  const hash = await bcrypt.hash(password, 12);
  try {
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      [email, hash, role]
    );
    const user = { id: result.insertId, email, role };
    res.cookie(COOKIE, signToken(user), cookieOptions());
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(409, 'Email already registered');
    throw err;
  }
};

exports.login = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw httpError(401, 'Invalid email or password');
  res.cookie(COOKIE, signToken(user), cookieOptions());
  res.json({ user: publicUser(user) });
};

exports.logout = (req, res) => {
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
};

exports.me = async (req, res) => {
  const [rows] = await pool.query('SELECT id, email, role FROM users WHERE id = ?', [req.user.id]);
  if (!rows[0]) throw httpError(401, 'Not authenticated');
  res.json({ user: rows[0] });
};
