CREATE UNIQUE INDEX IF NOT EXISTS products_name_unique
  ON products (lower(name));
