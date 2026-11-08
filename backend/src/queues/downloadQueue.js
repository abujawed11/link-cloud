// BullMQ queue definition. The API process adds jobs here; the separate
// worker process (src/workers/downloadWorker.js) is what actually runs them.
const { Queue, QueueEvents } = require('bullmq');
const { connection } = require('../config/redis');
const env = require('../config/env');

const QUEUE_NAME = 'downloads';

const downloadQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: env.queue.retryAttempts,
    backoff: { type: 'exponential', delay: env.queue.retryBackoffMs },
    // Keep a little history for debugging; do not grow Redis unbounded.
    removeOnComplete: { age: 24 * 60 * 60, count: 500 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
  },
});

// The API process listens on this to receive the worker's progress pushes
// (job.updateProgress) and re-broadcast them over SSE - see services/queueBridge.js.
const queueEvents = new QueueEvents(QUEUE_NAME, { connection });

// BullMQ rejects a custom job id that looks like a plain integer (it uses
// integer ids internally and refuses to risk a collision), so our MySQL job
// id is prefixed rather than used as-is.
const bullJobId = (dbJobId) => `db-${dbJobId}`;

function addDownloadJob(data) {
  const { dbJobId } = data;
  return downloadQueue.add(
    'download',
    data, // forwarded as-is: {dbJobId, userId, url} plus resumeFrom/partialStoredName/knownTotal when resuming
    { jobId: bullJobId(dbJobId) } // lets us look a BullMQ job up by our own job id
  );
}

function getBullJob(dbJobId) {
  return downloadQueue.getJob(bullJobId(dbJobId));
}

module.exports = { downloadQueue, queueEvents, addDownloadJob, getBullJob, QUEUE_NAME };
