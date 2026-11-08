const env = require('./config/env');
const app = require('./app');
const { ensureStorage } = require('./services/storageService');

if (!env.jwtSecret || env.jwtSecret === 'change-me') {
  console.error('Set a strong JWT_SECRET in .env');
  process.exit(1);
}
ensureStorage();

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});
