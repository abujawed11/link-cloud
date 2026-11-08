// Forwards the worker's progress pushes (job.updateProgress) into this API
// process's local SSE bus (jobEvents). The worker calls updateProgress for
// every state change, including terminal ones (done/failed/cancelled/queued-
// for-retry) - see downloadService.run() - so 'progress' is the only BullMQ
// event this bridge needs to listen for; jobEvents.publish already knows how
// to tell a terminal snapshot from an in-progress one.
const { queueEvents } = require('../queues/downloadQueue');
const jobEvents = require('./jobEvents');

function start() {
  queueEvents.on('progress', ({ data }) => {
    // Some BullMQ/Redis client versions hand this back as a JSON string.
    const snapshot = typeof data === 'string' ? JSON.parse(data) : data;
    if (snapshot && snapshot.id != null) jobEvents.publish(snapshot);
  });
  queueEvents.on('error', (err) => console.error('QueueEvents error:', err.message));
}

module.exports = { start };
