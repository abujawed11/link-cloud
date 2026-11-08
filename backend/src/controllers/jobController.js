const pool = require('../config/db');
const env = require('../config/env');
const downloadService = require('../services/downloadService');
const storage = require('../services/storageService');
const events = require('../services/jobEvents');
const { assertUrlAllowed, httpError } = require('../services/ssrfGuard');

exports.create = async (req, res) => {
  // Reject private/loopback/metadata targets before a job row is even created.
  const { url } = await assertUrlAllowed(req.body.url);

  const running = events.activeCount(req.user.id);
  if (running >= env.limits.maxConcurrentPerUser) {
    throw httpError(
      429,
      `You already have ${running} downloads running (limit ${env.limits.maxConcurrentPerUser}). Wait for one to finish.`
    );
  }

  if (env.limits.userQuotaBytes) {
    const used = await downloadService.userUsageBytes(req.user.id);
    if (used >= env.limits.userQuotaBytes) {
      throw httpError(507, 'Storage quota reached. Delete some files first.');
    }
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
  res.json({ jobs: rows.map(events.withLive) });
};

exports.get = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (!rows[0]) throw httpError(404, 'Job not found');
  res.json({ job: events.withLive(rows[0]) });
};

exports.cancel = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  const job = rows[0];
  if (!job) throw httpError(404, 'Job not found');
  if (!['queued', 'downloading'].includes(job.status)) {
    throw httpError(409, `Job is already ${job.status}`);
  }
  if (!events.cancel(job.id)) {
    // Not running in this process (e.g. left over from a restart): just mark it.
    await pool.query("UPDATE jobs SET status = 'cancelled' WHERE id = ?", [job.id]);
  }
  res.json({ ok: true });
};

// Storage usage for the signed-in user, for the dashboard header.
exports.usage = async (req, res) => {
  const used = await downloadService.userUsageBytes(req.user.id);
  const free = await storage.freeBytes();
  res.json({
    used_bytes: used,
    quota_bytes: env.limits.userQuotaBytes || null,
    max_file_bytes: env.limits.maxFileBytes || null,
    server_free_bytes: free,
    max_concurrent: env.limits.maxConcurrentPerUser,
    running: events.activeCount(req.user.id),
  });
};

// Server-Sent Events: live progress. Without `:id` it streams every job of the
// signed-in user, which is what the dashboard subscribes to.
function stream(req, res, jobId) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // tell Nginx not to buffer this response
  });
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');

  const send = (snapshot) => {
    if (jobId && Number(snapshot.id) !== Number(jobId)) return;
    res.write(`event: progress\ndata: ${JSON.stringify(snapshot)}\n\n`);
  };

  // Current state first, so a client that connects mid-download is not blank.
  if (jobId) {
    const snap = events.snapshot(jobId);
    if (snap) send(snap);
  }

  const unsubscribe = events.subscribe(req.user.id, send);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  const close = () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  };
  req.on('close', close);
  req.on('aborted', close);
}

exports.eventsAll = (req, res) => stream(req, res, null);

exports.eventsOne = async (req, res) => {
  const [rows] = await pool.query('SELECT id FROM jobs WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (!rows[0]) throw httpError(404, 'Job not found');
  stream(req, res, rows[0].id);
};
