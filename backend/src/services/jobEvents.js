// Live progress for the API process's SSE endpoint. The downloads themselves
// run in a separate worker process (Phase 3); the worker reports progress via
// BullMQ's job.updateProgress(), and services/queueBridge.js forwards each
// update into publish() below so this module never needs to know whether the
// snapshot came from across a process boundary or (in tests) a direct call.
const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(0);

const live = new Map(); // jobId -> progress snapshot

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
  if (!s || ['done', 'failed', 'cancelled'].includes(row.status)) return row;
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
  publish,
  snapshot,
  withLive,
  subscribe,
};
