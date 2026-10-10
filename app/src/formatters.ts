import { AppError, AppErrorCode } from './errors';
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
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  const cents = Math.round(parsed * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export const shortDate = (value: string, locale: Locale = 'pt-BR') =>
  new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));

const errorKeys: Record<AppErrorCode, TranslationKey> = {
  databaseUnavailable: 'errors.databaseUnavailable',
  productPrice: 'errors.productPrice',
  productNameRequired: 'errors.productNameRequired',
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
  if (error instanceof AppError) {
    return t(errorKeys[error.code], error.params);
  }

  return t('errors.unknown');
};
