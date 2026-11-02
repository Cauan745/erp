import { ApiError } from './api/client';
import { AppError, AppErrorCode } from './errors';
import { isDefinitiveRejection } from './api/requestRecovery';
import { Locale, TranslationKey, Translator } from './i18n';

export const money = (value: number, locale: Locale = 'pt-BR') =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'BRL'
  }).format(value);

export function parseMoneyToCents(value: string, locale: Locale = 'pt-BR'): number | null {
  const trimmed = value.trim().replace(/[^\d,.-]/g, '');
  if (!trimmed) return null;

  const normalized = locale === 'pt-BR' && trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed.replace(/,/g, '');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const cents = BigInt(whole || '0') * 100n + BigInt((fraction + '00').slice(0, 2))
    + (fraction.length > 2 && fraction[2] >= '5' ? 1n : 0n);
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

export const shortDate = (value: string, locale: Locale = 'pt-BR') =>
  new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));

const errorKeys: Record<AppErrorCode, TranslationKey> = {
  recoveryNativeMissing: 'errors.recoveryNativeMissing',
  recoveryStorage: 'errors.recoveryStorage',
  networkUnavailable: 'errors.networkUnavailable',
  requestTimeout: 'errors.requestTimeout',
  apiResponseInvalid: 'errors.apiResponseInvalid',
  databaseUnavailable: 'errors.databaseUnavailable',
  productPrice: 'errors.productPrice',
  productCost: 'errors.productCost',
  productNameRequired: 'errors.productNameRequired',
  productNameDuplicate: 'errors.productNameDuplicate',
  productBarcodeDuplicate: 'errors.productBarcodeDuplicate',
  productStockInteger: 'errors.productStockInteger',
  stockChangeInteger: 'errors.stockChangeInteger',
  stockAdjustmentMissing: 'errors.stockAdjustmentMissing',
  productMissing: 'errors.productMissing',
  stockQuantityPositive: 'errors.stockQuantityPositive',
  emptySale: 'errors.emptySale',
  saleQuantityPositive: 'errors.saleQuantityPositive',
  paymentMethodInvalid: 'errors.paymentMethodInvalid',
  cashReceivedInvalid: 'errors.cashReceivedInvalid',
  stockReservation: 'errors.stockReservation',
  saleTransaction: 'errors.saleTransaction',
  unknown: 'errors.unknown'
};

export const errorMessage = (error: unknown, t: Translator) => {
  if (error instanceof ApiError) {
    const keys: Record<string, TranslationKey> = {
      product_name_taken: 'errors.productNameDuplicate', barcode_taken: 'errors.productBarcodeDuplicate',
      adjustment_missing: 'errors.stockAdjustmentMissing', numeric_overflow: 'errors.numericOverflow',
      request_id_reused: 'errors.requestIdReused', product_missing: 'errors.productMissing', validation_failed: 'errors.validationFailed',
      cash_received_invalid: 'errors.cashReceivedInvalid', insufficient_stock: 'alerts.notEnoughStockTitle',
      total_changed: 'checkout.priceChanged', inventory_busy: 'errors.inventoryBusy', internal_error: 'errors.apiFailure'
    };
    return t(keys[error.code] ?? 'errors.apiFailure');
  }
  if (error instanceof AppError) {
    return t(errorKeys[error.code], error.params);
  }

  return t('errors.unknown');
};

export function readErrorMessage(error: unknown, t: Translator): string {
  if (error instanceof ApiError) return t('errors.readFailed');
  if (error instanceof AppError) {
    if (error.code === 'requestTimeout') return t('errors.readTimeout');
    if (error.code === 'apiResponseInvalid') return t('errors.readInvalid');
  }
  return errorMessage(error, t);
}

export function uncertainMutation(error: unknown): boolean {
  if (error instanceof ApiError) return !isDefinitiveRejection(error)
    && !((error.status === 409 && ['product_name_taken', 'barcode_taken'].includes(error.code))
      || (error.status === 404 && error.code === 'adjustment_missing'));
  if (error instanceof AppError) return ['networkUnavailable', 'requestTimeout', 'apiResponseInvalid', 'unknown'].includes(error.code);
  return true;
}

export function mutationErrorMessage(error: unknown, t: Translator): string {
  return uncertainMutation(error) ? t('writes.uncertain') : errorMessage(error, t);
}
