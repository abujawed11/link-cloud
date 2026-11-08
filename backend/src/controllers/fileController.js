const pool = require('../config/db');
const storage = require('../services/storageService');

const httpError = (status, message) => Object.assign(new Error(message), { status });

async function findOwned(id, userId) {
  const [rows] = await pool.query('SELECT * FROM files WHERE id = ? AND user_id = ?', [id, userId]);
  if (!rows[0]) throw httpError(404, 'File not found');
  return rows[0];
}

exports.list = async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, original_name, size_bytes, mime_type, source_url, created_at
     FROM files WHERE user_id = ? ORDER BY id DESC`,
    [req.user.id]
  );
  res.json({ files: rows });
};

exports.download = async (req, res) => {
  const file = await findOwned(req.params.id, req.user.id);
  res.download(storage.filePath(file.stored_name), file.original_name, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'File missing on disk' });
  });
};

exports.remove = async (req, res) => {
  const file = await findOwned(req.params.id, req.user.id);
  await storage.removeFile(file.stored_name);
  await pool.query('DELETE FROM files WHERE id = ?', [file.id]);
  res.json({ ok: true });
};
