CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  barcode TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
  stock BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX products_barcode_unique
  ON products (barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

CREATE INDEX products_created_at_idx ON products (created_at DESC);

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  total_cents BIGINT NOT NULL CHECK (total_cents >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method = 'cash'),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL CHECK (line_number >= 0),
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity BIGINT NOT NULL CHECK (quantity > 0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents BIGINT NOT NULL CHECK (line_total_cents >= 0),
  UNIQUE (sale_id, line_number)
);

CREATE INDEX sales_created_at_idx ON sales (created_at DESC);
CREATE INDEX sale_items_sale_id_idx ON sale_items (sale_id);

CREATE TABLE stock_adjustments (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity BIGINT NOT NULL CHECK (quantity <> 0),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX stock_adjustments_product_created_at_idx
  ON stock_adjustments (product_id, created_at DESC);

INSERT INTO products (id, name, barcode, category, price_cents, stock, updated_at, created_at)
VALUES
  ('prod-coffee', 'House Blend Coffee', '7891000100103', 'Beverages', 1890, 24, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
  ('prod-oat', 'Oat Milk 1L', '7891000100104', 'Beverages', 1250, 16, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'),
  ('prod-bread', 'Sourdough Loaf', NULL, 'Bakery', 2200, 8, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z')
ON CONFLICT (id) DO NOTHING;
