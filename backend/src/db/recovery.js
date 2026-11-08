const pool = require('../config/db');
const { getBullJob } = require('../queues/downloadQueue');

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
  if (rows.length === 0) return 0;

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

module.exports = { recoverOrphanedJobs };
