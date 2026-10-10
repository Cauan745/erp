export const CREATE_SYNC_OUTBOX_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_outbox (
    operation_id TEXT PRIMARY KEY NOT NULL,
    operation_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    depends_on_operation_id TEXT,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'in_flight', 'failed', 'acknowledged')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    retryable INTEGER NOT NULL DEFAULT 1 CHECK (retryable IN (0, 1)),
    last_attempt_at TEXT,
    lease_until TEXT,
    next_attempt_at TEXT,
    last_error TEXT,
    server_sequence INTEGER
  );
`;

export const CREATE_SYNC_OUTBOX_INDEXES = `
  CREATE INDEX IF NOT EXISTS sync_outbox_ready_idx
    ON sync_outbox(status, retryable, next_attempt_at, created_at);

  CREATE INDEX IF NOT EXISTS sync_outbox_aggregate_idx
    ON sync_outbox(aggregate_id, status);
`;

export const CREATE_SYNC_STATE_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const CREATE_SYNC_CONFLICTS_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_conflicts (
    id TEXT PRIMARY KEY NOT NULL,
    operation_id TEXT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    server_sequence INTEGER,
    payload_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );
`;

export const CREATE_SYNC_TOMBSTONES_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_tombstones (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    server_sequence INTEGER NOT NULL,
    deleted_at TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
  );
`;

export const CREATE_SYNC_INDEXES = `
  CREATE INDEX IF NOT EXISTS sync_conflicts_created_idx
    ON sync_conflicts(created_at DESC);

  CREATE UNIQUE INDEX IF NOT EXISTS sync_conflicts_unique_pending_idx
    ON sync_conflicts(operation_id, entity_type, entity_id, server_sequence)
    WHERE resolved_at IS NULL;
`;
