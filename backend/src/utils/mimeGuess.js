const path = require('path');

// Remote servers frequently send a generic or missing Content-Type for
// media files (application/octet-stream, binary/octet-stream, or nothing at
// all). When that happens we fall back to guessing from the file extension
// so the UI can still tell a video/audio/image apart from an arbitrary blob.
const GENERIC_TYPES = new Set(['application/octet-stream', 'binary/octet-stream', '']);

const BY_EXT = {
  // video
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.3gp': 'video/3gpp',
  // audio
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.weba': 'audio/webm',
  // image
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

// Given the Content-Type a remote server sent (possibly null/generic) and
// the filename, returns the best mime type to store/serve.
function guessMime(contentType, filename) {
  const normalized = (contentType || '').split(';')[0].trim().toLowerCase();
  if (!GENERIC_TYPES.has(normalized)) return normalized || null;

  const ext = path.extname(filename || '').toLowerCase();
  return BY_EXT[ext] || normalized || null;
}

module.exports = { guessMime, GENERIC_TYPES, BY_EXT };
