import { API_BASE_URL, ApiError, apiRequest } from '../api/client';
import { createUuid } from '../api/ids';
import { clearRecoveryMarker, isDefinitiveRejection, RecoveryMarker, saveRecoveryMarker } from '../api/requestRecovery';
import { AppError } from '../errors';
import { CartLine, CheckoutInput, PaymentMethod, PriceReview, Sale, Shortage } from '../types';

const money = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const quantity = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 2147483647;
const uuid = (v: unknown): v is string => typeof v === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const methods: PaymentMethod[] = ['cash', 'debit_card', 'credit_card', 'pix'];
type ItemDto = { id: string; productId: string; lineNumber: number; productName: string;
  quantity: number; unitPriceCents: number; lineTotalCents: number };
type SaleDto = { id: string; requestId: string; totalCents: number; paymentMethod: PaymentMethod;
  cashReceivedCents: number | null; changeCents: number | null; createdAt: string; items: ItemDto[] };
function sale(value: unknown): Sale {
  const s = value as SaleDto | null;
  if (!s || !uuid(s.id) || !uuid(s.requestId) || !money(s.totalCents) || !methods.includes(s.paymentMethod)
      || typeof s.createdAt !== 'string' || !Number.isFinite(Date.parse(s.createdAt))
      || !Array.isArray(s.items) || !s.items.length || s.items.some((i, n) => !i || !uuid(i.id) || !uuid(i.productId)
        || i.lineNumber !== n || typeof i.productName !== 'string' || !quantity(i.quantity)
        || !money(i.unitPriceCents) || !money(i.lineTotalCents))
      || new Set(s.items.map(i => i.productId)).size !== s.items.length
      || s.items.reduce((sum, i) => sum + BigInt(i.lineTotalCents), 0n) !== BigInt(s.totalCents)
      || (s.paymentMethod === 'cash' ? !money(s.cashReceivedCents) || s.cashReceivedCents < s.totalCents
        || s.changeCents !== s.cashReceivedCents - s.totalCents : s.cashReceivedCents !== null || s.changeCents !== null))
    throw new AppError('apiResponseInvalid');
  return { id: s.id, requestId: s.requestId, total: s.totalCents / 100, paymentMethod: s.paymentMethod,
    cashReceived: s.cashReceivedCents === null ? null : s.cashReceivedCents / 100,
    change: s.changeCents === null ? null : s.changeCents / 100, createdAt: s.createdAt,
    lines: s.items.map(i => ({ productId: i.productId, name: i.productName, quantity: i.quantity,
      unitPrice: i.unitPriceCents / 100, lineTotal: i.lineTotalCents / 100 })) };
}
export function checkoutInput(lines: CartLine[], paymentMethod: PaymentMethod, cash: number | null): CheckoutInput {
  if (!lines.length) throw new AppError('emptySale');
  let total = 0;
  for (const line of lines) {
    if (!uuid(line.productId) || !quantity(line.quantity)) throw new AppError('saleQuantityPositive');
    const price = line.unitPriceCents;
    if (!money(price) || !money(price * line.quantity) || !money(total + price * line.quantity))
      throw new AppError('productPrice');
    total += price * line.quantity;
  }
  if (!methods.includes(paymentMethod)) throw new AppError('paymentMethodInvalid');
  if (paymentMethod === 'cash' ? !money(cash) || cash < total : cash !== null) throw new AppError('cashReceivedInvalid');
  return { items: lines.map(l => ({ productId: l.productId, quantity: l.quantity })), paymentMethod,
    cashReceivedCents: cash, expectedTotalCents: total,
    allowInsufficientStockProductIds: lines.filter(l => l.allowInsufficientStock).map(l => l.productId) };
}
export function priceReview(error: ApiError, input: CheckoutInput): PriceReview {
  const d = error.details as PriceReview;
  if (!d || !money(d.actualTotalCents) || !Array.isArray(d.items) || d.items.length !== input.items.length
      || d.items.some(i => !i || typeof i.productName !== 'string' || !money(i.unitPriceCents) || !money(i.lineTotalCents)
        || !input.items.some(l => l.productId === i.productId && l.quantity === i.quantity)
        || i.lineTotalCents !== i.quantity * i.unitPriceCents)
      || new Set(d.items.map(i => i.productId)).size !== d.items.length
      || d.items.reduce((sum, i) => sum + BigInt(i.lineTotalCents), 0n) !== BigInt(d.actualTotalCents))
    throw new AppError('apiResponseInvalid');
  return d;
}
export function stockShortages(error: ApiError, input: CheckoutInput): Shortage[] {
  const rows = (error.details as { shortages?: Shortage[] })?.shortages;
  if (!Array.isArray(rows) || !rows.length || rows.some(s => !s || typeof s.productName !== 'string'
      || !Number.isInteger(s.available) || s.available < -2147483648 || s.available > 2147483647
      || !quantity(s.requested) || s.available >= s.requested
      || !input.items.some(l => l.productId === s.productId && l.quantity === s.requested)
      || input.allowInsufficientStockProductIds.includes(s.productId))
      || new Set(rows.map(s => s.productId)).size !== rows.length) throw new AppError('apiResponseInvalid');
  return rows;
}
export async function checkout(input: CheckoutInput, onSubmitted?: (marker: RecoveryMarker) => void): Promise<Sale> {
  const marker: RecoveryMarker = { requestId: createUuid(), operationType: 'checkout',
    apiBaseUrl: API_BASE_URL, submittedAt: new Date().toISOString() };
  await saveRecoveryMarker(marker);
  onSubmitted?.(marker);
  let saved: Sale;
  try {
    const payload = await apiRequest('/api/v1/sales/checkout', {
      method: 'POST', body: JSON.stringify({ requestId: marker.requestId, ...input })
    });
    saved = sale(payload);
    const dto = payload as SaleDto;
    if (saved.requestId !== marker.requestId || dto.totalCents !== input.expectedTotalCents
        || dto.paymentMethod !== input.paymentMethod || dto.cashReceivedCents !== input.cashReceivedCents
        || dto.items.length !== input.items.length
        || dto.items.some(i => !input.items.some(l => l.productId === i.productId && l.quantity === i.quantity)))
      throw new AppError('apiResponseInvalid');
  } catch (error) {
    // A malformed conflict cannot safely update the cart or discard its recovery reminder.
    if (error instanceof ApiError && error.code === 'total_changed') priceReview(error, input);
    if (error instanceof ApiError && error.code === 'insufficient_stock') stockShortages(error, input);
    if (isDefinitiveRejection(error)) await clearRecoveryMarker(marker).catch(() => undefined);
    throw error;
  }
  await clearRecoveryMarker(marker).catch(() => undefined);
  return saved;
}
export async function listSales(): Promise<Sale[]> {
  const rows = await apiRequest('/api/v1/sales');
  if (!Array.isArray(rows)) throw new AppError('apiResponseInvalid');
  return rows.map(sale);
}
export async function lookupSale(marker: RecoveryMarker): Promise<Sale> {
  const saved = sale(await apiRequest(`/api/v1/sales/by-request-id/${encodeURIComponent(marker.requestId)}`, {}, marker.apiBaseUrl));
  if (saved.requestId !== marker.requestId) throw new AppError('apiResponseInvalid');
  return saved;
}
