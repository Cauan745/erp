import { useEffect, useSyncExternalStore } from 'react';

import { listOutboxOperations } from '../db/sync/repository';

export type SyncStatus = 'syncing' | 'synced' | 'pending' | 'error';

export type SyncStatusSnapshot = {
  status: SyncStatus;
  pendingCount: number;
  error: string | null;
};

const initialSnapshot: SyncStatusSnapshot = {
  status: 'syncing',
  pendingCount: 0,
  error: null
};

let snapshot = initialSnapshot;
const listeners = new Set<() => void>();

function publish(next: SyncStatusSnapshot): void {
  if (
    snapshot.status === next.status &&
    snapshot.pendingCount === next.pendingCount &&
    snapshot.error === next.error
  ) {
    return;
  }

  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function setSyncStatus(
  status: SyncStatus,
  options: { pendingCount?: number; error?: string | null } = {}
): void {
  publish({
    status,
    pendingCount: options.pendingCount ?? snapshot.pendingCount,
    error: options.error ?? null
  });
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSyncStatusSnapshot(): SyncStatusSnapshot {
  return snapshot;
}

export function useSyncStatus(): SyncStatusSnapshot {
  useEffect(() => {
    let mounted = true;

    const refreshFromOutbox = async () => {
      if (snapshot.status === 'syncing' || snapshot.status === 'error') return;

      const operations = await listOutboxOperations();
      if (!mounted) return;

      const pendingCount = operations.filter((operation) => operation.status !== 'acknowledged').length;
      if (pendingCount > 0) {
        setSyncStatus('pending', { pendingCount });
      }
    };

    void refreshFromOutbox().catch(() => undefined);
    const interval = setInterval(() => {
      void refreshFromOutbox().catch(() => undefined);
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return useSyncExternalStore(subscribeSyncStatus, getSyncStatusSnapshot, getSyncStatusSnapshot);
}
