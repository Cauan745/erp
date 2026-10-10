import { getDatabase } from '../db';
import { AppError } from '../../errors';
import { Sale, SaleLine } from './types';
import { createUuid } from '../ids';
import { runInTransaction } from '../transactions';
import { enqueueOperation } from '../sync/repository';
import { SYNC_OPERATION_TYPES } from '../sync/types';

type SaleRow = {
  id: string;
  total_cents: number;
  payment_method: 'cash';
  created_at: string;
};

type SaleItemRow = {
  id: string;
  sale_id: string;
  line_number: number;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
};

type ProductForCheckout = {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
};

type SaleLineRecord = SaleLine & {
  unitPriceCents: number;
  lineTotalCents: number;
};

export type StockShortage = {
  productId: string;
  productName: string;
  available: number;
  requested: number;
};

export type CheckoutOptions = {
  allowInsufficientStock?: boolean;
  allowInsufficientStockProductIds?: readonly string[];
};

export class InsufficientStockError extends AppError {
  readonly shortage: StockShortage;

  constructor(shortage: StockShortage) {
    super('stockReservation', { productName: shortage.productName });
    this.name = 'InsufficientStockError';
    this.shortage = shortage;
  }
}

const lineFromRow = (row: SaleItemRow): SaleLine => ({
  productId: row.product_id,
  name: row.product_name,
  quantity: row.quantity,
  unitPrice: row.unit_price_cents / 100,
  lineTotal: row.line_total_cents / 100
});

export async function listSales(): Promise<Sale[]> {
  const database = await getDatabase();
  const [sales, items] = await Promise.all([
    database.getAllAsync<SaleRow>(`
      SELECT id, total_cents, payment_method, created_at
      FROM sales
      ORDER BY created_at DESC;
    `),
    database.getAllAsync<SaleItemRow>(`
      SELECT id, sale_id, line_number, product_id, product_name, quantity, unit_price_cents, line_total_cents
      FROM sale_items
      ORDER BY sale_id ASC, line_number ASC;
    `)
  ]);

  const itemsBySale = new Map<string, SaleItemRow[]>();
  for (const item of items) {
    const saleItems = itemsBySale.get(item.sale_id) ?? [];
    saleItems.push(item);
    itemsBySale.set(item.sale_id, saleItems);
  }

  return sales.map((sale) => ({
    id: sale.id,
    lines: (itemsBySale.get(sale.id) ?? []).map(lineFromRow),
    total: sale.total_cents / 100,
    paymentMethod: sale.payment_method,
    createdAt: sale.created_at
  }));
}

export async function checkout(
  lines: SaleLine[],
  options: CheckoutOptions = {}
): Promise<Sale> {
  if (!lines.length) {
    throw new AppError('emptySale');
  }

  const requestedQuantities = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new AppError('saleQuantityPositive');
    }

    requestedQuantities.set(
      line.productId,
      (requestedQuantities.get(line.productId) ?? 0) + line.quantity
    );
  }

  const database = await getDatabase();
  const createdAt = new Date().toISOString();
  const saleId = createUuid();
  let completedSale: Sale | undefined;

  await runInTransaction(database, async (transaction) => {
    const saleLineRecords: SaleLineRecord[] = [];

    for (const [productId, quantity] of requestedQuantities) {
      const product = await transaction.getFirstAsync<ProductForCheckout>(`
        SELECT id, name, price_cents, stock
        FROM products
        WHERE id = ? AND deleted_at IS NULL;
      `, productId);

      if (!product) {
        throw new AppError('productMissing');
      }
      const allowInsufficientStock = options.allowInsufficientStock
        || options.allowInsufficientStockProductIds?.includes(productId);
      if (product.stock < quantity && !allowInsufficientStock) {
        throw new InsufficientStockError({
          productId: product.id,
          productName: product.name,
          available: product.stock,
          requested: quantity
        });
      }

      const lineTotalCents = product.price_cents * quantity;
      saleLineRecords.push({
        productId: product.id,
        name: product.name,
        quantity,
        unitPrice: product.price_cents / 100,
        lineTotal: lineTotalCents / 100,
        unitPriceCents: product.price_cents,
        lineTotalCents
      });
    }

    const totalCents = saleLineRecords.reduce((sum, line) => sum + line.lineTotalCents, 0);

    for (const line of saleLineRecords) {
      const allowInsufficientStock = options.allowInsufficientStock
        || options.allowInsufficientStockProductIds?.includes(line.productId);
      const result = allowInsufficientStock
        ? await transaction.runAsync(
          `UPDATE products
           SET stock = stock - ?, version = version + 1, updated_at = ?
           WHERE id = ?;`,
          line.quantity,
          createdAt,
          line.productId
        )
        : await transaction.runAsync(
          `UPDATE products
           SET stock = stock - ?, version = version + 1, updated_at = ?
           WHERE id = ? AND stock >= ?;`,
          line.quantity,
          createdAt,
          line.productId,
          line.quantity
        );

      if (result.changes !== 1) {
        throw new AppError('stockReservation', { productName: line.name });
      }
    }

    await transaction.runAsync(
      `INSERT INTO sales (id, total_cents, payment_method, created_at)
       VALUES (?, ?, ?, ?);`,
      saleId,
      totalCents,
      'cash',
      createdAt
    );

    const saleItemRecords = saleLineRecords.map((line, lineNumber) => ({
      id: createUuid(),
      saleId,
      lineNumber,
      productId: line.productId,
      productName: line.name,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents
    }));

    for (const item of saleItemRecords) {
      await transaction.runAsync(
        `INSERT INTO sale_items
          (id, sale_id, line_number, product_id, product_name, quantity, unit_price_cents, line_total_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        item.id,
        item.saleId,
        item.lineNumber,
        item.productId,
        item.productName,
        item.quantity,
        item.unitPriceCents,
        item.lineTotalCents
      );
    }

    const syncLines = saleItemRecords.map((item) => ({
      id: item.id,
      saleId: item.saleId,
      lineNumber: item.lineNumber,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents
    }));
    const allowedProductIds = options.allowInsufficientStock
      ? saleLineRecords.map((line) => line.productId)
      : Array.from(options.allowInsufficientStockProductIds ?? []);

    await enqueueOperation(transaction, {
      operationType: SYNC_OPERATION_TYPES.saleCheckout,
      aggregateId: saleId,
      payload: {
        sale: { id: saleId, totalCents, paymentMethod: 'cash', createdAt },
        lines: syncLines,
        allowInsufficientStockProductIds: allowedProductIds
      },
      createdAt
    });

    completedSale = {
      id: saleId,
      lines: saleLineRecords.map(({ unitPriceCents, lineTotalCents, ...line }) => line),
      total: totalCents / 100,
      paymentMethod: 'cash',
      createdAt
    };
  });

  if (!completedSale) {
    throw new AppError('saleTransaction');
  }

  return completedSale;
}
