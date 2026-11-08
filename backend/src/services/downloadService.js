// Queue-agnostic download logic. In Phase 3 a BullMQ worker will call start(jobId)
// instead of the API calling it directly.
const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const pool = require('../config/db');
const storage = require('./storageService');

const PROGRESS_INTERVAL_MS = 1000;

function nameFromContentDisposition(header) {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through to plain filename */
    }
  }
  const plain = /filename\s*=\s*("([^"]+)"|[^;]+)/i.exec(header);
  return plain ? (plain[2] || plain[1]).trim() : null;
}

function nameFromUrl(url) {
  try {
    const base = path.posix.basename(new URL(url).pathname);
    return base ? decodeURIComponent(base) : null;
  } catch {
    return null;
  }
}

async function updateJob(id, fields) {
  const keys = Object.keys(fields);
  const sql = `UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  await pool.query(sql, [...keys.map((k) => fields[k]), id]);
}

async function run(job) {
  await updateJob(job.id, { status: 'downloading', progress: 0, bytes_downloaded: 0, error: null });

  const res = await fetch(job.url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Remote server responded ${res.status} ${res.statusText}`);
  if (!res.body) throw new Error('Remote server sent no data');

  const total = Number(res.headers.get('content-length')) || null;
  const originalName = storage.sanitizeFilename(
    nameFromContentDisposition(res.headers.get('content-disposition')) ||
      nameFromUrl(res.url || job.url)
  );
  const storedName = storage.newStoredName();
  const dest = storage.filePath(storedName);

  let received = 0;
  let lastReport = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      const now = Date.now();
      if (now - lastReport >= PROGRESS_INTERVAL_MS) {
        lastReport = now;
        updateJob(job.id, {
          bytes_downloaded: received,
          bytes_total: total,
          progress: total ? Math.min(99, Math.floor((received / total) * 100)) : 0,
        }).catch(() => {});
      }
      cb(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(dest));
  } catch (err) {
    await storage.removeFile(storedName); // never leave partial files behind
    throw err;
  }

  const [result] = await pool.query(
    `INSERT INTO files (user_id, original_name, stored_name, size_bytes, mime_type, source_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [job.user_id, originalName, storedName, received, res.headers.get('content-type'), job.url]
  );
  await updateJob(job.id, {
    status: 'done',
    progress: 100,
    bytes_downloaded: received,
    bytes_total: total ?? received,
    file_id: result.insertId,
  });
}

async function start(jobId) {
  const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
  const job = rows[0];
  if (!job) return;
  try {
    await run(job);
  } catch (err) {
    console.error(`Job ${jobId} failed:`, err.message);
    await updateJob(jobId, { status: 'failed', error: String(err.message).slice(0, 1000) }).catch(
      () => {}
    );
  }
}

module.exports = { start };
