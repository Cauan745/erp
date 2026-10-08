export type StockHistoryEntry = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  reason: string | null;
  source: 'sale' | 'adjustment';
  createdAt: string;
};
