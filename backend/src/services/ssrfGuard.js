// SSRF protection: make sure a user-supplied URL can only point at a public host.
//
// Two layers, because DNS can change between the check and the connection
// (DNS rebinding):
//   1. assertUrlAllowed() - scheme/port check plus a DNS resolution whose
//      addresses must all be public. Used before each request in a redirect chain.
//   2. isAllowedAddress() - called again from the custom `lookup` and once more
//      against the real socket address, so the connection itself is verified.
const dns = require('dns').promises;
const net = require('net');
const env = require('../config/env');

const httpError = (status, message) => Object.assign(new Error(message), { status });

// Ports that are not plain web traffic are blocked outright.
const ALLOWED_PORTS = new Set([80, 443, 8080, 8443, 8000, 3000]);

const BLOCKED_V4 = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incl. 169.254.169.254 metadata)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

function v4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
}

function inV4Range(ip, base, bits) {
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}

// Expand an IPv6 address to its 8 hextets so prefixes are easy to test.
function v6Hextets(ip) {
  const zone = ip.indexOf('%');
  let addr = zone === -1 ? ip : ip.slice(0, zone);
  const [head, tail = ''] = addr.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const fill = new Array(Math.max(0, 8 - left.length - right.length)).fill('0');
  const parts = addr.includes('::') ? [...left, ...fill, ...right] : addr.split(':');
  return parts.map((p) => parseInt(p || '0', 16) & 0xffff);
}

function isBlockedV6(ip) {
  const h = v6Hextets(ip);
  if (h.length !== 8) return true;
  const allZero = h.every((x) => x === 0);
  if (allZero) return true; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1 loopback
  // IPv4-mapped / -compatible: judge by the embedded IPv4 address.
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0 || h[5] === 0xffff)) {
    const v4 = `${h[6] >> 8}.${h[6] & 0xff}.${h[7] >> 8}.${h[7] & 0xff}`;
    return !isAllowedAddress(v4);
  }
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if (h[0] === 0xff00 || (h[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentation
  if (h[0] === 0x0064 && h[1] === 0xff9b) return true; // NAT64
  if (h[0] === 0x2002) return true; // 6to4
  return false;
}

function isAllowedAddress(ip) {
  if (env.allowPrivateTargets) return true;
  const version = net.isIP(ip);
  if (version === 4) return !BLOCKED_V4.some(([base, bits]) => inV4Range(ip, base, bits));
  if (version === 6) return !isBlockedV6(ip);
  return false;
}

function parseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw httpError(400, 'Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw httpError(400, 'Only http and https URLs are allowed');
  }
  if (url.username || url.password) {
    throw httpError(400, 'URLs with embedded credentials are not allowed');
  }
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (!ALLOWED_PORTS.has(port)) {
    throw httpError(400, `Port ${port} is not allowed`);
  }
  return url;
}

// Resolve the hostname and require every answer to be a public address.
// Returns the resolved addresses so the caller can reuse them.
async function assertUrlAllowed(raw) {
  const url = parseUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(host)) {
    if (!isAllowedAddress(host)) throw httpError(400, `Address ${host} is not allowed`);
    return { url, addresses: [host] };
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw httpError(400, `Could not resolve host "${host}"`);
  }
  if (records.length === 0) throw httpError(400, `Could not resolve host "${host}"`);
  for (const r of records) {
    if (!isAllowedAddress(r.address)) {
      throw httpError(400, `Host "${host}" resolves to a blocked address`);
    }
  }
  return { url, addresses: records.map((r) => r.address) };
}

module.exports = { assertUrlAllowed, parseUrl, isAllowedAddress, httpError };
