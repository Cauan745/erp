import { apiRequest, ApiError } from '../api/client';
import { AppError } from '../errors';
import { Product, ProductInput, CreateProductInput, UpdateProductInput } from '../types';

function productFromResponse(value: unknown): Product {
  if (typeof value !== 'object' || value === null) throw new AppError('apiResponseInvalid');
  const p = value as Record<string, unknown>;
  const cents = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.category !== 'string'
      || (p.barcode !== null && typeof p.barcode !== 'string')
      || (p.costCents !== null && !cents(p.costCents)) || !cents(p.sellingPriceCents)
      || typeof p.stock !== 'number' || !Number.isInteger(p.stock) || p.stock < -2147483648 || p.stock > 2147483647
      || typeof p.createdAt !== 'string' || !Number.isFinite(Date.parse(p.createdAt))
      || typeof p.updatedAt !== 'string' || !Number.isFinite(Date.parse(p.updatedAt))) {
    throw new AppError('apiResponseInvalid');
  }
  return {
    id: p.id, name: p.name, barcode: p.barcode ?? '', category: p.category,
    cost: p.costCents === null ? null : p.costCents / 100, sellingPrice: p.sellingPriceCents / 100, sellingPriceCents: p.sellingPriceCents,
    profit: p.costCents === null ? null : (p.sellingPriceCents - p.costCents) / 100,
    stock: p.stock, createdAt: p.createdAt, updatedAt: p.updatedAt
  };
}

function centsFromMoney(value: number, code: 'productPrice' | 'productCost'): number {
  const cents = Math.round(value * 100);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(cents)) throw new AppError(code);
  return cents;
}

function metadata(input: ProductInput) {
  const name = input.name.trim();
  if (!name) throw new AppError('productNameRequired');
  return {
    name, barcode: input.barcode.trim(), category: input.category.trim(),
    costCents: input.cost === null ? null : centsFromMoney(input.cost, 'productCost'),
    sellingPriceCents: centsFromMoney(input.sellingPrice, 'productPrice')
  };
}

export async function listProducts(): Promise<Product[]> {
  const result = await apiRequest('/api/v1/products');
  if (!Array.isArray(result)) throw new AppError('apiResponseInvalid');
  return result.map(productFromResponse);
}

export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  try {
    return productFromResponse(await apiRequest(`/api/v1/products/by-barcode?barcode=${encodeURIComponent(barcode.trim())}`));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.code === 'product_missing') return null;
    throw error;
  }
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const stock = input.stock ?? 0;
  if (!Number.isInteger(stock) || stock < -2147483648 || stock > 2147483647) throw new AppError('productStockInteger');
  return productFromResponse(await apiRequest('/api/v1/products', {
    method: 'POST', body: JSON.stringify({ ...metadata(input), stock })
  }));
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  return productFromResponse(await apiRequest(`/api/v1/products/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(metadata(input))
  }));
}

export async function deleteProduct(id: string): Promise<void> {
  await apiRequest(`/api/v1/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
