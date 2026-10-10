import { createUuid } from '../ids';
import { Database, runInTransaction } from '../transactions';
import { getDatabase } from '../db';
import { SyncConflict, SyncOperationType, SyncOutboxOperation } from './types';

type OutboxRow = {
  operation_id: string;
  operation_type: SyncOperationType;
  aggregate_id: string;
  depends_on_operation_id: string | null;
  payload_json: string;
  created_at: string;
  status: SyncOutboxOperation['status'];
  attempt_count: number;
  retryable: number;
  last_attempt_at: string | null;
  lease_until: string | null;
  next_attempt_at: string | null;
  last_error: string | null;
  server_sequence: number | null;
};

type SyncStateRow = { value: string };

export type EnqueueOperationInput = {
  operationId?: string;
  operationType: SyncOperationType;
  aggregateId: string;
  dependsOnOperationId?: string | null;
  payload: unknown;
  createdAt?: string;
};

export type ClaimedOperation = SyncOutboxOperation;

const outboxFromRow = (row: OutboxRow): SyncOutboxOperation => ({
  operationId: row.operation_id,
  operationType: row.operation_type,
  aggregateId: row.aggregate_id,
  dependsOnOperationId: row.depends_on_operation_id,
  payloadJson: row.payload_json,
  createdAt: row.created_at,
  status: row.status,
  attemptCount: row.attempt_count,
  retryable: row.retryable === 1,
  lastAttemptAt: row.last_attempt_at,
  leaseUntil: row.lease_until,
  nextAttemptAt: row.next_attempt_at,
  lastError: row.last_error,
  serverSequence: row.server_sequence
});

export async function enqueueOperation(
  transaction: Database,
  input: EnqueueOperationInput
): Promise<string> {
  const operationId = input.operationId ?? createUuid();
  const createdAt = input.createdAt ?? new Date().toISOString();
  await transaction.runAsync(
    `INSERT INTO sync_outbox
      (operation_id, operation_type, aggregate_id, depends_on_operation_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    operationId,
    input.operationType,
    input.aggregateId,
    input.dependsOnOperationId ?? null,
    JSON.stringify(input.payload),
    createdAt
  );
  return operationId;
}

export async function listOutboxOperations(): Promise<SyncOutboxOperation[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<OutboxRow>(`
    SELECT operation_id, operation_type, aggregate_id, depends_on_operation_id,
      payload_json, created_at, status, attempt_count, retryable,
      last_attempt_at, lease_until, next_attempt_at, last_error, server_sequence
    FROM sync_outbox
    ORDER BY created_at DESC;
  `);
  return rows.map(outboxFromRow);
}

export async function claimPendingOperations(limit = 25): Promise<ClaimedOperation[]> {
  const database = await getDatabase();
  return runInTransaction(database, async (transaction) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const leaseUntil = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
    const rows = await transaction.getAllAsync<OutboxRow>(`
      SELECT operation_id, operation_type, aggregate_id, depends_on_operation_id,
        payload_json, created_at, status, attempt_count, retryable,
        last_attempt_at, lease_until, next_attempt_at, last_error, server_sequence
      FROM sync_outbox AS operation
      WHERE (
        (operation.status = 'pending')
        OR (operation.status = 'failed' AND operation.retryable = 1 AND
          (operation.next_attempt_at IS NULL OR operation.next_attempt_at <= ?))
        OR (operation.status = 'in_flight' AND operation.lease_until IS NOT NULL AND operation.lease_until <= ?)
      )
      AND (
        operation.depends_on_operation_id IS NULL
        OR EXISTS (
          SELECT 1 FROM sync_outbox AS dependency
          WHERE dependency.operation_id = operation.depends_on_operation_id
            AND dependency.status = 'acknowledged'
        )
      )
      ORDER BY operation.created_at ASC
      LIMIT ?;
    `, nowIso, nowIso, limit);

    const claimed: SyncOutboxOperation[] = [];
    for (const row of rows) {
      await transaction.runAsync(
        `UPDATE sync_outbox
         SET status = 'in_flight', attempt_count = attempt_count + 1,
             last_attempt_at = ?, lease_until = ?, last_error = NULL
         WHERE operation_id = ?;`,
        nowIso,
        leaseUntil,
        row.operation_id
      );
      claimed.push(outboxFromRow({
        ...row,
        status: 'in_flight',
        attempt_count: row.attempt_count + 1,
        last_attempt_at: nowIso,
        lease_until: leaseUntil,
        last_error: null
      }));
    }
    return claimed;
  });
}

export async function acknowledgeOperation(
  operationId: string,
  serverSequence: number | null,
  applyOutcome?: (transaction: Database) => Promise<void>
): Promise<void> {
  const database = await getDatabase();
  await runInTransaction(database, async (transaction) => {
    if (applyOutcome) await applyOutcome(transaction);
    await transaction.runAsync(
      `UPDATE sync_outbox
       SET status = 'acknowledged', retryable = 0, lease_until = NULL,
           next_attempt_at = NULL, last_error = NULL, server_sequence = ?
       WHERE operation_id = ?;`,
      serverSequence,
      operationId
    );
  });
}

export async function failOperation(
  operationId: string,
  error: string,
  retryable: boolean,
  nextAttemptAt: string | null
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE sync_outbox
     SET status = 'failed', retryable = ?, lease_until = NULL,
         next_attempt_at = ?, last_error = ?
     WHERE operation_id = ?;`,
    retryable ? 1 : 0,
    nextAttemptAt,
    error,
    operationId
  );
}

export async function retryOperationAfterNetworkFailure(operationId: string, error: string): Promise<void> {
  const operation = (await listOutboxOperations()).find((item) => item.operationId === operationId);
  const attempt = operation?.attemptCount ?? 1;
  const delay = Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(attempt, 10));
  await failOperation(operationId, error, true, new Date(Date.now() + delay).toISOString());
}

export async function retryFailedOperation(operationId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE sync_outbox
     SET status = 'pending', retryable = 1, next_attempt_at = NULL,
         lease_until = NULL, last_error = NULL
     WHERE operation_id = ? AND status = 'failed';`,
    operationId
  );
}

export async function getSyncState(key: string): Promise<string | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<SyncStateRow>(
    'SELECT value FROM sync_state WHERE key = ? LIMIT 1;',
    key
  );
  return row?.value ?? null;
}

export async function setSyncState(key: string, value: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO sync_state (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
    key,
    value,
    new Date().toISOString()
  );
}

export async function listSyncConflicts(): Promise<SyncConflict[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    operation_id: string | null;
    entity_type: string;
    entity_id: string;
    server_sequence: number | null;
    payload_json: string;
    reason: string;
    created_at: string;
    resolved_at: string | null;
  }>(`
    SELECT id, operation_id, entity_type, entity_id, server_sequence,
      payload_json, reason, created_at, resolved_at
    FROM sync_conflicts
    WHERE resolved_at IS NULL
    ORDER BY created_at DESC;
  `);
  return rows.map((row) => ({
    id: row.id,
    operationId: row.operation_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    serverSequence: row.server_sequence,
    payloadJson: row.payload_json,
    reason: row.reason,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at
  }));
}

export async function resolveSyncConflict(conflictId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE sync_conflicts SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL;`,
    new Date().toISOString(),
    conflictId
  );
}
