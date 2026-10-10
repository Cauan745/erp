import { AppState } from 'react-native';

import { getDatabase } from '../db/db';
import { Database, runInTransaction } from '../db/transactions';
import {
  acknowledgeOperation,
  claimPendingOperations,
  failOperation,
  getSyncState,
  listOutboxOperations,
  retryOperationAfterNetworkFailure
} from '../db/sync/repository';
import { SyncOutboxOperation } from '../db/sync/types';
import { PaymentMethod } from '../db/sale/types';
import { pullChanges, PullChange, PushResult, pushOperations, SyncApiError } from './api';
import { registerBackgroundSync } from './background';
import { setSyncStatus } from './status';

const SYNC_CURSOR_KEY = 'server_cursor';

type RemoteProduct = {
  id: string;
  name: string;
  barcode: string;
  category: string;
  priceCents: number;
  stock: number;
  version: number;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type RemoteAdjustment = {
  id: string;
  productId: string;
  quantity: number;
  reason: string | null;
  createdAt: string;
};

type RemoteSale = {
  id: string;
  totalCents: number;
  paymentMethod: PaymentMethod;
  cashReceivedCents?: number | null;
  createdAt: string;
};

type RemoteSaleLine = {
  id: string;
  saleId: string;
  lineNumber: number;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

type RemoteOutcome = {
  product?: RemoteProduct;
  adjustment?: RemoteAdjustment;
  sale?: RemoteSale;
  lines?: RemoteSaleLine[];
  products?: RemoteProduct[];
};

let syncPromise: Promise<SyncSummary> | undefined;

export type SyncSummary = {
  pushed: number;
  rejected: number;
  pulled: number;
  error: string | null;
};

export async function synchronize(): Promise<SyncSummary> {
  if (syncPromise) return syncPromise;
  setSyncStatus('syncing');
  syncPromise = synchronizeInternal()
    .then(async (summary) => {
      const operations = await listOutboxOperations();
      const pendingCount = operations.filter((operation) => operation.status !== 'acknowledged').length;
      const hasPermanentFailure = operations.some(
        (operation) => operation.status === 'failed' && !operation.retryable
      );

      if (summary.error || summary.rejected > 0 || hasPermanentFailure) {
        setSyncStatus('error', { pendingCount, error: summary.error ?? 'sync rejected' });
      } else if (pendingCount > 0) {
        setSyncStatus('pending', { pendingCount });
      } else {
        setSyncStatus('synced', { pendingCount: 0 });
      }

      return summary;
    })
    .catch((error) => {
      setSyncStatus('error', { error: error instanceof Error ? error.message : 'sync failed' });
      throw error;
    })
    .finally(() => {
      syncPromise = undefined;
    });
  return syncPromise;
}

async function synchronizeInternal(): Promise<SyncSummary> {
  const summary: SyncSummary = { pushed: 0, rejected: 0, pulled: 0, error: null };
  let claimedOperations: SyncOutboxOperation[] = [];
  try {
    for (let pass = 0; pass < 10; pass += 1) {
      claimedOperations = await claimPendingOperations();
      if (!claimedOperations.length) break;
      const results = await pushOperations(claimedOperations);
      const pushedBefore = summary.pushed;
      await applyPushResults(claimedOperations, results, summary);
      if (summary.pushed === pushedBefore && results.every((result) => result.status === 'blocked')) break;
    }
  } catch (error) {
    summary.error = error instanceof Error ? error.message : 'sync push failed';
    if (error instanceof SyncApiError && error.retryable) {
      await Promise.all(claimedOperations.map((operation) => retryOperationAfterNetworkFailure(operation.operationId, summary.error ?? 'network unavailable')));
    }
  }

  try {
    let hasMore = true;
    while (hasMore) {
      const cursor = Number(await getSyncState(SYNC_CURSOR_KEY) ?? '0');
      const page = await pullChanges(Number.isSafeInteger(cursor) ? cursor : 0);
      if (page.changes.length) {
        await applyPullPage(page.changes, page.nextCursor);
        summary.pulled += page.changes.length;
      }
      hasMore = page.hasMore;
    }
  } catch (error) {
    summary.error = summary.error ?? (error instanceof Error ? error.message : 'sync pull failed');
  }

  return summary;
}

async function applyPushResults(
  operations: SyncOutboxOperation[],
  results: PushResult[],
  summary: SyncSummary
): Promise<void> {
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]));
  for (const result of results) {
    const operation = byId.get(result.operationId);
    if (!operation) continue;

    if (result.status === 'applied' || result.status === 'already_applied') {
      await acknowledgeOperation(
        operation.operationId,
        result.serverSequence ?? null,
        (transaction) => applyOutcome(transaction, result.outcome)
      );
      summary.pushed += 1;
      continue;
    }

    if (result.status === 'rejected') {
      await failOperation(
        operation.operationId,
        JSON.stringify(result.error ?? { message: 'operation rejected by server' }),
        false,
        null
      );
      summary.rejected += 1;
      continue;
    }

    if (result.status === 'retryable') {
      await retryOperationAfterNetworkFailure(
        operation.operationId,
        JSON.stringify(result.error ?? { message: 'server requested a retry' })
      );
      continue;
    }

    await failOperation(
      operation.operationId,
      JSON.stringify(result.error ?? { message: 'operation is waiting for a dependency' }),
      true,
      new Date(Date.now() + 1000).toISOString()
    );
  }
}

async function applyOutcome(transaction: Database, value: unknown): Promise<void> {
  if (!value || typeof value !== 'object') return;
  const outcome = value as RemoteOutcome;
  if (outcome.product) await upsertProduct(transaction, outcome.product);
  if (outcome.products) {
    for (const product of outcome.products) await upsertProduct(transaction, product);
  }
  if (outcome.adjustment) await upsertAdjustment(transaction, outcome.adjustment);
  if (outcome.sale && outcome.lines) await upsertSale(transaction, outcome.sale, outcome.lines);
}

async function applyPullPage(changes: PullChange[], nextCursor: number): Promise<void> {
  const database = await getDatabase();
  await runInTransaction(database, async (transaction) => {
    for (const change of changes) {
      const hasLocalOperation = await transaction.getFirstAsync<{ operation_id: string }>(`
        SELECT operation_id
        FROM sync_outbox
        WHERE status IN ('pending', 'in_flight', 'failed')
          AND (
            aggregate_id = ?
            OR (operation_type = 'sale.checkout' AND payload_json LIKE '%' || ? || '%')
          )
        ORDER BY created_at DESC
        LIMIT 1;
      `, change.entityId, change.entityId);

      if (hasLocalOperation && hasLocalOperation.operation_id !== change.operationId) {
        await transaction.runAsync(
          `INSERT OR IGNORE INTO sync_conflicts
            (id, operation_id, entity_type, entity_id, server_sequence, payload_json, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          cryptoSafeId(),
          hasLocalOperation.operation_id,
          change.entityType,
          change.entityId,
          change.sequence,
          JSON.stringify(change.payload),
          'local operation is still pending',
          new Date().toISOString()
        );
      }

      await applyChange(transaction, change);
    }

    await transaction.runAsync(
      `INSERT INTO sync_state (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
      SYNC_CURSOR_KEY,
      String(nextCursor),
      new Date().toISOString()
    );
  });
}

async function applyChange(transaction: Database, change: PullChange): Promise<void> {
  if (change.changeType === 'delete') {
    await transaction.runAsync(
      `INSERT INTO sync_tombstones (entity_type, entity_id, server_sequence, deleted_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET
         server_sequence = excluded.server_sequence, deleted_at = excluded.deleted_at;`,
      change.entityType,
      change.entityId,
      change.sequence,
      new Date().toISOString()
    );
    if (change.entityType === 'product') {
      await transaction.runAsync(
        `UPDATE products SET deleted_at = ?, version = version + 1 WHERE id = ?;`,
        new Date().toISOString(),
        change.entityId
      );
    }
    return;
  }

  const payload = change.payload as RemoteOutcome;
  if (change.entityType === 'product' && payload.product) {
    await upsertProduct(transaction, payload.product);
  } else if (change.entityType === 'stock_adjustment') {
    if (payload.product) await upsertProduct(transaction, payload.product);
    if (payload.adjustment) await upsertAdjustment(transaction, payload.adjustment);
  } else if (change.entityType === 'sale' && payload.sale && payload.lines) {
    for (const product of payload.products ?? []) await upsertProduct(transaction, product);
    await upsertSale(transaction, payload.sale, payload.lines);
  }
}

async function upsertProduct(transaction: Database, product: RemoteProduct): Promise<void> {
  const tombstone = await transaction.getFirstAsync<{ entity_id: string }>(`
    SELECT entity_id FROM sync_tombstones WHERE entity_type = 'product' AND entity_id = ? LIMIT 1;
  `, product.id);
  if (tombstone && !product.deletedAt) return;

  await transaction.runAsync(
    `INSERT INTO products
      (id, name, barcode, category, price_cents, stock, version, deleted_at, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, barcode = excluded.barcode, category = excluded.category,
       price_cents = excluded.price_cents, stock = excluded.stock, version = excluded.version,
       deleted_at = excluded.deleted_at, updated_at = excluded.updated_at
     WHERE products.version <= excluded.version;`,
    product.id,
    product.name,
    product.barcode || null,
    product.category,
    product.priceCents,
    product.stock,
    product.version,
    product.deletedAt ?? null,
    product.updatedAt,
    product.createdAt
  );
}

async function upsertAdjustment(transaction: Database, adjustment: RemoteAdjustment): Promise<void> {
  await transaction.runAsync(
    `INSERT INTO stock_adjustments (id, product_id, quantity, reason, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET reason = excluded.reason;`,
    adjustment.id,
    adjustment.productId,
    adjustment.quantity,
    adjustment.reason,
    adjustment.createdAt
  );
}

async function upsertSale(transaction: Database, sale: RemoteSale, lines: RemoteSaleLine[]): Promise<void> {
  await transaction.runAsync(
    `INSERT INTO sales
      (id, total_cents, payment_method, cash_received_cents, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       total_cents = excluded.total_cents,
       payment_method = excluded.payment_method,
       cash_received_cents = excluded.cash_received_cents;`,
    sale.id,
    sale.totalCents,
    sale.paymentMethod,
    sale.cashReceivedCents ?? null,
    sale.createdAt
  );
  for (const line of lines) {
    await transaction.runAsync(
      `INSERT INTO sale_items
        (id, sale_id, line_number, product_id, product_name, quantity, unit_price_cents, line_total_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         product_name = excluded.product_name, quantity = excluded.quantity,
         unit_price_cents = excluded.unit_price_cents, line_total_cents = excluded.line_total_cents;`,
      line.id,
      line.saleId,
      line.lineNumber,
      line.productId,
      line.productName,
      line.quantity,
      line.unitPriceCents,
      line.lineTotalCents
    );
  }
}

function cryptoSafeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function startSyncWorker(): () => void {
  let active = AppState.currentState === 'active';
  const run = () => {
    if (active) void synchronize();
  };
  run();
  void registerBackgroundSync();
  const interval = setInterval(run, 60_000);
  const subscription = AppState.addEventListener('change', (state) => {
    active = state === 'active';
    if (active) run();
  });
  return () => {
    clearInterval(interval);
    subscription.remove();
  };
}
