import { Alert } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  addProductStock,
  checkout,
  createProduct,
  deleteProduct,
  findProductByBarcode,
  InsufficientStockError,
  listProducts,
  listSales,
  listStockHistory,
  adjustStock,
  STOCK_REASON_AUTO_SALE_REPLENISHMENT,
  updateProduct,
  updateStockAdjustmentReason
} from '../db';
import { Product } from '../db/product/types';
import { PaymentMethod, Sale } from '../db/sale/types';
import { StockHistoryEntry } from '../db/stock/types';
import { errorMessage } from '../formatters';
import { useI18n } from '../i18n';
import { Cart, CartLine, ProductForm, SetProductForm, Tab } from '../types';

const emptyProductForm: ProductForm = {
  name: '',
  cost: '',
  sellingPrice: '',
  stock: '0',
  barcode: '',
  category: ''
};

export function useAppState() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('sell');
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [stockHistory, setStockHistory] = useState<StockHistoryEntry[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [search, setSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerPurpose, setScannerPurpose] = useState<'sell' | 'product'>('sell');
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [stockAdjustmentProductId, setStockAdjustmentProductId] = useState<string | null>(null);
  const [stockReasonEditEntry, setStockReasonEditEntry] = useState<StockHistoryEntry | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextProducts, nextSales, nextStockHistory] = await Promise.all([
        listProducts(),
        listSales(),
        listStockHistory()
      ]);
      setProducts(nextProducts);
      setSales(nextSales);
      setStockHistory(nextStockHistory);
      setStartupError(null);
      setLoading(false);
    } catch (error) {
      console.error('Local database startup failed', error);
      setStartupError(errorMessage(error, t));
      setLoading(false);
      throw error;
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const cartLines = Object.values(cart);
  const cartTotal = cartLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const cartQuantity = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      `${product.name} ${product.barcode} ${product.category}`.toLowerCase().includes(term)
    );
  }, [products, search]);
  const filteredCatalogProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      `${product.name} ${product.barcode} ${product.category}`.toLowerCase().includes(term)
    );
  }, [products, productSearch]);
  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category.trim()).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, 'pt-BR')),
    [products]
  );
  const stockAdjustmentProduct = useMemo(
    () => products.find((product) => product.id === stockAdjustmentProductId) ?? null,
    [products, stockAdjustmentProductId]
  );

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 2400);
  };

  const addProductToCart = (product: Product, allowInsufficientStock = false) => {
    setCart((current) => {
      const existing = current[product.id];
      const quantity = (existing?.quantity ?? 0) + 1;
      return {
        ...current,
        [product.id]: {
          productId: product.id,
          name: product.name,
          quantity,
          unitPrice: product.sellingPrice,
          lineTotal: quantity * product.sellingPrice,
          allowInsufficientStock: existing?.allowInsufficientStock || allowInsufficientStock
        }
      };
    });
    showNotice(t('alerts.productAdded', { productName: product.name }));
  };

  const addStock = async (productId: string, quantity: number) => {
    try {
      await addProductStock(productId, quantity, STOCK_REASON_AUTO_SALE_REPLENISHMENT);
      await refresh();
      return true;
    } catch (error) {
      Alert.alert(t('alerts.addStockFailedTitle'), errorMessage(error, t));
      return false;
    }
  };

  const addStockAndProductToCart = async (product: Product, quantity: number) => {
    if (await addStock(product.id, quantity)) {
      addProductToCart(product);
    }
  };

  const addToCart = (product: Product) => {
    const existing = cart[product.id];
    const requested = (existing?.quantity ?? 0) + 1;
    const shortage = requested - product.stock;

    if (shortage <= 0 || existing?.allowInsufficientStock) {
      addProductToCart(product, existing?.allowInsufficientStock);
      return;
    }

    Alert.alert(
      t('alerts.notEnoughStockTitle'),
      t('alerts.notEnoughStockMessage', {
        productName: product.name,
        available: product.stock,
        requested
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('alerts.addStockForSale', { quantity: shortage }),
          onPress: () => { void addStockAndProductToCart(product, shortage); }
        },
        {
          text: t('sell.sellAnyway'),
          onPress: () => addProductToCart(product, true)
        }
      ]
    );
  };

  const updateQuantity = (line: CartLine, delta: number) => {
    if (delta > 0) {
      const product = products.find((item) => item.id === line.productId);
      const requested = line.quantity + delta;
      const shortage = requested - (product?.stock ?? 0);

      if (line.allowInsufficientStock || shortage <= 0) {
        setCart((current) => ({
          ...current,
          [line.productId]: {
            ...line,
            quantity: requested,
            lineTotal: requested * line.unitPrice
          }
        }));
        return;
      }

      Alert.alert(
        t('alerts.notEnoughStockTitle'),
        t('alerts.notEnoughStockMessage', {
          productName: line.name,
          available: product?.stock ?? 0,
          requested
        }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('alerts.addStockForSale', { quantity: shortage }),
            onPress: () => {
              if (!product) return;
              void (async () => {
                if (!(await addStock(product.id, shortage))) return;
                setCart((current) => {
                  const currentLine = current[line.productId];
                  if (!currentLine) return current;
                  return {
                    ...current,
                    [line.productId]: {
                      ...currentLine,
                      quantity: currentLine.quantity + delta,
                      lineTotal: (currentLine.quantity + delta) * currentLine.unitPrice
                    }
                  };
                });
                showNotice(t('alerts.productAdded', { productName: line.name }));
              })();
            }
          },
          {
            text: t('sell.sellAnyway'),
            onPress: () => {
              setCart((current) => ({
                ...current,
                [line.productId]: {
                  ...line,
                  quantity: requested,
                  lineTotal: requested * line.unitPrice,
                  allowInsufficientStock: true
                }
              }));
            }
          }
        ]
      );
      return;
    }

    setCart((current) => {
      const quantity = line.quantity + delta;
      if (quantity <= 0) {
        const next = { ...current };
        delete next[line.productId];
        return next;
      }
      return {
        ...current,
        [line.productId]: { ...line, quantity, lineTotal: quantity * line.unitPrice }
      };
    });
  };

  const openScanner = (purpose: 'sell' | 'product') => {
    setScannerPurpose(purpose);
    setScannerOpen(true);
  };

  const onBarcode = async (barcode: string) => {
    setScannerOpen(false);
    if (scannerPurpose === 'product') {
      setProductForm((current) => ({ ...current, barcode }));
      showNotice(t('alerts.barcodeCaptured'));
      return;
    }

    try {
      const product = await findProductByBarcode(barcode);
      if (product) {
        addToCart(product);
        setSearch('');
        return;
      }
    } catch (error) {
      Alert.alert(t('alerts.lookupFailedTitle'), errorMessage(error, t));
      return;
    }

    Alert.alert(t('alerts.productNotFoundTitle'), t('alerts.productNotFoundMessage', { barcode }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('alerts.addProduct'),
        onPress: () => {
          setTab('products');
          setProductForm({ ...emptyProductForm, barcode });
          setProductFormOpen(true);
        }
      }
    ]);
  };

  const openNewProduct = () => {
    setEditingProductId(null);
    setProductForm(emptyProductForm);
    setProductFormOpen(true);
  };

  const closeProductForm = () => {
    setProductFormOpen(false);
    setEditingProductId(null);
    setProductForm(emptyProductForm);
  };

  const saveProduct = async () => {
    const name = productForm.name.trim();
    const sellingPriceInput = productForm.sellingPrice.trim();
    const sellingPrice = Number(sellingPriceInput.replace(',', '.'));
    const costInput = productForm.cost.trim();
    const cost = costInput ? Number(costInput.replace(',', '.')) : null;
    const stock = Number(productForm.stock.trim());
    if (!name || !sellingPriceInput || !Number.isFinite(sellingPrice) || sellingPrice < 0 || (cost !== null && (!Number.isFinite(cost) || cost < 0)) || !Number.isSafeInteger(stock)) {
      Alert.alert(t('alerts.checkProductDetailsTitle'), t('alerts.checkProductDetailsMessage'));
      return;
    }

    try {
      const wasEditing = Boolean(editingProductId);
      const input = {
        name,
        cost,
        sellingPrice,
        stock,
        barcode: productForm.barcode.trim(),
        category: productForm.category.trim() || 'General'
      };
      if (editingProductId) {
        await updateProduct(editingProductId, input);
      } else {
        await createProduct(input);
      }
      closeProductForm();
      await refresh();
      showNotice(t(wasEditing ? 'alerts.productUpdated' : 'alerts.productSaved'));
    } catch (error) {
      Alert.alert(t('alerts.saveProductFailedTitle'), errorMessage(error, t));
    }
  };

  const editProduct = (product: Product) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      cost: product.cost === null ? '' : String(product.cost),
      sellingPrice: String(product.sellingPrice),
      stock: String(product.stock),
      barcode: product.barcode,
      category: product.category
    });
    setTab('products');
    setProductFormOpen(true);
  };

  const removeProduct = (product: Product) => {
    Alert.alert(
      t('products.deleteProduct'),
      t('products.deleteProductMessage', { productName: product.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteProduct(product.id);
                await refresh();
                showNotice(t('alerts.productDeleted'));
              } catch (error) {
                showNotice(`${t('alerts.deleteProductFailedTitle')}: ${errorMessage(error, t)}`);
              }
            })();
          }
        }
      ]
    );
  };

  const cancelProductEdit = () => {
    closeProductForm();
  };

  const saveStockAdjustment = async (quantityInput: string, reason: string) => {
    if (!stockAdjustmentProductId) return;

    const quantity = Number(quantityInput.trim());
    if (!Number.isSafeInteger(quantity) || quantity === 0) {
      Alert.alert(t('alerts.checkStockChangeTitle'), t('alerts.checkStockChangeMessage'));
      return;
    }

    try {
      await adjustStock(stockAdjustmentProductId, quantity, reason);
      setStockAdjustmentProductId(null);
      await refresh();
      showNotice(t('alerts.stockUpdated'));
    } catch (error) {
      Alert.alert(t('alerts.updateStockFailedTitle'), errorMessage(error, t));
    }
  };

  const saveStockReason = async (reason: string) => {
    if (!stockReasonEditEntry || stockReasonEditEntry.source !== 'adjustment') return;

    try {
      await updateStockAdjustmentReason(stockReasonEditEntry.id, reason);
      setStockReasonEditEntry(null);
      await refresh();
      showNotice(t('alerts.stockReasonUpdated'));
    } catch (error) {
      Alert.alert(t('alerts.updateStockReasonFailedTitle'), errorMessage(error, t));
    }
  };

  const retryCheckoutAfterAddingStock = async (
    shortage: InsufficientStockError['shortage'],
    paymentMethod: PaymentMethod,
    cashReceivedCents: number | null
  ) => {
    try {
      await addProductStock(
        shortage.productId,
        shortage.requested - shortage.available,
        STOCK_REASON_AUTO_SALE_REPLENISHMENT
      );
      await refresh();
    } catch (error) {
      Alert.alert(t('alerts.addStockFailedTitle'), errorMessage(error, t));
      return;
    }

    await completeCheckout(paymentMethod, cashReceivedCents);
  };

  const completeCheckout = async (paymentMethod: PaymentMethod, cashReceivedCents: number | null, extraAllowedProductId?: string): Promise<void> => {
    if (!cartLines.length) return;
    try {
      const allowInsufficientStockProductIds = cartLines
        .filter((line) => line.allowInsufficientStock)
        .map((line) => line.productId);
      if (extraAllowedProductId && !allowInsufficientStockProductIds.includes(extraAllowedProductId)) {
        allowInsufficientStockProductIds.push(extraAllowedProductId);
      }
      await checkout(cartLines, {
        allowInsufficientStockProductIds,
        paymentMethod,
        ...(cashReceivedCents === null ? {} : { cashReceivedCents })
      });
      setCart({});
      setCheckoutOpen(false);
      setCartOpen(false);
      try {
        await refresh();
      } catch (refreshError) {
        console.error('Local refresh after checkout failed', refreshError);
      }
      showNotice(t('alerts.saleSaved'));
    } catch (error) {
      console.error('Checkout failed before local sale confirmation', error);
      if (error instanceof InsufficientStockError) {
        const { shortage } = error;
        Alert.alert(
          t('alerts.notEnoughStockTitle'),
          t('alerts.notEnoughStockMessage', shortage),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('alerts.addStockForSale', { quantity: shortage.requested - shortage.available }),
              onPress: () => { void retryCheckoutAfterAddingStock(shortage, paymentMethod, cashReceivedCents); }
            },
            {
              text: t('sell.sellAnyway'),
              onPress: () => { void completeCheckout(paymentMethod, cashReceivedCents, shortage.productId); }
            }
          ]
        );
        return;
      }
      Alert.alert(t('alerts.completeSaleFailedTitle'), errorMessage(error, t));
    }
  };

  const retry = () => {
    setLoading(true);
    setStartupError(null);
    void refresh().catch(() => undefined);
  };

  return {
    tab,
    setTab,
    products,
    categories,
    sales,
    stockHistory,
    productForm,
    editingProductId,
    productFormOpen,
    setProductForm: setProductForm as SetProductForm,
    filteredProducts,
    filteredCatalogProducts,
    search,
    setSearch,
    productSearch,
    setProductSearch,
    cartLines,
    cartTotal,
    cartQuantity,
    notice,
    scannerOpen,
    cartOpen,
    checkoutOpen,
    setScannerOpen,
    setCartOpen,
    setCheckoutOpen,
    stockAdjustmentProduct,
    stockAdjustmentOpen: Boolean(stockAdjustmentProductId),
    openStockAdjustment: setStockAdjustmentProductId,
    closeStockAdjustment: () => setStockAdjustmentProductId(null),
    stockReasonEditEntry,
    stockReasonEditOpen: Boolean(stockReasonEditEntry),
    openStockReasonEdit: (entry: StockHistoryEntry) => {
      if (entry.source === 'adjustment') setStockReasonEditEntry(entry);
    },
    closeStockReasonEdit: () => setStockReasonEditEntry(null),
    saveStockReason,
    openScanner,
    addToCart,
    updateQuantity,
    onBarcode,
    saveProduct,
    openNewProduct,
    closeProductForm,
    editProduct,
    deleteProduct: removeProduct,
    cancelProductEdit,
    completeCheckout,
    saveStockAdjustment,
    loading,
    startupError,
    retry
  };
}
