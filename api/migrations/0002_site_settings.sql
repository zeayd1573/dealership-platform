-- Editable website content per dealer (hero, about, promises, SEO). Unset keys fall back to defaults in code.
CREATE TABLE IF NOT EXISTS site_settings (
  dealer_id INTEGER NOT NULL REFERENCES dealers(id),
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (dealer_id, key)
);
