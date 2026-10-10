export type AppErrorCode =
  | 'databaseUnavailable'
  | 'productPrice'
  | 'productNameRequired'
  | 'productStockInteger'
  | 'stockChangeInteger'
  | 'stockAdjustmentMissing'
  | 'productMissing'
  | 'stockQuantityPositive'
  | 'emptySale'
  | 'saleQuantityPositive'
  | 'paymentMethodInvalid'
  | 'cashReceivedInvalid'
  | 'stockReservation'
  | 'saleTransaction'
  | 'unknown';

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    public readonly params: Record<string, string | number> = {}
  ) {
    super(code);
    this.name = 'AppError';
  }
}
