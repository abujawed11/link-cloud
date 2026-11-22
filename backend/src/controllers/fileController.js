const fs = require('fs');
const pool = require('../config/db');
const storage = require('../services/storageService');
const { guessMime } = require('../utils/mimeGuess');

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
  res.json({
    files: rows.map((f) => ({ ...f, mime_type: guessMime(f.mime_type, f.original_name) })),
  });
};

exports.download = async (req, res) => {
  const file = await findOwned(req.params.id, req.user.id);
  res.download(storage.filePath(file.stored_name), file.original_name, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'File missing on disk' });
  });
};

// Serves the file inline (no Content-Disposition: attachment) with Range
// support, so <video>/<audio>/<img> tags can play/seek it directly instead
// of triggering a browser download.
exports.stream = async (req, res) => {
  const file = await findOwned(req.params.id, req.user.id);
  const path = storage.filePath(file.stored_name);

  let stat;
  try {
    stat = await fs.promises.stat(path);
  } catch {
    return res.status(404).json({ error: 'File missing on disk' });
  }

  const mime = guessMime(file.mime_type, file.original_name) || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');

  const range = req.headers.range;
  if (!range) {
    res.setHeader('Content-Length', stat.size);
    return fs.createReadStream(path).pipe(res);
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) {
    res.setHeader('Content-Range', `bytes */${stat.size}`);
    return res.status(416).end();
  }

  let start = match[1] ? parseInt(match[1], 10) : stat.size - parseInt(match[2], 10);
  let end = match[2] && match[1] ? parseInt(match[2], 10) : stat.size - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= stat.size) {
    res.setHeader('Content-Range', `bytes */${stat.size}`);
    return res.status(416).end();
  }

  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  res.setHeader('Content-Length', end - start + 1);
  fs.createReadStream(path, { start, end }).pipe(res);
};

exports.remove = async (req, res) => {
  const file = await findOwned(req.params.id, req.user.id);
  await storage.removeFile(file.stored_name);
  await pool.query('DELETE FROM files WHERE id = ?', [file.id]);
  res.json({ ok: true });
};
