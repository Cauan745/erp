ALTER TABLE products
  RENAME COLUMN price_cents TO selling_price_cents;

ALTER TABLE products
  ADD COLUMN cost_cents BIGINT CHECK (cost_cents >= 0);
