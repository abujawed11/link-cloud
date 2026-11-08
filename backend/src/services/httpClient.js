// HTTP(S) GET that is safe to point at a user-supplied URL.
//
// Uses node:http/https rather than fetch so we can:
//   - pass a custom DNS `lookup` that rejects private addresses,
//   - inspect the real socket address after connecting (blocks DNS rebinding),
//   - follow redirects one at a time, re-validating every hop,
//   - apply a connect/header timeout separate from the idle-data timeout.
const http = require('http');
const https = require('https');
const dns = require('dns');
const { URL } = require('url');
const env = require('../config/env');
const { assertUrlAllowed, isAllowedAddress, httpError } = require('./ssrfGuard');

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

// DNS lookup wrapper that refuses to hand a blocked address to the socket.
function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);
    const list = Array.isArray(address) ? address : [{ address, family }];
    for (const entry of list) {
      if (!isAllowedAddress(entry.address)) {
        return callback(
          Object.assign(new Error(`Host "${hostname}" resolves to a blocked address`), {
            status: 400,
            retryable: false,
          })
        );
      }
    }
    return Array.isArray(address) ? callback(null, address) : callback(null, address, family);
  });
}

function requestOnce(url, { signal }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        lookup: guardedLookup,
        headers: {
          'user-agent': 'link-cloud/1.0',
          accept: '*/*',
          // Ask for the whole file; some servers need an explicit identity encoding
          // to report a usable content-length.
          'accept-encoding': 'identity',
        },
      },
      (res) => resolve({ res, req })
    );

    // Verify the address we actually connected to, not just what DNS said.
    req.on('socket', (socket) => {
      const check = () => {
        const addr = socket.remoteAddress;
        if (addr && !isAllowedAddress(addr)) {
          req.destroy(httpError(400, `Connection to ${addr} is not allowed`));
        }
      };
      if (socket.remoteAddress) check();
      else socket.once('connect', check);
    });

    req.setTimeout(env.limits.connectTimeoutMs, () => {
      req.destroy(httpError(504, 'Timed out waiting for the remote server', { retryable: true }));
    });
    req.on('error', (err) => reject(Object.assign(err, { retryable: err.retryable ?? true })));
    if (signal) {
      const cancelled = () =>
        Object.assign(httpError(499, 'Cancelled', { retryable: false }), { cancelled: true });
      if (signal.aborted) return req.destroy(cancelled());
      signal.addEventListener('abort', () => req.destroy(cancelled()), { once: true });
    }
    req.end();
  });
}

/**
 * GET a URL, following (and re-validating) redirects.
 * Resolves to { res, finalUrl } where `res` is a readable IncomingMessage whose
 * headers have arrived. The caller owns the stream and must consume or destroy it.
 */
async function safeGet(startUrl, { signal } = {}) {
  let target = (await assertUrlAllowed(startUrl)).url;
  const seen = new Set([target.toString()]);

  for (let hop = 0; hop <= env.limits.maxRedirects; hop += 1) {
    const { res, req } = await requestOnce(target, { signal });

    if (!REDIRECT_CODES.has(res.statusCode)) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); // drain so the socket can be released
        // A remote 5xx might recover; a 4xx (dead link, forbidden, ...) will not.
        throw httpError(
          502,
          `Remote server responded ${res.statusCode} ${res.statusMessage || ''}`.trim(),
          { retryable: res.statusCode >= 500 }
        );
      }
      // Headers are in; the connect timeout must not fire mid-download.
      req.setTimeout(0);
      return { res, finalUrl: target.toString() };
    }

    const location = res.headers.location;
    res.resume();
    req.destroy();
    if (!location) throw httpError(502, `Remote server sent ${res.statusCode} without a location`);

    let next;
    try {
      next = new URL(location, target);
    } catch {
      throw httpError(502, 'Remote server sent an invalid redirect');
    }
    if (seen.has(next.toString())) throw httpError(502, 'Redirect loop detected');
    seen.add(next.toString());
    target = (await assertUrlAllowed(next.toString())).url; // re-check every hop
  }

  throw httpError(502, `Too many redirects (limit ${env.limits.maxRedirects})`);
}

module.exports = { safeGet };
