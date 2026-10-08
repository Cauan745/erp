import type React from 'react';
import { SaleLine } from './db/sale/types';

export type Tab = 'sell' | 'products' | 'sales';
export type Cart = Record<string, SaleLine>;

export type ProductForm = {
  name: string;
  price: string;
  barcode: string;
  category: string;
};

export type SetProductForm = React.Dispatch<React.SetStateAction<ProductForm>>;
