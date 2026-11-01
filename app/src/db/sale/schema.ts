export const CREATE_SALES_TABLE = `
  CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY NOT NULL,
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'debit_card', 'credit_card', 'pix')),
    cash_received_cents INTEGER CHECK (cash_received_cents IS NULL OR cash_received_cents >= 0),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY NOT NULL,
    sale_id TEXT NOT NULL,
    line_number INTEGER NOT NULL CHECK (line_number >= 0),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`;

export const CREATE_SALE_INDEXES = `
  CREATE INDEX IF NOT EXISTS sales_created_at_idx
    ON sales(created_at DESC);

  CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx
    ON sale_items(sale_id);
`;

export const MIGRATE_SALES_TO_PAYMENT_METHODS = `
  CREATE TABLE sales_new (
    id TEXT PRIMARY KEY NOT NULL,
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'debit_card', 'credit_card', 'pix')),
    cash_received_cents INTEGER CHECK (cash_received_cents IS NULL OR cash_received_cents >= 0),
    created_at TEXT NOT NULL
  );

  INSERT INTO sales_new (id, total_cents, payment_method, cash_received_cents, created_at)
  SELECT id, total_cents, payment_method, total_cents, created_at
  FROM sales;

  DROP TABLE sales;
  ALTER TABLE sales_new RENAME TO sales;
`;

export const MIGRATE_SALES_TO_REMOVE_CHANGE = `
  CREATE TABLE sales_new (
    id TEXT PRIMARY KEY NOT NULL,
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'debit_card', 'credit_card', 'pix')),
    cash_received_cents INTEGER CHECK (cash_received_cents IS NULL OR cash_received_cents >= 0),
    created_at TEXT NOT NULL
  );

  INSERT INTO sales_new (id, total_cents, payment_method, cash_received_cents, created_at)
  SELECT id, total_cents, payment_method, cash_received_cents, created_at
  FROM sales;

  DROP TABLE sales;
  ALTER TABLE sales_new RENAME TO sales;
`;
