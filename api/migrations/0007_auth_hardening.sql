-- Brute-force protection and token invalidation.

-- Bumped when a password changes, so tokens issued before it stop working.
-- Without this a stolen token stays valid for its full seven days even after
-- the owner changes their password in response to the theft.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;

-- One row per (ip, username) window. Counts failures, holds a lockout.
CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,                 -- "<ip>|<lowercased username>"
  fails INTEGER NOT NULL DEFAULT 0,
  first_at TEXT NOT NULL DEFAULT (datetime('now')),
  locked_until TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(first_at);

-- Rate limiting for the public enquiry form. Holds a short-lived counter per IP
-- rather than writing the IP into the enquiry itself, which would keep personal
-- data forever and put it in the notification email.
CREATE TABLE IF NOT EXISTS enquiry_throttle (
  ip TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL DEFAULT (datetime('now'))
);
