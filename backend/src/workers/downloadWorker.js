// Separate process (run via `npm run worker` or PM2) that actually performs
// downloads. The API process only ever enqueues; this is the only thing that
// calls downloadService.run(). Splitting it out means an API restart (a
// deploy, a crash) no longer kills an in-flight download - only a worker
// restart does, and BullMQ's own retry/attempts bookkeeping covers that.
const { Worker } = require('bullmq');
const env = require('../config/env');
const { connection } = require('../config/redis');
const { QUEUE_NAME } = require('../queues/downloadQueue');
const { ensureStorage } = require('../services/storageService');
const downloadService = require('../services/downloadService');
const activeJobs = require('../services/activeJobs');

if (env.allowPrivateTargets && env.nodeEnv === 'production') {
  console.error('ALLOW_PRIVATE_TARGETS must not be enabled in production (SSRF risk)');
  process.exit(1);
}
ensureStorage();

// So a cancel request from the API process (same box or not) reaches whichever
// attempt of whichever job is actually running here.
const stopListeningForCancels = activeJobs.listenForCancels();

const worker = new Worker(
  QUEUE_NAME,
  async (bullJob) => {
    const { dbJobId, userId, url } = bullJob.data;
    const job = { id: dbJobId, user_id: userId, url };
    const reporter = { progress: (snapshot) => bullJob.updateProgress(snapshot) };

    try {
      return await downloadService.run(job, reporter);
    } catch (err) {
      const cancelled = err?.cancelled === true;
      const retryable = !cancelled && err?.retryable !== false;
      // attemptsMade here is the count BEFORE this attempt; BullMQ increments it
      // for *this* attempt only after the processor's promise rejects, so the
      // final count this failure will be recorded under is attemptsMade + 1.
      const attemptsAfterThis = bullJob.attemptsMade + 1;
      const exhausted = attemptsAfterThis >= (bullJob.opts.attempts || 1);
      const willRetry = retryable && !exhausted;

      const message = String(err?.message || 'Download failed').slice(0, 1000);
      const status = cancelled ? 'cancelled' : willRetry ? 'queued' : 'failed';

      await downloadService
        .updateJob(dbJobId, {
          status,
          error: cancelled ? null : message,
          progress: 0,
          bytes_downloaded: 0,
          bytes_total: null,
        })
        .catch((dbErr) => console.error(`Job ${dbJobId}: DB update failed:`, dbErr.message));

      await bullJob.updateProgress({ id: dbJobId, user_id: userId, status, error: message }).catch(() => {});

      if (!willRetry) {
        // Tell BullMQ not to retry: we already decided (cancelled, non-retryable,
        // or genuinely out of attempts) and wrote the final DB status ourselves.
        await bullJob.discard().catch(() => {});
      } else {
        console.warn(
          `Job ${dbJobId} attempt ${attemptsAfterThis}/${bullJob.opts.attempts} failed, will retry: ${message}`
        );
      }
      throw err;
    }
  },
  { connection, concurrency: env.queue.maxConcurrentGlobal }
);

worker.on('error', (err) => console.error('Worker error:', err.message));
worker.on('completed', (bullJob) => console.log(`Job ${bullJob.data.dbJobId} done`));
worker.on('failed', (bullJob, err) => {
  if (err?.cancelled) console.log(`Job ${bullJob?.data?.dbJobId} cancelled`);
});

console.log(`Download worker started (concurrency ${env.queue.maxConcurrentGlobal})`);

async function shutdown() {
  console.log('Worker shutting down...');
  stopListeningForCancels();
  await worker.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
