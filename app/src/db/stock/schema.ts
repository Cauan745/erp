export const CREATE_STOCK_ADJUSTMENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS stock_adjustments (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity <> 0),
    reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`;

export const CREATE_STOCK_ADJUSTMENT_INDEXES = `
  CREATE INDEX IF NOT EXISTS stock_adjustments_product_created_at_idx
    ON stock_adjustments(product_id, created_at DESC);
`;
