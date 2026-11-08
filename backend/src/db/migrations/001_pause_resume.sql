-- Adds pause/resume support: a 'paused' status and the on-disk partial file
-- that status points at so a resume can append instead of starting over.
ALTER TABLE jobs
  MODIFY COLUMN status ENUM('queued','downloading','paused','done','failed','cancelled')
    NOT NULL DEFAULT 'queued',
  ADD COLUMN partial_stored_name VARCHAR(255) NULL AFTER file_id;
