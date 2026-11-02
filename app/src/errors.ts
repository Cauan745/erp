export type AppErrorCode =
  | 'recoveryNativeMissing'
  | 'recoveryStorage'
  | 'networkUnavailable'
  | 'requestTimeout'
  | 'apiResponseInvalid'
  | 'productPrice'
  | 'productCost'
  | 'productNameRequired'
  | 'productStockInteger'
  | 'stockChangeInteger'
  | 'emptySale'
  | 'saleQuantityPositive'
  | 'paymentMethodInvalid'
  | 'cashReceivedInvalid'
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
