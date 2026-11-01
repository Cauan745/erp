import { Product } from './types';
import { getDatabase } from '../db';
import { AppError } from '../../errors';
import { createUuid } from '../ids';
import { runInTransaction } from '../transactions';
import { enqueueOperation } from '../sync/repository';
import { SYNC_OPERATION_TYPES } from '../sync/types';

type ProductRow = {
  id: string;
  name: string;
  barcode: string | null;
  category: string;
  cost_cents: number | null;
  selling_price_cents: number;
  stock: number;
  version: number;
  deleted_at: string | null;
  updated_at: string;
  created_at: string;
};

const centsFromMoney = (value: number, errorCode: 'productPrice' | 'productCost') => {
  if (!Number.isFinite(value) || value < 0) {
    throw new AppError(errorCode);
  }

  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) throw new AppError(errorCode);
  return cents;
};

const centsFromOptionalCost = (cost: number | null) =>
  cost === null ? null : centsFromMoney(cost, 'productCost');

const productFromRow = (row: ProductRow): Product => ({
  id: row.id,
  name: row.name,
  barcode: row.barcode ?? '',
  category: row.category,
  cost: row.cost_cents === null ? null : row.cost_cents / 100,
  sellingPrice: row.selling_price_cents / 100,
  profit: row.cost_cents === null ? null : (row.selling_price_cents - row.cost_cents) / 100,
  stock: row.stock,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

function uniqueConstraintError(error: unknown, indexName: string, columnName: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(indexName) || message.includes(`products.${columnName}`);
}

async function assertProductUnique(
  transaction: Awaited<ReturnType<typeof getDatabase>>,
  name: string,
  barcode: string | null,
  productId?: string
) {
  const duplicateName = await transaction.getFirstAsync<{ id: string }>(`
    SELECT id FROM products
    WHERE name = ? COLLATE NOCASE AND (? IS NULL OR id <> ?)
    LIMIT 1;
  `, name, productId ?? null, productId ?? null);
  if (duplicateName) throw new AppError('productNameDuplicate');

  if (barcode) {
    const duplicateBarcode = await transaction.getFirstAsync<{ id: string }>(`
      SELECT id FROM products
      WHERE barcode = ? AND (? IS NULL OR id <> ?)
      LIMIT 1;
    `, barcode, productId ?? null, productId ?? null);
    if (duplicateBarcode) throw new AppError('productBarcodeDuplicate');
  }
}

export async function listProducts(): Promise<Product[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<ProductRow>(`
    SELECT id, name, barcode, category, cost_cents, selling_price_cents, stock, version, deleted_at, updated_at, created_at
    FROM products
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC, name COLLATE NOCASE ASC;
  `);

  return rows.map(productFromRow);
}

export type ProductInput = {
  name: string;
  barcode: string;
  category: string;
  cost: number | null;
  sellingPrice: number;
};

export type CreateProductInput = ProductInput & { stock: number };

export type UpdateProductInput = ProductInput;

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const name = input.name.trim();
  const category = input.category.trim() || 'General';
  const barcode = input.barcode.trim() || null;
  const costCents = centsFromOptionalCost(input.cost);
  const sellingPriceCents = centsFromMoney(input.sellingPrice, 'productPrice');
  const stock = Math.trunc(input.stock);

  if (!name) {
    throw new AppError('productNameRequired');
  }
  if (!Number.isSafeInteger(stock)) {
    throw new AppError('productStockInteger');
  }

  const createdAt = new Date().toISOString();
  const product: Product = {
    id: createUuid(),
    name,
    barcode: barcode ?? '',
    category,
    cost: costCents === null ? null : costCents / 100,
    sellingPrice: sellingPriceCents / 100,
    profit: costCents === null ? null : (sellingPriceCents - costCents) / 100,
    stock,
    version: 1,
    createdAt,
    updatedAt: createdAt
  };

  const database = await getDatabase();
  try {
    await runInTransaction(database, async (transaction) => {
      await assertProductUnique(transaction, name, barcode);
      await transaction.runAsync(
        `INSERT INTO products
          (id, name, barcode, category, cost_cents, selling_price_cents, stock, version, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        product.id,
        product.name,
        barcode,
        product.category,
        costCents,
        sellingPriceCents,
        product.stock,
        product.version,
        product.updatedAt,
        product.createdAt
      );
      await enqueueOperation(transaction, {
        operationType: SYNC_OPERATION_TYPES.productCreate,
        aggregateId: product.id,
        payload: {
          product: {
            id: product.id,
            name: product.name,
            barcode,
            category: product.category,
            costCents,
            sellingPriceCents,
            stock: product.stock,
            version: product.version,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt
          }
        },
        createdAt
      });
    });
  } catch (error) {
    if (uniqueConstraintError(error, 'products_name_unique', 'name')) {
      throw new AppError('productNameDuplicate');
    }
    if (uniqueConstraintError(error, 'products_barcode_unique', 'barcode')) {
      throw new AppError('productBarcodeDuplicate');
    }
    throw error;
  }

  return product;
}

export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  const normalizedBarcode = barcode.trim();
  if (!normalizedBarcode) return null;

  const database = await getDatabase();
  const row = await database.getFirstAsync<ProductRow>(`
    SELECT id, name, barcode, category, cost_cents, selling_price_cents, stock, version, deleted_at, updated_at, created_at
    FROM products
    WHERE barcode = ? AND deleted_at IS NULL
    LIMIT 1;
  `, normalizedBarcode);

  return row ? productFromRow(row) : null;
}

export async function updateProduct(productId: string, input: UpdateProductInput): Promise<Product> {
  const name = input.name.trim();
  const category = input.category.trim() || 'General';
  const barcode = input.barcode.trim() || null;
  const costCents = centsFromOptionalCost(input.cost);
  const sellingPriceCents = centsFromMoney(input.sellingPrice, 'productPrice');
  if (!name) throw new AppError('productNameRequired');

  const database = await getDatabase();
  try {
    return await runInTransaction(database, async (transaction) => {
      const current = await transaction.getFirstAsync<ProductRow>(`
        SELECT id, name, barcode, category, cost_cents, selling_price_cents, stock, version, deleted_at, updated_at, created_at
        FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1;
      `, productId);
      if (!current) throw new AppError('productMissing');
      await assertProductUnique(transaction, name, barcode, productId);

      const updatedAt = new Date().toISOString();
      const nextVersion = current.version + 1;
      await transaction.runAsync(
        `UPDATE products
         SET name = ?, barcode = ?, category = ?, cost_cents = ?, selling_price_cents = ?, version = ?, updated_at = ?
         WHERE id = ? AND version = ?;`,
        name,
        barcode,
        category,
        costCents,
        sellingPriceCents,
        nextVersion,
        updatedAt,
        productId,
        current.version
      );

      const product: Product = {
        id: productId,
        name,
        barcode: barcode ?? '',
        category,
        cost: costCents === null ? null : costCents / 100,
        sellingPrice: sellingPriceCents / 100,
        profit: costCents === null ? null : (sellingPriceCents - costCents) / 100,
        stock: current.stock,
        version: nextVersion,
        createdAt: current.created_at,
        updatedAt
      };
      const dependency = await transaction.getFirstAsync<{ operation_id: string }>(`
        SELECT operation_id
        FROM sync_outbox
        WHERE aggregate_id = ? AND operation_type IN (?, ?)
        ORDER BY created_at DESC
        LIMIT 1;
      `, productId, SYNC_OPERATION_TYPES.productCreate, SYNC_OPERATION_TYPES.productUpdate);
      await enqueueOperation(transaction, {
        operationType: SYNC_OPERATION_TYPES.productUpdate,
        aggregateId: productId,
        dependsOnOperationId: dependency?.operation_id ?? null,
        payload: {
          product: {
            id: product.id,
            name: product.name,
            barcode,
            category: product.category,
            costCents,
            sellingPriceCents,
            stock: product.stock,
            version: product.version,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt
          },
          expectedVersion: current.version
        },
        createdAt: updatedAt
      });
      return product;
    });
  } catch (error) {
    if (uniqueConstraintError(error, 'products_name_unique', 'name')) {
      throw new AppError('productNameDuplicate');
    }
    if (uniqueConstraintError(error, 'products_barcode_unique', 'barcode')) {
      throw new AppError('productBarcodeDuplicate');
    }
    throw error;
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  const database = await getDatabase();
  await runInTransaction(database, async (transaction) => {
    const product = await transaction.getFirstAsync<{ id: string; version: number }>(`
      SELECT id, version FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1;
    `, productId);
    if (!product) throw new AppError('productMissing');

    const deletedAt = new Date().toISOString();
    await transaction.runAsync(
      `UPDATE products SET deleted_at = ?, version = version + 1, updated_at = ? WHERE id = ?;`,
      deletedAt,
      deletedAt,
      productId
    );
    const dependency = await transaction.getFirstAsync<{ operation_id: string }>(`
      SELECT operation_id
      FROM sync_outbox
      WHERE aggregate_id = ? AND operation_type IN (?, ?)
      ORDER BY created_at DESC
      LIMIT 1;
    `, productId, SYNC_OPERATION_TYPES.productCreate, SYNC_OPERATION_TYPES.productUpdate);
    await enqueueOperation(transaction, {
      operationType: SYNC_OPERATION_TYPES.productDelete,
      aggregateId: productId,
      dependsOnOperationId: dependency?.operation_id ?? null,
      payload: { productId, expectedVersion: product.version },
      createdAt: deletedAt
    });
  });
}
