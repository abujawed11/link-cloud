// One-off maintenance script: files downloaded before stored names were made
// human-readable (see storageService.uniqueStoredName) sit on disk as a bare
// UUID or UUID+extension. This renames them to their real, collision-checked
// filename and updates files.stored_name to match.
// Safe to re-run - skips any row whose stored_name is already a sanitised
// form of original_name (so a second run does nothing).
const fs = require('fs');
const pool = require('../config/db');
const storage = require('../services/storageService');

async function run() {
  const [rows] = await pool.query('SELECT id, original_name, stored_name, mime_type FROM files');

  let renamed = 0;
  let skipped = 0;
  for (const row of rows) {
    const desired = storage.sanitizeFilename(row.original_name);
    const currentStem = row.stored_name.replace(/ \(\d+\)(?=\.[^.]*$|$)/, ''); // ignore an existing " (n)"
    if (currentStem === desired) {
      skipped += 1;
      continue; // already named this way (or a numbered variant of it)
    }

    const oldPath = storage.filePath(row.stored_name);
    if (!fs.existsSync(oldPath)) {
      console.log(`Skipping file ${row.id}: not found on disk (${row.stored_name})`);
      skipped += 1;
      continue;
    }

    const newStoredName = storage.uniqueStoredName(row.original_name);
    const newPath = storage.filePath(newStoredName);

    await fs.promises.rename(oldPath, newPath);
    await pool.query('UPDATE files SET stored_name = ? WHERE id = ?', [newStoredName, row.id]);
    console.log(`Renamed file ${row.id}: ${row.stored_name} -> ${newStoredName}`);
    renamed += 1;
  }

  console.log(`Done. Renamed ${renamed}, skipped ${skipped}.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err.message);
    process.exit(1);
  });
