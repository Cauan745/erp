
export type Product = {
  id: string;
  name: string;
  barcode: string;
  category: string;
  price: number;
  stock: number;
  createdAt: string;
};

export type SaleLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type Sale = {
  id: string;
  lines: SaleLine[];
  total: number;
  paymentMethod: 'cash';
  createdAt: string;
};


