import type React from 'react';

export type Tab = 'sell' | 'products' | 'sales';
export type CartLine = SaleLine & {
  unitPriceCents: number;
  allowInsufficientStock?: boolean;
};
export type Cart = Record<string, CartLine>;

export type ProductForm = {
  name: string;
  cost: string;
  sellingPrice: string;
  stock: string;
  barcode: string;
  category: string;
};

export type SetProductForm = React.Dispatch<React.SetStateAction<ProductForm>>;

export type StockHistoryEntry = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: string | null;
  source: 'sale' | 'adjustment';
  createdAt: string;
};

export type SaleLine = {
  productId: string; name: string; quantity: number; unitPrice: number; lineTotal: number;
};
export type PaymentMethod = 'cash' | 'debit_card' | 'credit_card' | 'pix';
export type Sale = {
  id: string; requestId: string; lines: SaleLine[]; total: number;
  paymentMethod: PaymentMethod; cashReceived: number | null; change: number | null; createdAt: string;
};
