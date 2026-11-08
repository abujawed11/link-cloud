// Streaming download logic. Deliberately decoupled from BullMQ: the worker
// (src/workers/downloadWorker.js) is the only thing that knows this runs
// inside a queue. It passes a `reporter` with one method, `progress(snapshot)`,
// which the worker wires to `bullJob.updateProgress()`; the worker also makes
// the retry/fail decision after `run()` throws, because that decision needs
// BullMQ's attempt count, which this module has no business knowing. A pause,
// however, is unconditional and is written to the DB directly from here, the
// same as a success - see the 'paused' branch below.
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const pool = require('../config/db');
const env = require('../config/env');
const storage = require('./storageService');
const { safeGet } = require('./httpClient');
const { httpError } = require('./ssrfGuard');
const activeJobs = require('./activeJobs');

const DB_WRITE_INTERVAL_MS = 1000; // how often progress reaches MySQL
const EVENT_INTERVAL_MS = 500; // how often progress reaches the reporter (-> SSE)
const SPEED_WINDOW_MS = 5000; // sliding window used for speed and ETA
const DISK_RECHECK_MS = 10000; // re-check free space while streaming

const EXT_BY_MIME = {
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/gzip': '.gz',
  'application/x-tar': '.tar',
  'application/x-7z-compressed': '.7z',
  'application/vnd.rar': '.rar',
  'application/json': '.json',
  'application/epub+zip': '.epub',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'text/html': '.html',
  'video/mp4': '.mp4',
  'video/x-matroska': '.mkv',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/flac': '.flac',
  'audio/ogg': '.ogg',
};

const formatMb = (bytes) => `${Math.round(Number(bytes) / (1024 * 1024))} MB`;

function nameFromContentDisposition(header) {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through to the plain filename form */
    }
  }
  const plain = /filename\s*=\s*("([^"]+)"|[^;]+)/i.exec(header);
  return plain ? (plain[2] || plain[1]).trim() : null;
}

function nameFromUrl(url) {
  try {
    const base = path.posix.basename(new URL(url).pathname);
    return base ? decodeURIComponent(base) : null;
  } catch {
    return null;
  }
}

// Content-Disposition, then the final URL's path, then the original URL.
// If the resulting name has no extension but the MIME type implies one, add it.
function pickFilename({ disposition, finalUrl, sourceUrl, contentType }) {
  const mime = String(contentType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const raw =
    nameFromContentDisposition(disposition) || nameFromUrl(finalUrl) || nameFromUrl(sourceUrl);
  let name = storage.sanitizeFilename(raw) || 'download';
  const ext = EXT_BY_MIME[mime];
  if (ext && !path.extname(name)) name += ext;
  return name;
}

async function updateJob(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sql = `UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  await pool.query(sql, [...keys.map((k) => fields[k]), id]);
}

// Bytes that count against this user's quota: completed files, plus whatever
// is sitting in OTHER paused downloads' partial files (excludeJobId lets a job
// check its own quota room without double-counting its own paused bytes).
async function userUsageBytes(userId, { excludeJobId } = {}) {
  const [[filesRow]] = await pool.query(
    'SELECT COALESCE(SUM(size_bytes), 0) AS total FROM files WHERE user_id = ?',
    [userId]
  );
  const pausedParams = excludeJobId ? [userId, excludeJobId] : [userId];
  const [[pausedRow]] = await pool.query(
    `SELECT COALESCE(SUM(bytes_downloaded), 0) AS total FROM jobs
     WHERE user_id = ? AND status = 'paused'${excludeJobId ? ' AND id != ?' : ''}`,
    pausedParams
  );
  return Number(filesRow.total) + Number(pausedRow.total);
}

// Checks that must pass before writing (more) bytes. `fullTotal` is the whole
// file's size if known; `alreadyOnDisk` is how much of it (if any) is already
// written, from a previous paused attempt - only the gap needs quota/disk room.
async function assertCanStore(userId, fullTotal, { alreadyOnDisk = 0, excludeJobId } = {}) {
  const { maxFileBytes, userQuotaBytes } = env.limits;
  if (fullTotal && maxFileBytes && fullTotal > maxFileBytes) {
    throw httpError(413, `File is larger than the ${formatMb(maxFileBytes)} limit`);
  }

  const remainingToWrite = fullTotal != null ? Math.max(0, fullTotal - alreadyOnDisk) : null;

  let quotaRemaining = null;
  if (userQuotaBytes) {
    const used = await userUsageBytes(userId, { excludeJobId });
    quotaRemaining = userQuotaBytes - used;
    if (quotaRemaining <= 0 || (remainingToWrite != null && remainingToWrite > quotaRemaining)) {
      throw httpError(
        507,
        `Storage quota reached (${formatMb(used)} of ${formatMb(userQuotaBytes)} used)`
      );
    }
  }

  // Disk space can free up by the next attempt, so this one is worth retrying.
  const room = await storage.hasRoomFor(remainingToWrite || 0);
  if (!room.ok) throw httpError(507, 'Not enough free disk space on the server', { retryable: true });

  return { quotaRemaining };
}

// An AbortError hides the real reason; surface whatever triggered the abort.
function normalizeAbort(err, controller) {
  if (err?.name !== 'AbortError' && err?.code !== 'ABORT_ERR') return err;
  const reason = controller.signal.reason;
  if (reason instanceof Error && reason.name !== 'AbortError') return reason;
  return Object.assign(new Error('Download cancelled'), { cancelled: true, retryable: false });
}

// Opens the remote stream, handling resume negotiation: tries a Range request
// when resuming, and transparently falls back to a fresh full download if the
// server doesn't honour it (ignores Range and sends everything again, or
// 416s because the file changed since we paused).
async function openStream(job, controller) {
  const resuming = Boolean(job.resumeFrom && job.partialStoredName);

  async function fresh() {
    const { res, finalUrl } = await safeGet(job.url, { signal: controller.signal });
    const declared = Number(res.headers['content-length']);
    return {
      res,
      finalUrl,
      mode: 'fresh',
      storedName: storage.newStoredName(),
      startAt: 0,
      total: Number.isFinite(declared) && declared > 0 ? declared : null,
    };
  }

  if (!resuming) return fresh();

  let res;
  let finalUrl;
  try {
    ({ res, finalUrl } = await safeGet(job.url, {
      signal: controller.signal,
      rangeStart: job.resumeFrom,
    }));
  } catch (err) {
    if (err.rangeNotSatisfiable) {
      await storage.removeFile(job.partialStoredName).catch(() => {});
      return fresh();
    }
    throw err;
  }

  if (res.statusCode !== 206) {
    // The server ignored Range and sent the whole file from byte 0. This
    // response IS a fresh, complete stream - just use it instead of asking again.
    res.__fullBodyFromByteZero = true;
    await storage.removeFile(job.partialStoredName).catch(() => {});
    const declared = Number(res.headers['content-length']);
    return {
      res,
      finalUrl,
      mode: 'fresh',
      storedName: storage.newStoredName(),
      startAt: 0,
      total: Number.isFinite(declared) && declared > 0 ? declared : null,
    };
  }

  const match = /\/(\d+)\s*$/.exec(res.headers['content-range'] || '');
  const rangeTotal = match ? Number(match[1]) : null;
  if (job.knownTotal && rangeTotal && rangeTotal !== job.knownTotal) {
    // The remote file changed size since we paused: byte offsets can no
    // longer be trusted, so start over rather than risk a corrupt file.
    res.destroy();
    await storage.removeFile(job.partialStoredName).catch(() => {});
    return fresh();
  }

  return {
    res,
    finalUrl,
    mode: 'append',
    storedName: job.partialStoredName,
    startAt: job.resumeFrom,
    total: rangeTotal || job.knownTotal || null,
  };
}

/**
 * Run one attempt of a download job.
 *
 * @param {object} job - `{id, user_id, url}`, plus `resumeFrom`/`partialStoredName`/
 *   `knownTotal` to continue a paused download instead of starting over.
 * @param {{progress(snapshot): void}} [reporter] - called often with a progress
 *   snapshot; errors from it are swallowed (it is a side channel, not the
 *   source of truth). Optional so this module stays usable without a queue.
 *
 * Throws on any failure or pause (after cleaning up, or deliberately keeping,
 * the partial file). The caller decides what a thrown error means for the job
 * as a whole (retry or fail) - a pause is final here: the 'paused' DB row and
 * report are already written before this throws, tagged `err.paused`.
 */
async function run(job, reporter = { progress() {} }) {
  const report = (snapshot) => {
    try {
      reporter.progress(snapshot);
    } catch {
      /* a broken reporter must not break the download */
    }
  };

  const controller = new AbortController();
  activeJobs.registerController(job.id, controller);
  await activeJobs.markStarted(job.user_id, job.id).catch(() => {});

  const totalTimer = env.limits.totalTimeoutMs
    ? setTimeout(
        () =>
          controller.abort(
            Object.assign(new Error('Download exceeded the time limit'), { retryable: true })
          ),
        env.limits.totalTimeoutMs
      )
    : null;

  let storedName = null;
  let pausedExit = false;
  try {
    const resuming = Boolean(job.resumeFrom && job.partialStoredName);
    await updateJob(job.id, {
      status: 'downloading',
      error: null,
      ...(resuming ? {} : { progress: 0, bytes_downloaded: 0, bytes_total: null }),
    });
    report({
      id: job.id,
      user_id: job.user_id,
      status: 'downloading',
      progress: resuming ? 0 : 0,
      bytes_downloaded: resuming ? job.resumeFrom : 0,
      bytes_total: resuming ? job.knownTotal ?? null : null,
      speed_bps: 0,
    });

    const { res, finalUrl, mode, storedName: openedName, startAt, total } = await openStream(
      job,
      controller
    );
    storedName = openedName;

    let quotaRemaining;
    try {
      ({ quotaRemaining } = await assertCanStore(job.user_id, total, {
        alreadyOnDisk: startAt,
        excludeJobId: job.id,
      }));
    } catch (err) {
      res.destroy();
      throw err;
    }

    const contentType = (res.headers['content-type'] || '').split(';')[0].trim() || null;
    const originalName = pickFilename({
      disposition: res.headers['content-disposition'],
      finalUrl,
      sourceUrl: job.url,
      contentType,
    });
    const dest = storage.filePath(storedName);

    let received = startAt; // absolute bytes accounted for, including any prior attempt
    let writtenThisAttempt = 0; // just this attempt's share, for the quota check
    let lastDbWrite = 0;
    let lastEvent = 0;
    let lastDiskCheck = Date.now();
    const window = [{ at: Date.now(), bytes: received }];

    const speedBps = () => {
      const now = Date.now();
      while (window.length > 1 && now - window[0].at > SPEED_WINDOW_MS) window.shift();
      const span = now - window[0].at;
      return span > 250 ? Math.max(0, Math.round(((received - window[0].bytes) / span) * 1000)) : 0;
    };

    const meter = new Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length;
        writtenThisAttempt += chunk.length;

        // Enforce the limits again while streaming: Content-Length may be absent or lie.
        if (env.limits.maxFileBytes && received > env.limits.maxFileBytes) {
          return cb(
            httpError(413, `File is larger than the ${formatMb(env.limits.maxFileBytes)} limit`)
          );
        }
        if (quotaRemaining != null && writtenThisAttempt > quotaRemaining) {
          return cb(httpError(507, 'Storage quota reached'));
        }

        const now = Date.now();
        window.push({ at: now, bytes: received });
        const progress = total ? Math.min(99, Math.floor((received / total) * 100)) : 0;

        if (now - lastEvent >= EVENT_INTERVAL_MS) {
          lastEvent = now;
          report({
            id: job.id,
            user_id: job.user_id,
            status: 'downloading',
            progress,
            bytes_downloaded: received,
            bytes_total: total,
            speed_bps: speedBps(),
          });
        }
        if (now - lastDbWrite >= DB_WRITE_INTERVAL_MS) {
          lastDbWrite = now;
          updateJob(job.id, { bytes_downloaded: received, bytes_total: total, progress }).catch(
            () => {}
          );
        }
        // Watch the disk too, for streams that never declared a length.
        if (now - lastDiskCheck >= DISK_RECHECK_MS) {
          lastDiskCheck = now;
          storage
            .hasRoomFor(0)
            .then((room) => {
              if (!room.ok) {
                controller.abort(
                  Object.assign(new Error('Server ran out of disk space'), { retryable: true })
                );
              }
            })
            .catch(() => {});
        }
        cb(null, chunk);
      },
    });

    // Abort if the remote stalls: no data at all for idleTimeoutMs.
    res.setTimeout(env.limits.idleTimeoutMs, () => {
      res.destroy(httpError(504, 'Remote server stopped sending data', { retryable: true }));
    });

    const writeStream = fs.createWriteStream(dest, mode === 'append' ? { flags: 'a' } : undefined);

    try {
      await pipeline(res, meter, writeStream, { signal: controller.signal });
    } catch (err) {
      const normalized = normalizeAbort(err, controller);
      if (normalized.paused) {
        // Count only bytes actually flushed to disk by THIS write stream, not
        // what the meter saw upstream of it - a chunk can be counted by the
        // meter microseconds before the writable side is torn down unflushed.
        const onDisk = startAt + (writeStream.bytesWritten || 0);
        pausedExit = true;
        await updateJob(job.id, {
          status: 'paused',
          progress: total ? Math.min(99, Math.floor((onDisk / total) * 100)) : 0,
          bytes_downloaded: onDisk,
          bytes_total: total,
          partial_stored_name: storedName,
          error: null,
        });
        report({
          id: job.id,
          user_id: job.user_id,
          status: 'paused',
          progress: total ? Math.min(99, Math.floor((onDisk / total) * 100)) : 0,
          bytes_downloaded: onDisk,
          bytes_total: total,
        });
      }
      throw normalized;
    }

    if (total && received !== total) {
      throw httpError(502, `Incomplete download (${received} of ${total} bytes)`, {
        retryable: true,
      });
    }

    const [result] = await pool.query(
      `INSERT INTO files (user_id, original_name, stored_name, size_bytes, mime_type, source_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [job.user_id, originalName, storedName, received, contentType, job.url]
    );
    storedName = null; // the file row owns it now

    const doneSnapshot = {
      id: job.id,
      user_id: job.user_id,
      status: 'done',
      progress: 100,
      bytes_downloaded: received,
      bytes_total: total ?? received,
      file_id: result.insertId,
    };
    await updateJob(job.id, {
      status: 'done',
      progress: 100,
      bytes_downloaded: received,
      bytes_total: total ?? received,
      file_id: result.insertId,
      partial_stored_name: null,
    });
    report(doneSnapshot);
    return doneSnapshot;
  } finally {
    if (totalTimer) clearTimeout(totalTimer);
    activeJobs.unregisterController(job.id);
    await activeJobs.markFinished(job.user_id, job.id).catch(() => {});
    // Anything still owned here (and not a deliberate pause) is a partial
    // file from a real failure/cancel: never leave it behind.
    if (storedName && !pausedExit) await storage.removeFile(storedName).catch(() => {});
  }
}

module.exports = { run, updateJob, userUsageBytes, pickFilename };
