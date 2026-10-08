import { Product } from './types';
import { getDatabase } from '../db';

type ProductRow = {
  id: string;
  name: string;
  barcode: string | null;
  category: string;
  price_cents: number;
  stock: number;
  created_at: string;
};

const centsFromPrice = (price: number) => {
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Product price must be a non-negative number.');
  }

  return Math.round(price * 100);
};

const productFromRow = (row: ProductRow): Product => ({
  id: row.id,
  name: row.name,
  barcode: row.barcode ?? '',
  category: row.category,
  price: row.price_cents / 100,
  stock: row.stock,
  createdAt: row.created_at
});

export async function listProducts(): Promise<Product[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<ProductRow>(`
    SELECT id, name, barcode, category, price_cents, stock, created_at
    FROM products
    ORDER BY created_at DESC, name COLLATE NOCASE ASC;
  `);

  return rows.map(productFromRow);
}

export async function createProduct(input: Omit<Product, 'id' | 'createdAt'>): Promise<Product> {
  const name = input.name.trim();
  const category = input.category.trim() || 'General';
  const barcode = input.barcode.trim() || null;
  const priceCents = centsFromPrice(input.price);
  const stock = Math.trunc(input.stock);

  if (!name) {
    throw new Error('Product name is required.');
  }
  if (!Number.isSafeInteger(stock) || stock < 0) {
    throw new Error('Product stock must be a non-negative integer.');
  }

  const product: Product = {
    id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    barcode: barcode ?? '',
    category,
    price: priceCents / 100,
    stock,
    createdAt: new Date().toISOString()
  };

  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO products
      (id, name, barcode, category, price_cents, stock, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    product.id,
    product.name,
    barcode,
    product.category,
    priceCents,
    product.stock,
    product.createdAt,
    product.createdAt
  );

  return product;
}

export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  const normalizedBarcode = barcode.trim();
  if (!normalizedBarcode) return null;

  const database = await getDatabase();
  const row = await database.getFirstAsync<ProductRow>(`
    SELECT id, name, barcode, category, price_cents, stock, created_at
    FROM products
    WHERE barcode = ?
    LIMIT 1;
  `, normalizedBarcode);

  return row ? productFromRow(row) : null;
}
