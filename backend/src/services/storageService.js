const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');

const storageRoot = path.resolve(env.storageDir);

function ensureStorage() {
  fs.mkdirSync(storageRoot, { recursive: true });
}

// Random, safe on-disk name. The original name is kept only in the DB.
function newStoredName() {
  return crypto.randomUUID();
}

function filePath(storedName) {
  // stored names are UUIDs we generate; still guard against traversal
  const full = path.resolve(storageRoot, path.basename(storedName));
  if (path.dirname(full) !== storageRoot) throw new Error('Invalid stored name');
  return full;
}

// Strip path separators, control chars and reserved characters.
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
  return clean || 'download';
}

async function removeFile(storedName) {
  try {
    await fs.promises.unlink(filePath(storedName));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = { ensureStorage, newStoredName, filePath, sanitizeFilename, removeFile };
