import { API_BASE_URL, apiRequest } from '../api/client';
import { createUuid } from '../api/ids';
import { clearRecoveryMarker, isDefinitiveRejection, RecoveryMarker, saveRecoveryMarker } from '../api/requestRecovery';
import { AppError } from '../errors';
import { Adjustment, StockHistoryEntry } from '../types';

const integer = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
  && n >= -2147483648 && n <= 2147483647 && n !== 0;
const uuid = (v: unknown): v is string => typeof v === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function adjustment(value: unknown): Adjustment {
  const a = value as Adjustment | null;
  if (!a || !uuid(a.id) || !uuid(a.requestId) || !uuid(a.productId) || !integer(a.quantity)
      || (a.reason !== null && typeof a.reason !== 'string') || typeof a.createdAt !== 'string'
      || !Number.isFinite(Date.parse(a.createdAt))) throw new AppError('apiResponseInvalid');
  return a;
}
export async function adjustStock(productId: string, quantity: number, reason: string): Promise<Adjustment> {
  if (!integer(quantity)) throw new AppError('stockChangeInteger');
  const marker: RecoveryMarker = { requestId: createUuid(), operationType: 'adjustment',
    apiBaseUrl: API_BASE_URL, submittedAt: new Date().toISOString() };
  await saveRecoveryMarker(marker);
  let saved: Adjustment;
  try {
    saved = adjustment(await apiRequest(`/api/v1/products/${encodeURIComponent(productId)}/stock`, {
      method: 'POST', body: JSON.stringify({ requestId: marker.requestId, quantity, reason: reason.trim() })
    }));
    if (saved.requestId !== marker.requestId || saved.productId !== productId || saved.quantity !== quantity)
      throw new AppError('apiResponseInvalid');
  } catch (error) {
    if (isDefinitiveRejection(error)) await clearRecoveryMarker(marker).catch(() => undefined);
    throw error;
  }
  // Storage failure after confirmation must never turn a committed write into a failed write.
  await clearRecoveryMarker(marker).catch(() => undefined);
  return saved;
}
export async function lookupAdjustment(marker: RecoveryMarker): Promise<Adjustment> {
  const saved = adjustment(await apiRequest(`/api/v1/stock/adjustments/by-request-id/${encodeURIComponent(marker.requestId)}`,
    {}, marker.apiBaseUrl));
  if (saved.requestId !== marker.requestId) throw new AppError('apiResponseInvalid');
  return saved;
}
export async function updateStockReason(id: string, reason: string | null): Promise<Adjustment> {
  const saved = adjustment(await apiRequest(`/api/v1/stock/adjustments/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({ reason })
  }));
  if (saved.id !== id) throw new AppError('apiResponseInvalid');
  return saved;
}
export async function listStockHistory(limit = 50): Promise<StockHistoryEntry[]> {
  const rows = await apiRequest(`/api/v1/stock/history?limit=${limit}`);
  if (!Array.isArray(rows)) throw new AppError('apiResponseInvalid');
  return rows.map(row => {
    const h = row as StockHistoryEntry;
    if (!h || !uuid(h.id) || !uuid(h.productId) || typeof h.productName !== 'string' || !integer(h.quantity)
        || !['sale', 'adjustment'].includes(h.source) || (h.source === 'sale' && h.quantity >= 0)
        || (h.reason !== null && typeof h.reason !== 'string') || typeof h.createdAt !== 'string'
        || !Number.isFinite(Date.parse(h.createdAt))) throw new AppError('apiResponseInvalid');
    return h;
  });
}
