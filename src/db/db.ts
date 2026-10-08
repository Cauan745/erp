import * as SQLite from 'expo-sqlite';

import { CREATE_PRODUCTS_TABLE, CREATE_PRODUCT_INDEXES, SEED_PRODUCTS } from './product/schema';
import { CREATE_SALES_TABLE, CREATE_SALE_INDEXES } from './sale/schema';

const DATABASE_NAME = 'stockroom';
const DATABASE_VERSION = 1;

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

  try {
    await database.execAsync('PRAGMA foreign_keys = ON;');

    const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
    const currentVersion = versionRow?.user_version ?? 0;

    if (currentVersion < DATABASE_VERSION) {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync([
          CREATE_PRODUCTS_TABLE,
          CREATE_SALES_TABLE,
          CREATE_PRODUCT_INDEXES,
          CREATE_SALE_INDEXES
        ].join('\n'));

        for (const product of SEED_PRODUCTS) {
          await transaction.runAsync(
            `INSERT OR IGNORE INTO products
              (id, name, barcode, category, price_cents, stock, updated_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
            product.id,
            product.name,
            product.barcode,
            product.category,
            product.priceCents,
            product.stock,
            product.createdAt,
            product.createdAt
          );
        }

        await transaction.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
      });
    }

    return database;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = initializeDatabase().catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }

  return databasePromise;
}
