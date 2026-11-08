const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const env = require('../config/env');

const message = (text) => ({ error: text });

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Development reloads the page a lot; keep the limits but make them roomy.
  skip: () => env.nodeEnv === 'test',
};

// Brute-force protection on credentials. Counts only failed attempts.
const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: message('Too many attempts. Try again in a few minutes.'),
});

// Stops a logged-in account from firing hundreds of downloads at the server.
const jobLimiter = rateLimit({
  ...base,
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => (req.user ? `u${req.user.id}` : ipKeyGenerator(req.ip)),
  message: message('Too many downloads started. Wait a few minutes.'),
});

// Broad backstop for everything else.
const apiLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 300,
  message: message('Too many requests.'),
});

module.exports = { authLimiter, jobLimiter, apiLimiter };
