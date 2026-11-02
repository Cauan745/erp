import { TurboModuleRegistry } from 'react-native';
import { ApiError } from './client';
import { AppError } from '../errors';

export type RecoveryMarker = {
  requestId: string; operationType: 'adjustment' | 'checkout'; apiBaseUrl: string; submittedAt: string;
};
const KEY = 'stockroom.request-recovery.v1';
// Check before importing: Metro can report an import-time native-module error as fatal even inside a catch.
async function storage() {
  if (!TurboModuleRegistry.get('RNCAsyncStorage')
      && !TurboModuleRegistry.get('RNC_AsyncSQLiteDBStorage')
      && !TurboModuleRegistry.get('PlatformLocalStorage')) {
    throw new AppError('recoveryNativeMissing');
  }
  return (await import('@react-native-async-storage/async-storage')).default;
}
let serial: Promise<unknown> = Promise.resolve();

function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const result = serial.then(work);
  serial = result.catch(() => undefined);
  return result;
}
async function read(): Promise<RecoveryMarker[]> {
  try {
    const raw = await (await storage()).getItem(KEY);
    if (raw === null) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.some(m => !m || typeof m.requestId !== 'string'
        || !['adjustment', 'checkout'].includes(m.operationType) || typeof m.apiBaseUrl !== 'string'
        || !/^https?:\/\//.test(m.apiBaseUrl) || typeof m.submittedAt !== 'string'
        || !Number.isFinite(Date.parse(m.submittedAt)))) throw new Error();
    return value.map(m => ({ requestId: m.requestId, operationType: m.operationType,
      apiBaseUrl: m.apiBaseUrl, submittedAt: m.submittedAt }));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('recoveryStorage');
  }
}
export function listRecoveryMarkers(): Promise<RecoveryMarker[]> { return exclusive(read); }
const same = (a: RecoveryMarker, b: RecoveryMarker) => a.requestId === b.requestId
  && a.operationType === b.operationType && a.apiBaseUrl === b.apiBaseUrl;
export function saveRecoveryMarker(marker: RecoveryMarker): Promise<void> {
  return exclusive(async () => {
    const markers = await read();
    if (!markers.some(m => same(m, marker))) markers.push(marker);
    try { await (await storage()).setItem(KEY, JSON.stringify(markers)); }
    catch { throw new AppError('recoveryStorage'); }
  });
}
export function clearRecoveryMarker(marker: RecoveryMarker): Promise<void> {
  return exclusive(async () => {
    const markers = await read();
    try { await (await storage()).setItem(KEY, JSON.stringify(markers.filter(m => !same(m, marker)))); }
    catch { throw new AppError('recoveryStorage'); }
  });
}
// Only structured contract rejections that the server returns after rollback permit removal.
export function isDefinitiveRejection(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return (error.status === 400 && error.code === 'validation_failed')
    || (error.status === 404 && error.code === 'product_missing')
    || (error.status === 409 && error.code === 'request_id_reused')
    || (error.status === 422 && error.code === 'numeric_overflow')
    || (error.status === 503 && error.code === 'inventory_busy');
}
