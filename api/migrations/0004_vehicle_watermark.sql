-- Per-vehicle watermark override: NULL = website default, 'off' = none, or a position code (tl, tc, tr, c, bl, bc, br).
ALTER TABLE vehicles ADD COLUMN watermark_position TEXT;
