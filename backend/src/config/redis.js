const IORedis = require('ioredis');
const env = require('../config/env');

// Plain options object - BullMQ's Queue/Worker/QueueEvents each open their OWN
// connection from this. Sharing one ioredis instance across them is unsafe:
// Worker uses blocking commands internally that would starve other consumers.
const connection = {
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  db: env.redis.db,
  // Required by BullMQ so it can manage retries itself.
  maxRetriesPerRequest: null,
};

// One shared connection for everything that is NOT BullMQ internals: our own
// per-user concurrency counters and the cancel pub/sub trigger. Plain
// GET/SET/ZADD/PUBLISH calls are safe to share.
const client = new IORedis(connection);
client.on('error', (err) => console.error('Redis client error:', err.message));

module.exports = { connection, client };
