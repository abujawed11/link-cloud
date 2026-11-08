require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'link_cloud',
  },
  jwtSecret: process.env.JWT_SECRET || '',
  allowRegistration: process.env.ALLOW_REGISTRATION === 'true',
  storageDir: process.env.STORAGE_DIR || './storage',
};
