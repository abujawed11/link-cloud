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

  // Allow downloads from private/loopback addresses (development only).
  allowPrivateTargets: process.env.ALLOW_PRIVATE_TARGETS === 'true',
};
