const jwt = require('jsonwebtoken');
const env = require('../config/env');

const COOKIE = 'token';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, env.jwtSecret, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
  }
}

// Same as requireAuth, but also accepts the JWT as a `?token=` query param.
// Only for routes a non-browser client needs to open directly by URL (e.g.
// the desktop player handing a stream URL to LibVLC, which has no access to
// this process's cookie jar) - the browser's cookie-based flow is untouched.
function requireAuthQueryOrCookie(req, res, next) {
  const token = req.cookies[COOKIE] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
  }
}

module.exports = { COOKIE, cookieOptions, signToken, requireAuth, requireAuthQueryOrCookie };
