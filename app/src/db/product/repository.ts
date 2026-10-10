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
  price_cents: number;
  stock: number;
  version: number;
  deleted_at: string | null;
  updated_at: string;
  created_at: string;
};

const centsFromPrice = (price: number) => {
  if (!Number.isFinite(price) || price < 0) {
    throw new AppError('productPrice');
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
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export async function listProducts(): Promise<Product[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<ProductRow>(`
    SELECT id, name, barcode, category, price_cents, stock, version, deleted_at, updated_at, created_at
    FROM products
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC, name COLLATE NOCASE ASC;
  `);

  return rows.map(productFromRow);
}

export type CreateProductInput = Omit<Product, 'id' | 'createdAt' | 'version' | 'updatedAt'>;

export type UpdateProductInput = Omit<Product, 'id' | 'createdAt' | 'version' | 'updatedAt' | 'stock'>;

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const name = input.name.trim();
  const category = input.category.trim() || 'General';
  const barcode = input.barcode.trim() || null;
  const priceCents = centsFromPrice(input.price);
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
    price: priceCents / 100,
    stock,
    version: 1,
    createdAt,
    updatedAt: createdAt
  };

  const database = await getDatabase();
  await runInTransaction(database, async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO products
        (id, name, barcode, category, price_cents, stock, version, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      product.id,
      product.name,
      barcode,
      product.category,
      priceCents,
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
          priceCents,
          stock: product.stock,
          version: product.version,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt
        }
      },
      createdAt
    });
  });

  return product;
}

export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  const normalizedBarcode = barcode.trim();
  if (!normalizedBarcode) return null;

  const database = await getDatabase();
  const row = await database.getFirstAsync<ProductRow>(`
    SELECT id, name, barcode, category, price_cents, stock, version, deleted_at, updated_at, created_at
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
  const priceCents = centsFromPrice(input.price);
  if (!name) throw new AppError('productNameRequired');

  const database = await getDatabase();
  return runInTransaction(database, async (transaction) => {
    const current = await transaction.getFirstAsync<ProductRow>(`
      SELECT id, name, barcode, category, price_cents, stock, version, deleted_at, updated_at, created_at
      FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1;
    `, productId);
    if (!current) throw new AppError('productMissing');

    const updatedAt = new Date().toISOString();
    const nextVersion = current.version + 1;
    await transaction.runAsync(
      `UPDATE products
       SET name = ?, barcode = ?, category = ?, price_cents = ?, version = ?, updated_at = ?
       WHERE id = ? AND version = ?;`,
      name,
      barcode,
      category,
      priceCents,
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
      price: priceCents / 100,
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
          priceCents,
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
