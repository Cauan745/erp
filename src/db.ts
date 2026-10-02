import * as SQLite from 'expo-sqlite';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { createRxDatabase, RxCollection, RxDatabase } from 'rxdb';
import {
  getRxStorageSQLiteTrial,
  getSQLiteBasicsExpoSQLiteAsync
} from 'rxdb/plugins/storage-sqlite';

export type ProductDoc = {
  id: string;
  name: string;
  barcode: string;
  category: string;
  price: number;
  stock: number;
  createdAt: string;
};

export type SaleLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type SaleDoc = {
  id: string;
  lines: SaleLine[];
  total: number;
  paymentMethod: 'cash';
  createdAt: string;
};

type Collections = {
  products: RxCollection<ProductDoc>;
  sales: RxCollection<SaleDoc>;
};

export type AppDatabase = RxDatabase<Collections>;

let dbPromise: Promise<AppDatabase> | undefined;
const DATABASE_INITIALIZATION_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Local database initialization timed out after ${timeoutMs / 1000} seconds.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function resetDatabasePromise(error: unknown): never {
  // A failed native-module/database initialization must not poison retries.
  dbPromise = undefined;
  throw error;
}

const productSchema = {
  title: 'product schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 80 },
    name: { type: 'string' },
    barcode: { type: 'string' },
    category: { type: 'string' },
    price: { type: 'number', minimum: 0 },
    stock: { type: 'number', minimum: 0 },
    createdAt: { type: 'string' }
  },
  required: ['id', 'name', 'barcode', 'category', 'price', 'stock', 'createdAt'],
  indexes: ['barcode', 'createdAt']
} as const;

const saleSchema = {
  title: 'sale schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 80 },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          name: { type: 'string' },
          quantity: { type: 'number', minimum: 1 },
          unitPrice: { type: 'number', minimum: 0 },
          lineTotal: { type: 'number', minimum: 0 }
        },
        required: ['productId', 'name', 'quantity', 'unitPrice', 'lineTotal']
      }
    },
    total: { type: 'number', minimum: 0 },
    paymentMethod: { type: 'string' },
    createdAt: { type: 'string' }
  },
  required: ['id', 'lines', 'total', 'paymentMethod', 'createdAt'],
  indexes: ['createdAt']
} as const;

const seedProducts: ProductDoc[] = [
  {
    id: 'prod-coffee',
    name: 'House Blend Coffee',
    barcode: '7891000100103',
    category: 'Beverages',
    price: 18.9,
    stock: 24,
    createdAt: '2026-01-01T09:00:00.000Z'
  },
  {
    id: 'prod-oat',
    name: 'Oat Milk 1L',
    barcode: '7891000100104',
    category: 'Beverages',
    price: 12.5,
    stock: 16,
    createdAt: '2026-01-01T09:00:00.000Z'
  },
  {
    id: 'prod-bread',
    name: 'Sourdough Loaf',
    barcode: '',
    category: 'Bakery',
    price: 22,
    stock: 8,
    createdAt: '2026-01-01T09:00:00.000Z'
  }
];

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getDatabase(): Promise<AppDatabase> {
  if (dbPromise) return dbPromise;

  const initialization = withTimeout((async () => {
    let db: AppDatabase | undefined;
    try {
      db = await createRxDatabase<Collections>({
        name: 'stockroom',
        // React Native does not expose Web Crypto's crypto.subtle. Use Expo's
        // native SHA-256 implementation instead of RxDB's browser default.
        hashFunction: (input) => digestStringAsync(CryptoDigestAlgorithm.SHA256, input),
        storage: getRxStorageSQLiteTrial({
          sqliteBasics: getSQLiteBasicsExpoSQLiteAsync(SQLite.openDatabaseAsync)
        }),
        multiInstance: false,
        eventReduce: true
      });

      await db.addCollections({
        products: { schema: productSchema },
        sales: { schema: saleSchema }
      });

      const productCount = await db.products.count().exec();
      if (productCount === 0) {
        await db.products.bulkInsert(seedProducts);
      }
      return db;
    } catch (error) {
      // Close partially-created RxDB instances before allowing a retry.
      await db?.close().catch(() => undefined);
      throw error;
    }
  })(), DATABASE_INITIALIZATION_TIMEOUT_MS);

  dbPromise = initialization.catch(resetDatabasePromise);

  return dbPromise;
}

export async function createProduct(input: Omit<ProductDoc, 'id' | 'createdAt'>) {
  const db = await getDatabase();
  const product: ProductDoc = {
    ...input,
    id: id('product'),
    createdAt: new Date().toISOString()
  };
  await db.products.insert(product);
  return product;
}

export async function findProductByBarcode(barcode: string) {
  const db = await getDatabase();
  return db.products.findOne({ selector: { barcode } }).exec();
}

export async function checkout(lines: SaleLine[]) {
  const db = await getDatabase();
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  for (const line of lines) {
    const product = await db.products.findOne(line.productId).exec();
    if (product) {
      await product.incrementalPatch({
        stock: Math.max(0, product.stock - line.quantity)
      });
    }
  }

  const sale: SaleDoc = {
    id: id('sale'),
    lines,
    total,
    paymentMethod: 'cash',
    createdAt: new Date().toISOString()
  };
  await db.sales.insert(sale);
  return sale;
}

export { id as createId };
