const fs = require('fs');
const env = require('./config/env');
const app = require('./app');

fs.mkdirSync(env.storageDir, { recursive: true });

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});
