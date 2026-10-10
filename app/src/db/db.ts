import * as SQLite from 'expo-sqlite';

import {
  CREATE_PRODUCTS_TABLE,
  CREATE_PRODUCT_INDEXES,
  MIGRATE_PRODUCTS_TO_ALLOW_NEGATIVE_STOCK,
  SEED_PRODUCTS
} from './product/schema';
import {
  CREATE_SALES_TABLE,
  CREATE_SALE_INDEXES,
  MIGRATE_SALES_TO_PAYMENT_METHODS,
  MIGRATE_SALES_TO_REMOVE_CHANGE
} from './sale/schema';
import { CREATE_STOCK_ADJUSTMENTS_TABLE, CREATE_STOCK_ADJUSTMENT_INDEXES } from './stock/schema';
import {
  CREATE_SYNC_CONFLICTS_TABLE,
  CREATE_SYNC_INDEXES,
  CREATE_SYNC_OUTBOX_INDEXES,
  CREATE_SYNC_OUTBOX_TABLE,
  CREATE_SYNC_STATE_TABLE,
  CREATE_SYNC_TOMBSTONES_TABLE
} from './sync/schema';

const DATABASE_NAME = 'stockroom';
const DATABASE_VERSION = 8;

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

  try {
    await database.execAsync('PRAGMA foreign_keys = ON;');

    const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
    const currentVersion = versionRow?.user_version ?? 0;

    const needsStockConstraintMigration = currentVersion >= 1 && currentVersion < 2;
    const needsSyncMigration = currentVersion >= 2 && currentVersion < 4;
    const needsPaymentMigration = currentVersion >= 1 && currentVersion < 6;
    const needsChangeMigration = currentVersion >= 6 && currentVersion < 7;

    if (currentVersion < DATABASE_VERSION) {
      if (needsStockConstraintMigration || needsPaymentMigration || needsChangeMigration) {
        await database.execAsync('PRAGMA foreign_keys = OFF;');
      }

      try {
        await database.withTransactionAsync(async () => {
          await database.execAsync([
            CREATE_PRODUCTS_TABLE,
            CREATE_SALES_TABLE,
            needsStockConstraintMigration ? MIGRATE_PRODUCTS_TO_ALLOW_NEGATIVE_STOCK : '',
            needsSyncMigration ? MIGRATE_PRODUCTS_TO_ADD_SYNC_COLUMNS : '',
            needsPaymentMigration ? MIGRATE_SALES_TO_PAYMENT_METHODS : '',
            needsChangeMigration ? MIGRATE_SALES_TO_REMOVE_CHANGE : '',
            CREATE_STOCK_ADJUSTMENTS_TABLE,
            CREATE_PRODUCT_INDEXES,
            CREATE_SALE_INDEXES,
            CREATE_STOCK_ADJUSTMENT_INDEXES,
            CREATE_SYNC_OUTBOX_TABLE,
            CREATE_SYNC_OUTBOX_INDEXES,
            CREATE_SYNC_STATE_TABLE,
            CREATE_SYNC_CONFLICTS_TABLE,
            CREATE_SYNC_TOMBSTONES_TABLE,
            CREATE_SYNC_INDEXES
          ].join('\n'));

          for (const product of SEED_PRODUCTS) {
            await database.runAsync(
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

          await database.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
        });
      } finally {
        if (needsStockConstraintMigration || needsPaymentMigration || needsChangeMigration) {
          await database.execAsync('PRAGMA foreign_keys = ON;');
        }
      }
    }

    return database;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

const MIGRATE_PRODUCTS_TO_ADD_SYNC_COLUMNS = `
  ALTER TABLE products ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE products ADD COLUMN deleted_at TEXT;
`;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = initializeDatabase().catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }

  return databasePromise;
}
