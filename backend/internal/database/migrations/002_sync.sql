ALTER TABLE products
  ADD COLUMN version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE TABLE processed_sync_operations (
  operation_id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applied', 'rejected')),
  outcome JSONB NOT NULL,
  error_code TEXT,
  error_message TEXT,
  server_sequence BIGINT,
  processed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX processed_sync_operations_aggregate_idx
  ON processed_sync_operations (aggregate_id, processed_at DESC);

CREATE TABLE change_log (
  sequence BIGSERIAL PRIMARY KEY,
  operation_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('upsert', 'delete')),
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX change_log_entity_idx ON change_log (entity_type, entity_id, sequence);
