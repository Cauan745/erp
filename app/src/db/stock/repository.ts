import { getDatabase } from '../db';
import { AppError } from '../../errors';
import { StockHistoryEntry } from './types';
import { createUuid } from '../ids';
import { runInTransaction } from '../transactions';
import { enqueueOperation } from '../sync/repository';
import { SYNC_OPERATION_TYPES } from '../sync/types';

type StockHistoryRow = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  reason: string | null;
  source: 'sale' | 'adjustment';
  created_at: string;
};

export const STOCK_REASON_AUTO_SALE_REPLENISHMENT = 'sale-shortage-replenishment';

export async function adjustStock(productId: string, quantity: number, reason?: string): Promise<void> {
  if (!Number.isSafeInteger(quantity) || quantity === 0) {
    throw new AppError('stockChangeInteger');
  }

  const database = await getDatabase();
  const createdAt = new Date().toISOString();
  const normalizedReason = reason?.trim() || null;
  const adjustmentId = createUuid();

  await runInTransaction(database, async (transaction) => {
    const result = await transaction.runAsync(
      `UPDATE products
       SET stock = stock + ?, version = version + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL;`,
      quantity,
      createdAt,
      productId
    );

    if (result.changes !== 1) {
      throw new AppError('productMissing');
    }

    await transaction.runAsync(
      `INSERT INTO stock_adjustments (id, product_id, quantity, reason, created_at)
       VALUES (?, ?, ?, ?, ?);`,
      adjustmentId,
      productId,
      quantity,
      normalizedReason,
      createdAt
    );
    await enqueueOperation(transaction, {
      operationType: SYNC_OPERATION_TYPES.stockAdjustment,
      aggregateId: adjustmentId,
      payload: {
        adjustment: {
          id: adjustmentId,
          productId,
          quantity,
          reason: normalizedReason,
          createdAt
        }
      },
      createdAt
    });
  });
}

export async function addProductStock(productId: string, quantity = 1, reason?: string): Promise<void> {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new AppError('stockQuantityPositive');
  }

  await adjustStock(productId, quantity, reason);
}

export async function updateStockAdjustmentReason(adjustmentId: string, reason: string): Promise<void> {
  const database = await getDatabase();
  const normalizedReason = reason.trim() || null;
  await runInTransaction(database, async (transaction) => {
    const result = await transaction.runAsync(
      `UPDATE stock_adjustments
       SET reason = ?
       WHERE id = ?;`,
      normalizedReason,
      adjustmentId
    );

    if (result.changes !== 1) throw new AppError('stockAdjustmentMissing');

    const dependency = await transaction.getFirstAsync<{ operation_id: string }>(`
      SELECT operation_id
      FROM sync_outbox
      WHERE operation_type = ? AND aggregate_id = ?
      ORDER BY created_at DESC
      LIMIT 1;
    `, SYNC_OPERATION_TYPES.stockAdjustment, adjustmentId);

    await enqueueOperation(transaction, {
      operationType: SYNC_OPERATION_TYPES.stockReasonUpdate,
      aggregateId: adjustmentId,
      dependsOnOperationId: dependency?.operation_id ?? null,
      payload: { adjustmentId, reason: normalizedReason }
    });
  });
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
