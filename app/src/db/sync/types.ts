export const SYNC_OPERATION_TYPES = {
  productCreate: 'product.create',
  productUpdate: 'product.update',
  productDelete: 'product.delete',
  stockAdjustment: 'stock.adjustment',
  stockReasonUpdate: 'stock.reason.update',
  saleCheckout: 'sale.checkout'
} as const;

export type SyncOperationType = typeof SYNC_OPERATION_TYPES[keyof typeof SYNC_OPERATION_TYPES];
export type SyncOutboxStatus = 'pending' | 'in_flight' | 'failed' | 'acknowledged';

export type SyncOutboxOperation = {
  operationId: string;
  operationType: SyncOperationType;
  aggregateId: string;
  dependsOnOperationId: string | null;
  payloadJson: string;
  createdAt: string;
  status: SyncOutboxStatus;
  attemptCount: number;
  retryable: boolean;
  lastAttemptAt: string | null;
  leaseUntil: string | null;
  nextAttemptAt: string | null;
  lastError: string | null;
  serverSequence: number | null;
};

export type SyncConflict = {
  id: string;
  operationId: string | null;
  entityType: string;
  entityId: string;
  serverSequence: number | null;
  payloadJson: string;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
};
