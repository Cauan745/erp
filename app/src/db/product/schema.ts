export const CREATE_PRODUCTS_TABLE = `
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    barcode TEXT,
    category TEXT NOT NULL DEFAULT 'General',
    cost_cents INTEGER CHECK (cost_cents >= 0),
    selling_price_cents INTEGER NOT NULL CHECK (selling_price_cents >= 0),
    stock INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`;

export const MIGRATE_PRODUCTS_TO_ALLOW_NEGATIVE_STOCK = `
  CREATE TABLE products_without_stock_check (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    barcode TEXT,
    category TEXT NOT NULL DEFAULT 'General',
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    stock INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  INSERT INTO products_without_stock_check
    (id, name, barcode, category, price_cents, stock, version, deleted_at, updated_at, created_at)
  SELECT id, name, barcode, category, price_cents, stock, 1, NULL, updated_at, created_at
  FROM products;

  DROP TABLE products;
  ALTER TABLE products_without_stock_check RENAME TO products;
`;

export const MIGRATE_PRODUCTS_TO_SELLING_PRICE = `
  ALTER TABLE products RENAME COLUMN price_cents TO selling_price_cents;
  ALTER TABLE products ADD COLUMN cost_cents INTEGER CHECK (cost_cents >= 0);
`;

export const CREATE_PRODUCT_INDEXES = `
  CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique
    ON products(barcode)
    WHERE barcode IS NOT NULL AND barcode <> '';

  CREATE UNIQUE INDEX IF NOT EXISTS products_name_unique
    ON products(name COLLATE NOCASE);

  CREATE INDEX IF NOT EXISTS products_created_at_idx
    ON products(created_at DESC);
`;

export const SEED_PRODUCTS = [
  {
    id: 'prod-coffee',
    name: 'House Blend Coffee',
    barcode: '7891000100103',
    category: 'Beverages',
    sellingPriceCents: 1890,
    stock: 24,
    createdAt: '2026-01-01T09:00:00.000Z'
  },
  {
    id: 'prod-oat',
    name: 'Oat Milk 1L',
    barcode: '7891000100104',
    category: 'Beverages',
    sellingPriceCents: 1250,
    stock: 16,
    createdAt: '2026-01-01T09:00:00.000Z'
  },
  {
    id: 'prod-bread',
    name: 'Sourdough Loaf',
    barcode: null,
    category: 'Bakery',
    sellingPriceCents: 2200,
    stock: 8,
    createdAt: '2026-01-01T09:00:00.000Z'
  }
] as const;
