const pool = require('../config/db');
const env = require('../config/env');
const { getBullJob } = require('../queues/downloadQueue');
const storage = require('../services/storageService');

// Phase 3: downloads run in a separate worker process, so an API restart no
// longer kills anything - BullMQ still has the job and the worker (if it is
// still up) keeps going. The only thing that can leave a DB row stuck in
// 'queued'/'downloading' forever is BullMQ itself losing track of the job
// (Redis data wiped, or a job removed outside the API's own cancel path).
// So: reconcile against the queue instead of blindly failing every such row.
async function recoverOrphanedJobs() {
  const [rows] = await pool.query(
    "SELECT id FROM jobs WHERE status IN ('queued', 'downloading')"
  );

  let orphaned = 0;
  for (const row of rows) {
    const bullJob = await getBullJob(row.id);
    if (bullJob) continue; // BullMQ still knows about it; leave it alone
    await pool.query(
      "UPDATE jobs SET status = 'failed', error = 'Lost track of this job (queue data was reset)' WHERE id = ?",
      [row.id]
    );
    orphaned += 1;
  }
  if (orphaned > 0) console.log(`Marked ${orphaned} orphaned job(s) as failed`);
  return orphaned;
}

// A paused job's partial file sits on disk (and against the user's quota)
// indefinitely otherwise. Anything left paused too long is dropped, the same
// way the API's own cancel-a-paused-job path does it.
async function expireStalePaused() {
  const [rows] = await pool.query(
    "SELECT id, partial_stored_name FROM jobs WHERE status = 'paused' AND updated_at < (NOW() - INTERVAL ? SECOND)",
    [Math.round(env.queue.pausedExpiryMs / 1000)]
  );
  for (const row of rows) {
    if (row.partial_stored_name) await storage.removeFile(row.partial_stored_name).catch(() => {});
    await pool.query(
      "UPDATE jobs SET status = 'cancelled', error = 'Paused download expired', partial_stored_name = NULL WHERE id = ?",
      [row.id]
    );
  }
  if (rows.length > 0) console.log(`Expired ${rows.length} stale paused job(s)`);
  return rows.length;
}

module.exports = { recoverOrphanedJobs, expireStalePaused };
