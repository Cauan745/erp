export type Product = {
  id: string;
  name: string;
  barcode: string;
  category: string;
  cost: number | null;
  sellingPrice: number;
  profit: number | null;
  stock: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};
