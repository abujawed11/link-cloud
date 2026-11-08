// In-memory view of downloads running inside *this* process:
//   - live progress (bytes, percent, speed) published far more often than we
//     are willing to write to MySQL,
//   - an AbortController per running job, which also gives us the per-user
//     concurrency count (and a cancel hook for Phase 3),
//   - a tiny pub/sub the SSE endpoint subscribes to.
//
// Phase 3 note: once the worker is a separate process this state must move to
// Redis (BullMQ events) - the API process will no longer run the downloads.
const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(0);

const live = new Map(); // jobId -> progress snapshot
const active = new Map(); // jobId -> { userId, controller }

function registerActive(jobId, userId, controller) {
  active.set(Number(jobId), { userId: Number(userId), controller });
}

function unregisterActive(jobId) {
  active.delete(Number(jobId));
}

function activeCount(userId) {
  let n = 0;
  for (const entry of active.values()) if (entry.userId === Number(userId)) n += 1;
  return n;
}

function cancel(jobId) {
  const entry = active.get(Number(jobId));
  if (!entry) return false;
  // Tagged reason so downloadService can tell a cancel from a real failure.
  entry.controller.abort(Object.assign(new Error('Cancelled'), { cancelled: true }));
  return true;
}

function publish(snapshot) {
  const id = Number(snapshot.id);
  const terminal = ['done', 'failed', 'cancelled'].includes(snapshot.status);
  if (terminal) live.delete(id);
  else live.set(id, { ...live.get(id), ...snapshot, id });
  bus.emit('progress', terminal ? snapshot : live.get(id));
}

function snapshot(jobId) {
  return live.get(Number(jobId)) || null;
}

// Overlay live numbers on a DB row so polling clients see fresh values too.
function withLive(row) {
  const s = live.get(Number(row.id));
  if (!s || row.status === 'done' || row.status === 'failed') return row;
  return {
    ...row,
    status: s.status || row.status,
    progress: s.progress ?? row.progress,
    bytes_downloaded: s.bytes_downloaded ?? row.bytes_downloaded,
    bytes_total: s.bytes_total ?? row.bytes_total,
    speed_bps: s.speed_bps ?? null,
  };
}

function subscribe(userId, listener) {
  const id = Number(userId);
  const handler = (snap) => {
    if (snap && Number(snap.user_id) === id) listener(snap);
  };
  bus.on('progress', handler);
  return () => bus.off('progress', handler);
}

module.exports = {
  registerActive,
  unregisterActive,
  activeCount,
  cancel,
  publish,
  snapshot,
  withLive,
  subscribe,
};
