export const CREATE_PRODUCTS_TABLE = `
  CREATE TABLE IF NOT EXISTS products (
    product_id INT PRIMARY KEY,
    product_name TEXT NOT NULL,
    product_price INT NOT NULL,
    updated_at TEXT,
    created_at TEXT NOT NULL,
  );
`
