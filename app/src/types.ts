import type React from 'react';
import { SaleLine } from './db/sale/types';

export type Tab = 'sell' | 'products' | 'sales';
export type CartLine = SaleLine & {
  allowInsufficientStock?: boolean;
};
export type Cart = Record<string, CartLine>;

export type ProductForm = {
  name: string;
  price: string;
  stock: string;
  barcode: string;
  category: string;
};

export type SetProductForm = React.Dispatch<React.SetStateAction<ProductForm>>;
