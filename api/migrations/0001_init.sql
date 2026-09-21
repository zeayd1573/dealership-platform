-- Dealer platform schema (D1 / SQLite)

CREATE TABLE IF NOT EXISTS dealers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  phone TEXT,
  phone_href TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  maps_url TEXT,
  hours_json TEXT,           -- [["Mon–Fri","9.00am – 6.00pm"], ...]
  logo_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dealer_id INTEGER NOT NULL REFERENCES dealers(id),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dealer_id INTEGER NOT NULL REFERENCES dealers(id),
  reg TEXT NOT NULL,
  make TEXT, model TEXT, variant TEXT,
  year INTEGER,
  colour TEXT, colour_description TEXT,
  fuel_type TEXT, engine_size TEXT, body_style TEXT, transmission TEXT,
  mileage INTEGER,
  price REAL, prev_price REAL,
  description TEXT,
  features TEXT,             -- comma separated
  status TEXT NOT NULL DEFAULT 'available',   -- available | paused | reserved | sold | archived
  nct_expiry TEXT, tax_due TEXT,
  vin TEXT, youtube_link TEXT,
  is_highlighted INTEGER NOT NULL DEFAULT 0,
  is_commercial INTEGER NOT NULL DEFAULT 0,
  doors INTEGER, seats INTEGER, owners INTEGER,
  co2 INTEGER, max_power INTEGER, fuel_economy TEXT, seat_belts INTEGER,
  road_tax REAL, warranty_type TEXT, warranty_duration TEXT,
  external_ref TEXT,         -- id on the source feed (e.g. CarsIreland advert id), for imports/sync
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (dealer_id, reg)
);
CREATE INDEX IF NOT EXISTS idx_vehicles_dealer_status ON vehicles(dealer_id, status);

CREATE TABLE IF NOT EXISTS vehicle_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  key TEXT NOT NULL,         -- R2 object key for the 1200px image
  thumb_key TEXT NOT NULL,   -- R2 object key for the 480px thumb
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_images_vehicle ON vehicle_images(vehicle_id, sort_order);

CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dealer_id INTEGER NOT NULL REFERENCES dealers(id),
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'enquiry',       -- enquiry | finance | valuation | sourcing | contact
  name TEXT, phone TEXT, email TEXT,
  message TEXT,
  payload TEXT,              -- JSON of any extra form fields
  status TEXT NOT NULL DEFAULT 'unread',      -- unread | read
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_enquiries_dealer ON enquiries(dealer_id, status, created_at);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dealer_id INTEGER NOT NULL REFERENCES dealers(id),
  customer_name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  review_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | approved | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS finance_settings (
  dealer_id INTEGER PRIMARY KEY REFERENCES dealers(id),
  apr REAL NOT NULL DEFAULT 6.9,
  term_months INTEGER NOT NULL DEFAULT 60,
  deposit_pct REAL NOT NULL DEFAULT 10,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed the first dealer
INSERT OR IGNORE INTO dealers (name, slug, phone, phone_href, whatsapp, email, address, maps_url, hours_json)
VALUES ('MHL Motors', 'mhlmotors', '087 414 3375', 'tel:+353874143375', 'https://wa.me/353874143375',
        'mhlmotorsltd@gmail.com', 'Moate Road, Kilbeggan, Co. Westmeath, N91 H6RE',
        'https://maps.app.goo.gl/ozLVzihjgkyLu3w27',
        '[["Mon–Fri","9.00am – 6.00pm"],["Saturday","9.00am – 6.00pm"],["Sunday","Closed"]]');
INSERT OR IGNORE INTO finance_settings (dealer_id) SELECT id FROM dealers WHERE slug = 'mhlmotors';
