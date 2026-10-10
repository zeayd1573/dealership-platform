-- Reservation deposit, staff-only notes, per-vehicle finance override, view counter,
-- camper/commercial fields, and a price history log.

-- What it costs a customer to hold this car. NULL = use the site default / not offered.
ALTER TABLE vehicles ADD COLUMN reserve_cost REAL;

-- Staff-only. Never returned by any public endpoint.
ALTER TABLE vehicles ADD COLUMN private_notes TEXT;

-- Finance display for this car: NULL/'default' = site settings, 'none' = hide repayments,
-- 'custom' = use the three columns below, falling back to site settings for any left NULL.
ALTER TABLE vehicles ADD COLUMN finance_mode TEXT;
ALTER TABLE vehicles ADD COLUMN finance_apr REAL;
ALTER TABLE vehicles ADD COLUMN finance_term_months INTEGER;
ALTER TABLE vehicles ADD COLUMN finance_deposit_pct REAL;

-- Page views of this car's public page.
ALTER TABLE vehicles ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;

-- Campers, commercials and plant.
ALTER TABLE vehicles ADD COLUMN berth INTEGER;
ALTER TABLE vehicles ADD COLUMN payload TEXT;
ALTER TABLE vehicles ADD COLUMN licence_type TEXT;
ALTER TABLE vehicles ADD COLUMN engine_hours INTEGER;

-- Every price this vehicle has been advertised at, oldest first.
CREATE TABLE IF NOT EXISTS vehicle_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  price REAL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_price_history_vehicle ON vehicle_price_history(vehicle_id, changed_at);

-- Seed history with the current price so existing stock has a starting point.
INSERT INTO vehicle_price_history (vehicle_id, price, changed_at)
  SELECT id, price, COALESCE(created_at, datetime('now')) FROM vehicles WHERE price IS NOT NULL;
