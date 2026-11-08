const env = require('./config/env');
const app = require('./app');
const { ensureStorage } = require('./services/storageService');
const { recoverOrphanedJobs } = require('./db/recovery');

if (!env.jwtSecret || env.jwtSecret === 'change-me') {
  console.error('Set a strong JWT_SECRET in .env');
  process.exit(1);
}
if (env.allowPrivateTargets && env.nodeEnv === 'production') {
  console.error('ALLOW_PRIVATE_TARGETS must not be enabled in production (SSRF risk)');
  process.exit(1);
}
ensureStorage();

// Jobs left mid-flight by a previous run can never finish: clear them out.
recoverOrphanedJobs().catch((err) => console.error('Job recovery failed:', err.message));

const server = app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});
// SSE connections and slow downloads must not be cut by the default header timeout.
server.requestTimeout = 0;
server.headersTimeout = 60000;
