CREATE DATABASE IF NOT EXISTS link_cloud CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE link_cloud;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','user') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  original_name VARCHAR(512) NOT NULL,
  stored_name VARCHAR(255) NOT NULL UNIQUE,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  mime_type VARCHAR(255) NULL,
  source_url TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jobs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  url TEXT NOT NULL,
  status ENUM('queued','downloading','paused','done','failed','cancelled') NOT NULL DEFAULT 'queued',
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bytes_downloaded BIGINT UNSIGNED NOT NULL DEFAULT 0,
  bytes_total BIGINT UNSIGNED NULL,
  error TEXT NULL,
  file_id INT UNSIGNED NULL,
  -- The on-disk partial file while status = 'paused', so a resume can append
  -- to it instead of starting over. Cleared once the job finishes or is
  -- cancelled outright.
  partial_stored_name VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL
);

-- Tracks which files in db/migrations/ have been applied (see db/migrate.js).
CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
