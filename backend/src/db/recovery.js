const pool = require('../config/db');

// Downloads run inside this process (Phase 2), so a restart kills them. Any job
// left as queued/downloading in the DB can never make progress again: mark it
// failed at boot so the UI does not show a frozen progress bar.
// Phase 3: BullMQ will own this - stalled jobs get retried by the worker instead.
async function recoverOrphanedJobs() {
  const [result] = await pool.query(
    `UPDATE jobs
        SET status = 'failed',
            error = 'Interrupted by a server restart'
      WHERE status IN ('queued', 'downloading')`
  );
  if (result.affectedRows > 0) {
    console.log(`Marked ${result.affectedRows} interrupted job(s) as failed`);
  }
  return result.affectedRows;
}

module.exports = { recoverOrphanedJobs };
