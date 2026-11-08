const pool = require('../config/db');
const env = require('../config/env');
const downloadService = require('../services/downloadService');
const storage = require('../services/storageService');
const events = require('../services/jobEvents');
const activeJobs = require('../services/activeJobs');
const { addDownloadJob, getBullJob } = require('../queues/downloadQueue');
const { assertUrlAllowed, httpError } = require('../services/ssrfGuard');

async function assertCanEnqueue(userId) {
  const running = await activeJobs.countActive(userId);
  if (running >= env.limits.maxConcurrentPerUser) {
    throw httpError(
      429,
      `You already have ${running} downloads running (limit ${env.limits.maxConcurrentPerUser}). Wait for one to finish.`
    );
  }
  if (env.limits.userQuotaBytes) {
    const used = await downloadService.userUsageBytes(userId);
    if (used >= env.limits.userQuotaBytes) {
      throw httpError(507, 'Storage quota reached. Delete some files first.');
    }
  }
}

async function enqueue(userId, url) {
  await assertCanEnqueue(userId);
  const [result] = await pool.query('INSERT INTO jobs (user_id, url) VALUES (?, ?)', [
    userId,
    url,
  ]);
  await addDownloadJob({ dbJobId: result.insertId, userId, url });

  const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ?', [result.insertId]);
  return rows[0];
}

exports.create = async (req, res) => {
  // Reject private/loopback/metadata targets before a job row is even created.
  const { url } = await assertUrlAllowed(req.body.url);
  const job = await enqueue(req.user.id, url.toString());
  res.status(201).json({ job });
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
  if (!['queued', 'downloading', 'paused'].includes(job.status)) {
    throw httpError(409, `Job is already ${job.status}`);
  }

  if (job.status === 'paused') {
    // Nothing is running to interrupt - just drop the partial file directly.
    if (job.partial_stored_name) await storage.removeFile(job.partial_stored_name).catch(() => {});
    await pool.query(
      "UPDATE jobs SET status = 'cancelled', error = NULL, partial_stored_name = NULL WHERE id = ?",
      [job.id]
    );
    events.publish({ id: job.id, user_id: req.user.id, status: 'cancelled' });
    return res.json({ ok: true });
  }

  const bullJob = await getBullJob(job.id);
  if (bullJob && (await bullJob.isActive())) {
    // Being processed right now: ask whichever worker owns it to abort the
    // stream. That worker writes the final 'cancelled' status itself.
    await activeJobs.requestCancel(job.id);
  } else {
    // Still waiting (or delayed for a retry) - nothing to interrupt, so this
    // is the one place the API writes a terminal job status directly.
    if (bullJob) await bullJob.remove().catch(() => {});
    await pool.query("UPDATE jobs SET status = 'cancelled', error = NULL WHERE id = ?", [job.id]);
    events.publish({ id: job.id, user_id: req.user.id, status: 'cancelled' });
  }
  res.json({ ok: true });
};

// Stop a running download without losing what it has downloaded so far.
exports.pause = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  const job = rows[0];
  if (!job) throw httpError(404, 'Job not found');
  if (job.status !== 'downloading') {
    throw httpError(409, `Only a downloading job can be paused (this one is ${job.status})`);
  }
  const bullJob = await getBullJob(job.id);
  if (!bullJob || !(await bullJob.isActive())) {
    throw httpError(409, 'This job is not currently running');
  }
  await activeJobs.requestPause(job.id);
  res.json({ ok: true });
};

// Continue a paused download using the partial file it left behind. Falls
// back to a fresh download transparently if the remote server does not
// support (or no longer honours) range requests - see downloadService.
exports.resume = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  const job = rows[0];
  if (!job) throw httpError(404, 'Job not found');
  if (job.status !== 'paused') {
    throw httpError(409, `Only a paused job can be resumed (this one is ${job.status})`);
  }
  if (!job.partial_stored_name) throw httpError(409, 'No partial file to resume from');

  // Re-validate: the target or the allow-list may have changed while paused.
  const { url } = await assertUrlAllowed(job.url);

  const running = await activeJobs.countActive(req.user.id);
  if (running >= env.limits.maxConcurrentPerUser) {
    throw httpError(
      429,
      `You already have ${running} downloads running (limit ${env.limits.maxConcurrentPerUser}). Wait for one to finish.`
    );
  }
  if (env.limits.userQuotaBytes) {
    // Exclude this job's own paused bytes: they are already "spent" on disk,
    // not new usage, so only the bytes still to come need to fit.
    const used = await downloadService.userUsageBytes(req.user.id, { excludeJobId: job.id });
    const quotaRemaining = env.limits.userQuotaBytes - used;
    const stillToDownload =
      job.bytes_total != null ? Math.max(0, job.bytes_total - job.bytes_downloaded) : null;
    if (quotaRemaining <= 0 || (stillToDownload != null && stillToDownload > quotaRemaining)) {
      throw httpError(507, 'Storage quota reached. Delete some files first.');
    }
  }

  // Pausing discards the old BullMQ job but it may still linger in Redis
  // briefly; clear it so the custom job id can be reused.
  const stale = await getBullJob(job.id);
  if (stale) await stale.remove().catch(() => {});

  await pool.query("UPDATE jobs SET status = 'queued', error = NULL WHERE id = ?", [job.id]);
  await addDownloadJob({
    dbJobId: job.id,
    userId: req.user.id,
    url: url.toString(),
    resumeFrom: job.bytes_downloaded,
    partialStoredName: job.partial_stored_name,
    knownTotal: job.bytes_total,
  });

  const [fresh] = await pool.query('SELECT * FROM jobs WHERE id = ?', [job.id]);
  res.json({ job: fresh[0] });
};

// Re-submit a failed download as a brand new job (fresh attempts, fresh row).
exports.retry = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  const original = rows[0];
  if (!original) throw httpError(404, 'Job not found');
  if (original.status !== 'failed') {
    throw httpError(409, `Only a failed job can be retried (this one is ${original.status})`);
  }

  // Re-validate: the target or the allow-list may have changed since the first attempt.
  const { url } = await assertUrlAllowed(original.url);
  const job = await enqueue(req.user.id, url.toString());
  res.status(201).json({ job });
};

// Remove a job's history entry. Only for jobs that are not running or
// resumable - a completed job's FILE is untouched (DELETE /api/files/:id is
// the separate, explicit way to remove the actual file).
const CLEARABLE = ['done', 'failed', 'cancelled'];

exports.remove = async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ? AND user_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  const job = rows[0];
  if (!job) throw httpError(404, 'Job not found');
  if (!CLEARABLE.includes(job.status)) {
    throw httpError(409, `Cancel or pause this job before clearing it (it is ${job.status})`);
  }
  await pool.query('DELETE FROM jobs WHERE id = ?', [job.id]);
  res.json({ ok: true });
};

// Bulk version of the above: clear every done/failed/cancelled job at once.
exports.clearFinished = async (req, res) => {
  const [result] = await pool.query(
    `DELETE FROM jobs WHERE user_id = ? AND status IN (${CLEARABLE.map(() => '?').join(',')})`,
    [req.user.id, ...CLEARABLE]
  );
  res.json({ ok: true, removed: result.affectedRows });
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
    running: await activeJobs.countActive(req.user.id),
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
