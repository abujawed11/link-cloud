require('dotenv').config();

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const MB = 1024 * 1024;

module.exports = {
  port: num(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'link_cloud',
  },
  jwtSecret: process.env.JWT_SECRET || '',
  allowRegistration: process.env.ALLOW_REGISTRATION === 'true',
  storageDir: process.env.STORAGE_DIR || './storage',

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: num(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: num(process.env.REDIS_DB, 0),
  },

  // Phase 2 limits
  limits: {
    // Largest single file we will store.
    maxFileBytes: num(process.env.MAX_FILE_MB, 2048) * MB,
    // Total bytes one user may keep on disk (0 = unlimited).
    userQuotaBytes: num(process.env.USER_QUOTA_MB, 10240) * MB,
    // Refuse to start / abort a download if free disk would drop below this.
    minFreeDiskBytes: num(process.env.MIN_FREE_DISK_MB, 1024) * MB,
    // Downloads running at once, per user.
    maxConcurrentPerUser: num(process.env.MAX_CONCURRENT_PER_USER, 3) || 3,
    // Time to establish the connection and receive response headers.
    connectTimeoutMs: num(process.env.CONNECT_TIMEOUT_MS, 15000),
    // Abort if no bytes arrive for this long.
    idleTimeoutMs: num(process.env.IDLE_TIMEOUT_MS, 60000),
    // Hard cap on total download time (0 = none).
    totalTimeoutMs: num(process.env.TOTAL_TIMEOUT_MS, 6 * 60 * 60 * 1000),
    maxRedirects: num(process.env.MAX_REDIRECTS, 5),
  },

  // Phase 3: the worker process and its queue
  queue: {
    // Downloads running at once across ALL users, inside one worker process.
    maxConcurrentGlobal: num(process.env.MAX_CONCURRENT_GLOBAL, 5) || 5,
    // Attempts per job (including the first) before it is marked permanently failed.
    retryAttempts: num(process.env.RETRY_ATTEMPTS, 3) || 1,
    // Base delay for BullMQ's exponential backoff between attempts.
    retryBackoffMs: num(process.env.RETRY_BACKOFF_MS, 10000),
    // How long a stale per-user concurrency entry survives a crashed worker
    // before it is evicted (must exceed totalTimeoutMs).
    staleActiveMs: num(process.env.STALE_ACTIVE_MS, 0) || 6 * 60 * 60 * 1000 + 5 * 60 * 1000,
    // A paused download's partial file (and the quota it ties up) is dropped
    // if nobody resumes or cancels it within this long.
    pausedExpiryMs: num(process.env.PAUSED_EXPIRY_MS, 0) || 24 * 60 * 60 * 1000,
  },

  // Allow downloads from private/loopback addresses (development only).
  allowPrivateTargets: process.env.ALLOW_PRIVATE_TARGETS === 'true',
};
