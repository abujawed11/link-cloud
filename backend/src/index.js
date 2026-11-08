const env = require('./config/env');
const app = require('./app');
const { ensureStorage } = require('./services/storageService');
const { recoverOrphanedJobs, expireStalePaused } = require('./db/recovery');
const queueBridge = require('./services/queueBridge');

if (!env.jwtSecret || env.jwtSecret === 'change-me') {
  console.error('Set a strong JWT_SECRET in .env');
  process.exit(1);
}
if (env.allowPrivateTargets && env.nodeEnv === 'production') {
  console.error('ALLOW_PRIVATE_TARGETS must not be enabled in production (SSRF risk)');
  process.exit(1);
}
ensureStorage();

// Forward the worker's progress pushes (via BullMQ) into this process's SSE bus.
queueBridge.start();

// Reconcile DB rows against the queue: see db/recovery.js for why this is no
// longer "every downloading row is dead" like it was before the worker split out.
// SKIP_RECOVERY=true lets a test instance share the real database without its
// boot-time sweep touching rows it does not own (it has no way to tell "no
// matching queue job" apart from "a different environment's queue").
if (process.env.SKIP_RECOVERY !== 'true') {
  recoverOrphanedJobs().catch((err) => console.error('Job recovery failed:', err.message));
  expireStalePaused().catch((err) => console.error('Paused-job sweep failed:', err.message));
}

const server = app.listen(env.port, '127.0.0.1', () => {
  console.log(`API listening on http://127.0.0.1:${env.port}`);
});
// SSE connections and slow downloads must not be cut by the default header timeout.
server.requestTimeout = 0;
server.headersTimeout = 60000;
