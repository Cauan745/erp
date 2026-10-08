import { Platform } from 'react-native';

import { getDatabase } from '../db';
import { Sale, SaleLine } from './types';

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

const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const lineFromRow = (row: SaleItemRow): SaleLine => ({
  productId: row.product_id,
  name: row.product_name,
  quantity: row.quantity,
  unitPrice: row.unit_price_cents / 100,
  lineTotal: row.line_total_cents / 100
});

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

export async function checkout(lines: SaleLine[]): Promise<Sale> {
  if (!lines.length) {
    throw new Error('Cannot complete an empty sale.');
  }

  const requestedQuantities = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new Error('Sale quantities must be positive integers.');
    }

    requestedQuantities.set(
      line.productId,
      (requestedQuantities.get(line.productId) ?? 0) + line.quantity
    );
  }

  const database = await getDatabase();
  let completedSale: Sale | undefined;

  await runInTransaction(database, async (transaction) => {
    const saleLineRecords: SaleLineRecord[] = [];

    for (const [productId, quantity] of requestedQuantities) {
      const product = await transaction.getFirstAsync<ProductForCheckout>(`
        SELECT id, name, price_cents, stock
        FROM products
        WHERE id = ?;
      `, productId);

      if (!product) {
        throw new Error(`Product ${productId} no longer exists.`);
      }
      if (product.stock < quantity) {
        throw new Error(`${product.name} has only ${product.stock} item(s) in stock.`);
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

    const createdAt = new Date().toISOString();
    const saleId = id('sale');
    const totalCents = saleLineRecords.reduce((sum, line) => sum + line.lineTotalCents, 0);

    for (const line of saleLineRecords) {
      const result = await transaction.runAsync(
        `UPDATE products
         SET stock = stock - ?, updated_at = ?
         WHERE id = ? AND stock >= ?;`,
        line.quantity,
        createdAt,
        line.productId,
        line.quantity
      );

      if (result.changes !== 1) {
        throw new Error(`Unable to reserve stock for ${line.name}.`);
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

    for (const [lineNumber, line] of saleLineRecords.entries()) {
      await transaction.runAsync(
        `INSERT INTO sale_items
          (id, sale_id, line_number, product_id, product_name, quantity, unit_price_cents, line_total_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        id('sale-item'),
        saleId,
        lineNumber,
        line.productId,
        line.name,
        line.quantity,
        line.unitPriceCents,
        line.lineTotalCents
      );
    }

    completedSale = {
      id: saleId,
      lines: saleLineRecords.map(({ unitPriceCents, lineTotalCents, ...line }) => line),
      total: totalCents / 100,
      paymentMethod: 'cash',
      createdAt
    };
  });

  if (!completedSale) {
    throw new Error('Sale transaction completed without a sale.');
  }

  return completedSale;
}
