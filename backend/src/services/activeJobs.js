// Tracks which jobs are actually running right now, split across the two
// things that differ between the API and worker processes:
//
//   - per-user concurrency count: a Redis sorted set (score = start time), so
//     both processes see the same number and a crashed worker self-heals -
//     stale entries are evicted by age rather than needing an explicit cleanup.
//   - the AbortController for a running download: this can only live inside
//     the worker process that owns the stream. Cancelling or pausing from the
//     API process means publishing a message here and letting the worker's
//     own subscriber (started once, in the worker) react to it.
const env = require('../config/env');
const { client } = require('../config/redis');

const CANCEL_CHANNEL = 'job-cancel';
const PAUSE_CHANNEL = 'job-pause';
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

// --- Worker-local cancellation / pause --------------------------------------

function registerController(jobId, controller) {
  controllers.set(Number(jobId), controller);
}

function unregisterController(jobId) {
  controllers.delete(Number(jobId));
}

function abortLocal(jobId, reason) {
  const controller = controllers.get(Number(jobId));
  if (!controller) return false;
  controller.abort(reason);
  return true;
}

// Tagged reasons so downloadService (which only sees an AbortError) can tell
// a cancel, a pause and a real failure apart.
function cancelLocal(jobId) {
  return abortLocal(jobId, Object.assign(new Error('Cancelled'), { cancelled: true, retryable: false }));
}

function pauseLocal(jobId) {
  return abortLocal(jobId, Object.assign(new Error('Paused'), { paused: true, retryable: false }));
}

// Called once, at worker boot, so a cancel/pause request from the API process
// (a different process, maybe a different machine) reaches the right download.
function listenForSignals() {
  const sub = client.duplicate(); // a subscriber connection can issue no other commands
  sub
    .subscribe(CANCEL_CHANNEL, PAUSE_CHANNEL)
    .catch((err) => console.error('Signal subscribe failed:', err.message));
  sub.on('message', (channel, jobId) => {
    if (channel === CANCEL_CHANNEL) cancelLocal(jobId);
    else if (channel === PAUSE_CHANNEL) pauseLocal(jobId);
  });
  return () => sub.disconnect();
}

// Called from the API process to ask whichever worker owns this job to stop.
// Returns true only if something is actually listening (best-effort: workers
// may be on a different box, so publish succeeding is not a guarantee).
async function requestCancel(jobId) {
  return (await client.publish(CANCEL_CHANNEL, String(jobId))) > 0;
}

async function requestPause(jobId) {
  return (await client.publish(PAUSE_CHANNEL, String(jobId))) > 0;
}

module.exports = {
  countActive,
  markStarted,
  markFinished,
  registerController,
  unregisterController,
  cancelLocal,
  pauseLocal,
  listenForSignals,
  requestCancel,
  requestPause,
};
