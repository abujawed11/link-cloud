// Tracks which jobs are actually running right now, split across the two
// things that differ between the API and worker processes:
//
//   - per-user concurrency count: a Redis sorted set (score = start time), so
//     both processes see the same number and a crashed worker self-heals -
//     stale entries are evicted by age rather than needing an explicit cleanup.
//   - the AbortController for a running download: this can only live inside
//     the worker process that owns the stream. Cancelling from the API process
//     means publishing a message here and letting the worker's own subscriber
//     (started once, in the worker) react to it.
const env = require('../config/env');
const { client } = require('../config/redis');

const CANCEL_CHANNEL = 'job-cancel';
const activeKey = (userId) => `active:user:${userId}`;

const controllers = new Map(); // jobId -> AbortController (worker process only)

// --- Redis-backed per-user concurrency -------------------------------------

async function countActive(userId) {
  const key = activeKey(userId);
  const cutoff = Date.now() - env.queue.staleActiveMs;
  await client.zremrangebyscore(key, '-inf', cutoff); // evict crashed-worker leftovers
  return client.zcard(key);
}

async function markStarted(userId, jobId) {
  await client.zadd(activeKey(userId), Date.now(), String(jobId));
}

async function markFinished(userId, jobId) {
  await client.zrem(activeKey(userId), String(jobId));
}

// --- Worker-local cancellation ----------------------------------------------

function registerController(jobId, controller) {
  controllers.set(Number(jobId), controller);
}

function unregisterController(jobId) {
  controllers.delete(Number(jobId));
}

function cancelLocal(jobId) {
  const controller = controllers.get(Number(jobId));
  if (!controller) return false;
  // Tagged reason so downloadService can tell a cancel from a real failure.
  controller.abort(Object.assign(new Error('Cancelled'), { cancelled: true }));
  return true;
}

// Called once, at worker boot, so a cancel request from the API process (a
// different process, maybe a different machine) reaches the right download.
function listenForCancels() {
  const sub = client.duplicate(); // a subscriber connection can issue no other commands
  sub.subscribe(CANCEL_CHANNEL).catch((err) => console.error('Cancel subscribe failed:', err));
  sub.on('message', (_channel, jobId) => cancelLocal(jobId));
  return () => sub.disconnect();
}

// Called from the API process to ask whichever worker owns this job to stop.
// Returns true only if something is actually listening (best-effort: workers
// may be on a different box, so publish succeeding is not a guarantee).
async function requestCancel(jobId) {
  const subscribers = await client.publish(CANCEL_CHANNEL, String(jobId));
  return subscribers > 0;
}

module.exports = {
  countActive,
  markStarted,
  markFinished,
  registerController,
  unregisterController,
  cancelLocal,
  listenForCancels,
  requestCancel,
};
