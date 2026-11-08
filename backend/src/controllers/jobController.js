const pool = require('../config/db');
const downloadService = require('../services/downloadService');

const httpError = (status, message) => Object.assign(new Error(message), { status });

exports.create = async (req, res) => {
  const raw = String(req.body.url || '').trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw httpError(400, 'Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw httpError(400, 'Only http/https URLs are allowed');
  }

  const [result] = await pool.query('INSERT INTO jobs (user_id, url) VALUES (?, ?)', [
    req.user.id,
    url.toString(),
  ]);
  // Fire and forget. Phase 3: replace with queue.add()
  downloadService.start(result.insertId);

  const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ?', [result.insertId]);
  res.status(201).json({ job: rows[0] });
};

exports.list = async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM jobs WHERE user_id = ? ORDER BY id DESC LIMIT 100',
    [req.user.id]
  );
  res.json({ jobs: rows });
};

exports.get = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (!rows[0]) throw httpError(404, 'Job not found');
  res.json({ job: rows[0] });
};
