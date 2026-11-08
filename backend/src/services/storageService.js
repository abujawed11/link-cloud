const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');

const storageRoot = path.resolve(env.storageDir);

// Windows reserves these names (with or without an extension) regardless of
// case - CON, CON.txt, com1.mkv etc. all behave oddly or fail outright.
const RESERVED_WINDOWS_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

function ensureStorage() {
  fs.mkdirSync(storageRoot, { recursive: true });
}

// A real extension makes files browsable/openable straight from the storage
// folder (e.g. in Explorer) without exposing anything about the original
// name. Only a short alphanumeric suffix is trusted; anything else (an
// extension-looking string pulled from an untrusted filename) is dropped
// rather than appended to a path we construct.
function safeExtension(ext) {
  const match = /^\.[a-zA-Z0-9]{1,10}$/.exec(String(ext || ''));
  return match ? match[0].toLowerCase() : '';
}

// Fallback for when nothing usable is known about the file at all.
function newStoredName(ext) {
  return crypto.randomUUID() + safeExtension(ext);
}

function filePath(storedName) {
  // Guard against traversal regardless of where the name came from (a random
  // id, or - since stored names are now the sanitised real filename - text
  // that ultimately traces back to a remote server's response headers).
  const full = path.resolve(storageRoot, path.basename(storedName));
  if (path.dirname(full) !== storageRoot) throw new Error('Invalid stored name');
  return full;
}

// Strip path separators, control chars and reserved characters so the result
// is safe to use directly as a filename - not just inside Content-Disposition
// (where it always went) but now as the actual on-disk name too.
function sanitizeFilename(name) {
  let clean = String(name || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  if (clean.length > 200) {
    const ext = path.extname(clean).slice(0, 20);
    clean = clean.slice(0, 200 - ext.length) + ext;
  }
  // Windows silently drops trailing dots/spaces, which would desync the name
  // we think we wrote from the name actually on disk.
  clean = clean.replace(/[.\s]+$/, '');

  if (!clean) return 'download';

  const ext = path.extname(clean);
  const stem = clean.slice(0, clean.length - ext.length);
  if (RESERVED_WINDOWS_NAMES.has(stem.toLowerCase())) {
    clean = `_${stem}${ext}`;
  }
  return clean;
}

// Picks an on-disk name close to `preferredName` that nothing is using yet,
// so most downloads land under their real name; " (1)", " (2)", ... are
// appended only on an actual collision, the same convention Explorer uses.
// Not perfectly race-proof (a second download finishing the exact same
// millisecond could in principle pick the same candidate) - acceptable here
// since this app is not meant to serve heavy concurrent traffic; the write
// stream is still opened safely regardless of which name wins.
function uniqueStoredName(preferredName) {
  const clean = sanitizeFilename(preferredName);
  const ext = path.extname(clean);
  const stem = clean.slice(0, clean.length - ext.length) || 'download';

  for (let n = 0; n <= 9999; n++) {
    const candidate = n === 0 ? clean : `${stem} (${n})${ext}`;
    if (!fs.existsSync(filePath(candidate))) return candidate;
  }
  // Astronomically unlikely, but never loop forever or silently overwrite.
  return `${stem}-${crypto.randomUUID()}${ext}`;
}

// Free bytes on the volume holding the storage directory.
async function freeBytes() {
  try {
    const stats = await fs.promises.statfs(storageRoot);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null; // unknown: callers treat this as "do not block"
  }
}

// Does writing `bytes` more keep us above the configured free-space floor?
async function hasRoomFor(bytes) {
  const free = await freeBytes();
  if (free === null) return { ok: true, free: null };
  const needed = Number(bytes || 0) + env.limits.minFreeDiskBytes;
  return { ok: free >= needed, free };
}

async function removeFile(storedName) {
  try {
    await fs.promises.unlink(filePath(storedName));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = {
  ensureStorage,
  newStoredName,
  uniqueStoredName,
  filePath,
  sanitizeFilename,
  safeExtension,
  removeFile,
  freeBytes,
  hasRoomFor,
  storageRoot,
};
