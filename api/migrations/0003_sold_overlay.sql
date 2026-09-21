-- Per-vehicle "stamp SOLD across the photos" flag.
ALTER TABLE vehicles ADD COLUMN sold_overlay INTEGER NOT NULL DEFAULT 0;
