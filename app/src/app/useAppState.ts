import { Alert } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createProduct, deleteProduct, findProductByBarcode, listProducts, updateProduct, Product } from '../repositories';
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
  const scanAccepted = useRef(true);
  const productWritePending = useRef(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const hasLoaded = useRef(false);
  const catalogRevision = useRef(0);
  const refreshPending = useRef<Promise<void> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('sell');
  const [products, setProducts] = useState<Product[]>([]);
  const sales: Sale[] = [];
  const stockHistory: StockHistoryEntry[] = [];
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

  const refresh = useCallback(() => {
    if (refreshPending.current) return refreshPending.current;
    setRefreshing(true);
    const revision = catalogRevision.current;
    const request = (async () => {
      try {
        const nextProducts = await listProducts();
        if (revision === catalogRevision.current) setProducts(nextProducts);
        hasLoaded.current = true;
        setStartupError(null);
        setLoading(false);
      } catch (error) {
        if (!hasLoaded.current) setStartupError(errorMessage(error, t));
        setLoading(false);
        throw error;
      } finally {
        refreshPending.current = null;
        setRefreshing(false);
      }
    })();
    refreshPending.current = request;
    return request;
  }, [t]);

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

  const unavailable = () => Alert.alert(t('transition.title'), t('transition.writesUnavailable'));
  const addStock = async (_productId: string, _quantity: number) => { unavailable(); return false; };
  const addStockAndProductToCart = async (_product: Product, _quantity: number) => { unavailable(); };

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
    scanAccepted.current = false;
    setScannerPurpose(purpose);
    setScannerOpen(true);
  };

  const onBarcode = async (barcode: string) => {
    if (scanAccepted.current) return;
    scanAccepted.current = true;
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
          setEditingProductId(null);
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
    if (productWritePending.current) return;
    setProductFormOpen(false);
    setEditingProductId(null);
    setProductForm(emptyProductForm);
  };

  const saveProduct = async () => {
    if (productWritePending.current) return;
    const name = productForm.name.trim();
    const sellingPriceInput = productForm.sellingPrice.trim();
    const sellingPrice = Number(sellingPriceInput.replace(',', '.'));
    const costInput = productForm.cost.trim();
    const cost = costInput ? Number(costInput.replace(',', '.')) : null;
    const stock = Number(productForm.stock.trim());
    if (!name || !sellingPriceInput || !Number.isFinite(sellingPrice) || sellingPrice < 0 || (cost !== null && (!Number.isFinite(cost) || cost < 0)) || (!editingProductId && (!Number.isInteger(stock) || stock < -2147483648 || stock > 2147483647))) {
      Alert.alert(t('alerts.checkProductDetailsTitle'), t('alerts.checkProductDetailsMessage'));
      return;
    }

    productWritePending.current = true;
    setSavingProduct(true);
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
      const saved = editingProductId
        ? await updateProduct(editingProductId, input)
        : await createProduct(input);
      catalogRevision.current += 1;
      setProducts((current) => wasEditing
        ? current.map((product) => product.id === saved.id ? saved : product)
        : [saved, ...current]);
      productWritePending.current = false;
      closeProductForm();
      showNotice(t(wasEditing ? 'alerts.productUpdated' : 'alerts.productSaved'));
      await refreshAfterWrite();
    } catch (error) {
      Alert.alert(t('alerts.saveProductFailedTitle'), errorMessage(error, t));
    } finally {
      productWritePending.current = false;
      setSavingProduct(false);
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

  const refreshAfterWrite = async () => {
    // Finish any read started before the write, then fetch the committed state.
    await refreshPending.current?.catch(() => undefined);
    try { await refresh(); } catch (error) {
      Alert.alert(t('alerts.refreshFailedTitle'), errorMessage(error, t));
    }
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
                catalogRevision.current += 1;
                setProducts((current) => current.filter((item) => item.id !== product.id));
                showNotice(t('alerts.productDeleted'));
                await refreshAfterWrite();
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

  const saveStockAdjustment = async (_quantity: string, _reason: string) => { unavailable(); };
  const saveStockReason = async (_reason: string) => { unavailable(); };
  const completeCheckout = async (_method: PaymentMethod, _cash: number | null): Promise<void> => { unavailable(); };

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
    savingProduct,
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
    closeScanner: () => { scanAccepted.current = true; setScannerOpen(false); },
    setCartOpen,
    setCheckoutOpen,
    stockAdjustmentProduct,
    stockAdjustmentOpen: Boolean(stockAdjustmentProductId),
    openStockAdjustment: (_id: string) => unavailable(),
    closeStockAdjustment: () => setStockAdjustmentProductId(null),
    stockReasonEditEntry,
    stockReasonEditOpen: Boolean(stockReasonEditEntry),
    openStockReasonEdit: (entry: StockHistoryEntry) => {
      unavailable();
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
    retry,
    refreshing,
    refresh: () => { void refresh().catch((error) => Alert.alert(t('alerts.catalogRefreshFailedTitle'), errorMessage(error, t))); }
  };
}
