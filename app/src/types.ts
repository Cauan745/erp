import type { Dispatch, SetStateAction } from 'react';

export type Product = {
  id: string; name: string; barcode: string; category: string;
  cost: number | null; sellingPrice: number; sellingPriceCents: number; profit: number | null; stock: number;
  createdAt: string; updatedAt: string;
};
export type ProductInput = {
  name: string; barcode: string; category: string; cost: number | null; sellingPrice: number;
};
export type CreateProductInput = ProductInput & { stock?: number };
export type UpdateProductInput = ProductInput;

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

export type SetProductForm = Dispatch<SetStateAction<ProductForm>>;

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

export type Adjustment = {
  id: string; requestId: string; productId: string; quantity: number; reason: string | null; createdAt: string;
};

export type CheckoutInput = { items: { productId: string; quantity: number }[]; paymentMethod: PaymentMethod;
  cashReceivedCents: number | null; expectedTotalCents: number; allowInsufficientStockProductIds: string[] };

export type PriceReview = { actualTotalCents: number; items: { productId: string; productName: string;
  quantity: number; unitPriceCents: number; lineTotalCents: number }[] };

export type Shortage = { productId: string; productName: string; requested: number; available: number };
