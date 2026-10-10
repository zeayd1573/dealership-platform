-- Per-dealer connections to an outside stock source (DoneDeal DealerHub, Carzone, …).
--
-- Credentials are stored encrypted, one row per dealer per provider, because the
-- DoneDeal API Usage Policy grants access per dealer, per domain, per implementation.
-- A single platform-wide key would breach it on day one.
CREATE TABLE IF NOT EXISTS dealer_integrations (
  dealer_id INTEGER NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                 -- 'donedeal' | 'carzone' | 'fixture'
  account_ref TEXT,                       -- the dealer's id on their side
  credential TEXT,                        -- AES-GCM ciphertext; never returned by any GET
  approved_domain TEXT,                   -- the domain registered with the provider
  status TEXT NOT NULL DEFAULT 'pending', -- pending | active | paused | revoked
  auto_sync INTEGER NOT NULL DEFAULT 1,   -- run on the nightly cron
  last_sync_at TEXT,
  last_result TEXT,                       -- JSON summary of the last run
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (dealer_id, provider)
);

-- Which vehicles came from which provider, so a revoke can remove exactly those and
-- nothing the dealer typed in themselves.
ALTER TABLE vehicles ADD COLUMN source TEXT;          -- NULL = entered by hand
ALTER TABLE vehicles ADD COLUMN source_synced_at TEXT;
CREATE INDEX IF NOT EXISTS idx_vehicles_source ON vehicles(dealer_id, source, external_ref);

-- An audit line per run. Dealers ask "why did that car disappear".
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dealer_id INTEGER NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  ok INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0,
  message TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_runs ON sync_runs(dealer_id, started_at);

-- Remembers that the SYNC paused a car (because it left the feed), as opposed to a
-- car being paused because it is new and has no photos yet. Without this the importer
-- cannot tell the two apart and republishes photoless cars.
ALTER TABLE vehicles ADD COLUMN paused_by_sync INTEGER NOT NULL DEFAULT 0;
