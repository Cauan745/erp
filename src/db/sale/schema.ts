export const CREATE_SALES_TABLE = `
  CREATE TABLE IF NOT EXISTS sales (
    sale_id INT PRIMARY KEY,
    total REAL NOT NULL,
    payment_method TEXT,
    updated_at TEXT,
    created_at TEXT NOT NULL,
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    sale_item_id INT PRIMARY KEY,
    sale_id INT NOT NULL,
    product_id INT NOT NULL,
   
    quantity INT NOT NULL,
    unit_price REAL NOT NULL,
 
    FOREIGN KEY (sale_id) REFERENCES sales(sale_id)
    FOREIGN KEY (product_id) REFERENCES products(product_id)
  );
`
