import { Platform } from 'react-native';

import { SyncOperationType, SyncOutboxOperation } from '../db/sync/types';

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class SyncApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details: unknown,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'SyncApiError';
  }
}

export type ApiSyncOperation = {
  operationId: string;
  operationType: SyncOperationType;
  aggregateId: string;
  dependsOnOperationId: string | null;
  payload: unknown;
  createdAt: string;
};

export type PushResult = {
  operationId: string;
  status: 'applied' | 'already_applied' | 'rejected' | 'retryable' | 'blocked';
  serverSequence?: number;
  outcome?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
  };
};

export type PullChange = {
  sequence: number;
  operationId: string;
  entityType: string;
  entityId: string;
  changeType: 'upsert' | 'delete';
  payload: unknown;
  occurredAt: string;
};

export type PullResponse = {
  changes: PullChange[];
  nextCursor: number;
  hasMore: boolean;
};

function baseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return Platform.OS === 'android' ? 'http://10.0.2.2:8080' : 'http://localhost:8080';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({})) as ApiErrorPayload & T;
    if (!response.ok) {
      const error = payload.error;
      throw new SyncApiError(
        error?.message ?? `Sync request failed with status ${response.status}`,
        response.status,
        error?.code ?? 'sync_request_failed',
        error?.details,
        response.status >= 500 || response.status === 408 || response.status === 429
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof SyncApiError) throw error;
    throw new SyncApiError(
      error instanceof Error ? error.message : 'Network request failed',
      0,
      'network_unavailable',
      null,
      true
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function pushOperations(operations: SyncOutboxOperation[]): Promise<PushResult[]> {
  const response = await request<{ results: PushResult[] }>('/api/v1/sync/push', {
    method: 'POST',
    body: JSON.stringify({
      operations: operations.map((operation): ApiSyncOperation => ({
        operationId: operation.operationId,
        operationType: operation.operationType,
        aggregateId: operation.aggregateId,
        dependsOnOperationId: operation.dependsOnOperationId,
        payload: JSON.parse(operation.payloadJson),
        createdAt: operation.createdAt
      }))
    })
  });
  return response.results;
}

export async function pullChanges(after: number, limit = 100): Promise<PullResponse> {
  return request<PullResponse>(`/api/v1/sync/pull?after=${encodeURIComponent(after)}&limit=${limit}`);
}
