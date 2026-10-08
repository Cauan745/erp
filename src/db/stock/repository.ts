import { Platform } from 'react-native';

import { getDatabase } from '../db';
import { StockHistoryEntry } from './types';

type StockHistoryRow = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  reason: string | null;
  source: 'sale' | 'adjustment';
  created_at: string;
};

const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function runInTransaction(
  database: Awaited<ReturnType<typeof getDatabase>>,
  task: (transaction: typeof database) => Promise<void>
) {
  if (Platform.OS === 'web') {
    await database.withTransactionAsync(() => task(database));
    return;
  }

  await database.withExclusiveTransactionAsync((transaction) => task(transaction));
}

export async function adjustStock(productId: string, quantity: number, reason?: string): Promise<void> {
  if (!Number.isSafeInteger(quantity) || quantity === 0) {
    throw new Error('Stock changes must be non-zero integers.');
  }

  const database = await getDatabase();
  const createdAt = new Date().toISOString();
  const normalizedReason = reason?.trim() || null;

  await runInTransaction(database, async (transaction) => {
    const result = await transaction.runAsync(
      `UPDATE products
       SET stock = stock + ?, updated_at = ?
       WHERE id = ?;`,
      quantity,
      createdAt,
      productId
    );

    if (result.changes !== 1) {
      throw new Error('Product no longer exists.');
    }

    await transaction.runAsync(
      `INSERT INTO stock_adjustments (id, product_id, quantity, reason, created_at)
       VALUES (?, ?, ?, ?, ?);`,
      id('stock-adjustment'),
      productId,
      quantity,
      normalizedReason,
      createdAt
    );
  });
}

export async function addProductStock(productId: string, quantity = 1): Promise<void> {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error('Stock quantity must be a positive integer.');
  }

  await adjustStock(productId, quantity);
}

export async function listStockHistory(limit = 50): Promise<StockHistoryEntry[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<StockHistoryRow>(`
    SELECT id, product_id, product_name, quantity, reason, source, created_at
    FROM (
      SELECT
        sale_items.id AS id,
        sale_items.product_id AS product_id,
        sale_items.product_name AS product_name,
        -sale_items.quantity AS quantity,
        'Sale' AS reason,
        'sale' AS source,
        sales.created_at AS created_at
      FROM sale_items
      INNER JOIN sales ON sales.id = sale_items.sale_id

      UNION ALL

      SELECT
        stock_adjustments.id AS id,
        stock_adjustments.product_id AS product_id,
        products.name AS product_name,
        stock_adjustments.quantity AS quantity,
        stock_adjustments.reason AS reason,
        'adjustment' AS source,
        stock_adjustments.created_at AS created_at
      FROM stock_adjustments
      INNER JOIN products ON products.id = stock_adjustments.product_id
    )
    ORDER BY created_at DESC
    LIMIT ?;
  `, limit);

  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: row.quantity,
    reason: row.reason,
    source: row.source,
    createdAt: row.created_at
  }));
}
