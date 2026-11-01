export type SaleLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type PaymentMethod = 'cash' | 'debit_card' | 'credit_card' | 'pix';

export type Sale = {
  id: string;
  lines: SaleLine[];
  total: number;
  paymentMethod: PaymentMethod;
  cashReceived: number | null;
  createdAt: string;
};
