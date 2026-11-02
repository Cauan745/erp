import { Alert } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createProduct, deleteProduct, findProductByBarcode, listProducts, updateProduct, Product } from '../repositories';
import { PaymentMethod, Sale } from '../types';
import { checkout, checkoutInput, listSales, lookupSale, priceReview, stockShortages } from '../repositories/sale';
import { StockHistoryEntry } from '../types';
import { adjustStock, listStockHistory, lookupAdjustment, updateStockReason } from '../repositories/stock';
import { clearRecoveryMarker, listRecoveryMarkers, RecoveryMarker } from '../api/requestRecovery';
import { API_BASE_URL, ApiError } from '../api/client';
import { STOCK_REASON_AUTO_SALE_REPLENISHMENT } from '../constants';
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
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesError, setSalesError] = useState<string | null>(null);
  const salesRevision = useRef(0);
  const salesPending = useRef<Promise<void> | null>(null);
  const checkoutWritePending = useRef(false);
  const [savingCheckout, setSavingCheckout] = useState(false);
  const [confirmedSale, setConfirmedSale] = useState<Sale | null>(null);
  const uncertainCheckout = useRef(false);
  const [stockHistory, setStockHistory] = useState<StockHistoryEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyRevision = useRef(0);
  const historyPending = useRef<Promise<void> | null>(null);
  const stockWritePending = useRef(false);
  const [savingStock, setSavingStock] = useState(false);
  const [markers, setMarkers] = useState<RecoveryMarker[]>([]);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [checkingRecovery, setCheckingRecovery] = useState(false);
  const recoveryPending = useRef(false);
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

  const refreshHistory = useCallback(() => {
    if (historyPending.current) return historyPending.current;
    const revision = historyRevision.current;
    const request = (async () => {
      try {
        const rows = await listStockHistory();
        if (revision === historyRevision.current) setStockHistory(rows);
        setHistoryError(null);
      } catch (error) { setHistoryError(errorMessage(error, t)); throw error; }
      finally { historyPending.current = null; }
    })();
    historyPending.current = request;
    return request;
  }, [t]);
  const refreshSales = useCallback(() => {
    if (salesPending.current) return salesPending.current;
    const revision = salesRevision.current;
    const request = (async () => {
      try {
        const rows = await listSales();
        if (revision === salesRevision.current) setSales(rows);
        setSalesError(null);
      } catch (error) { setSalesError(errorMessage(error, t)); throw error; }
      finally { salesPending.current = null; }
    })();
    salesPending.current = request;
    return request;
  }, [t]);
  const loadRecovery = useCallback(async () => {
    try { setMarkers(await listRecoveryMarkers()); setRecoveryError(null); }
    catch (error) { setRecoveryError(errorMessage(error, t)); }
  }, [t]);
  useEffect(() => {
    void refreshHistory().catch(() => undefined);
    void refreshSales().catch(() => undefined);
    void loadRecovery();
  }, [refreshHistory, refreshSales, loadRecovery]);

  const cartLines = Object.values(cart);
  const cartTotalCents = cartLines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const cartTotal = cartTotalCents / 100;
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
    if (checkoutWritePending.current || uncertainCheckout.current) return;
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
          unitPriceCents: product.sellingPriceCents,
          lineTotal: quantity * product.sellingPriceCents / 100,
          allowInsufficientStock: existing?.allowInsufficientStock || allowInsufficientStock
        }
      };
    });
    showNotice(t('alerts.productAdded', { productName: product.name }));
  };

  const addStock = async (productId: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 2147483647) {
      Alert.alert(t('alerts.addStockFailedTitle'), t('errors.stockQuantityPositive')); return false;
    }
    return submitStockChange(productId, quantity, STOCK_REASON_AUTO_SALE_REPLENISHMENT);
  };
  const addStockAndProductToCart = async (product: Product, quantity: number) => {
    if (await addStock(product.id, quantity)) addProductToCart(product);
  };

  const addToCart = (product: Product) => {
    if (checkoutWritePending.current || uncertainCheckout.current) return;
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
    if (checkoutWritePending.current || uncertainCheckout.current) return;
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
            lineTotal: requested * line.unitPriceCents / 100
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
                      lineTotal: (currentLine.quantity + delta) * currentLine.unitPriceCents / 100
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
                  lineTotal: requested * line.unitPriceCents / 100,
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
        [line.productId]: { ...line, quantity, lineTotal: quantity * line.unitPriceCents / 100 }
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

  const refreshStockAfterWrite = async () => {
    await historyPending.current?.catch(() => undefined);
    const results = await Promise.allSettled([refreshAfterWrite(), refreshHistory()]);
    if (results[1].status === 'rejected') Alert.alert(t('stock.refreshFailed'), errorMessage(results[1].reason, t));
  };

  const submitStockChange = async (productId: string, quantity: number, reason: string, forCheckout = false): Promise<boolean> => {
    if (stockWritePending.current || recoveryPending.current || (checkoutWritePending.current && !forCheckout)) return false;
    stockWritePending.current = true;
    setSavingStock(true);
    try {
      // Read storage again so neither startup latency nor stale React state can bypass unresolved markers.
      if ((await listRecoveryMarkers()).length) {
        Alert.alert(t('recovery.title'), t('recovery.unresolved')); return false;
      }
      await adjustStock(productId, quantity, reason);
      catalogRevision.current += 1;
      historyRevision.current += 1;
      showNotice(t('alerts.stockUpdated'));
      await refreshStockAfterWrite();
      return true;
    } catch (error) {
      const outstanding = await listRecoveryMarkers().catch(() => null);
      Alert.alert(t(outstanding?.length ? 'recovery.uncertain' : 'alerts.updateStockFailedTitle'), errorMessage(error, t)
        + (outstanding?.length ? `\n\n${t('recovery.unresolved')}` : ''));
      return false;
    } finally {
      await loadRecovery();
      stockWritePending.current = false;
      setSavingStock(false);
    }
  };
  const saveStockAdjustment = async (quantityInput: string, reason: string) => {
    if (stockWritePending.current || recoveryPending.current || !stockAdjustmentProductId) return;
    const quantity = Number(quantityInput.trim());
    if (!quantityInput.trim() || !Number.isInteger(quantity) || !quantity
        || quantity < -2147483648 || quantity > 2147483647) {
      Alert.alert(t('alerts.updateStockFailedTitle'), t('errors.stockChangeInteger')); return;
    }
    if (await submitStockChange(stockAdjustmentProductId, quantity, reason)) setStockAdjustmentProductId(null);
  };
  const saveStockReason = async (reason: string) => {
    if (stockWritePending.current || recoveryPending.current || checkoutWritePending.current || !stockReasonEditEntry || stockReasonEditEntry.source !== 'adjustment') return;
    stockWritePending.current = true;
    setSavingStock(true);
    try {
      const saved = await updateStockReason(stockReasonEditEntry.id, reason);
      historyRevision.current += 1;
      setStockHistory(rows => rows.map(row => row.source === 'adjustment' && row.id === saved.id
        ? { ...row, reason: saved.reason } : row));
      setStockReasonEditEntry(null);
      showNotice(t('alerts.stockReasonUpdated'));
      await refreshStockAfterWrite();
    } catch (error) { Alert.alert(t('alerts.updateStockReasonFailedTitle'), errorMessage(error, t)); }
    finally { stockWritePending.current = false; setSavingStock(false); }
  };
  const checkPreviousRequest = async (marker: RecoveryMarker) => {
    if (recoveryPending.current || stockWritePending.current || checkoutWritePending.current) return;
    recoveryPending.current = true;
    setCheckingRecovery(true);
    try {
      if (marker.operationType === 'checkout') {
        const saved = await lookupSale(marker);
        if (marker.apiBaseUrl === API_BASE_URL) {
          rememberSale(saved);
          if (uncertainCheckout.current) {
            setCart({}); setCartOpen(false); setCheckoutOpen(false); uncertainCheckout.current = false;
          }
        }
        setConfirmedSale(saved);
        Alert.alert(t('recovery.saleConfirmed'), t('recovery.saleResult', { backend: marker.apiBaseUrl, id: saved.id }));
        await clearRecoveryMarker(marker).catch(error => Alert.alert(t('recovery.title'), errorMessage(error, t)));
        await refreshSaleAfterWrite();
        return;
      }
      const saved = await lookupAdjustment(marker);
      catalogRevision.current += 1;
      historyRevision.current += 1;
      setStockAdjustmentProductId(null);
      Alert.alert(t('recovery.confirmed'), t('recovery.result', {
        backend: marker.apiBaseUrl, id: saved.id, quantity: saved.quantity,
        product: products.find(p => p.id === saved.productId)?.name ?? saved.productId,
        reason: saved.reason === STOCK_REASON_AUTO_SALE_REPLENISHMENT
          ? t('products.autoSaleReplenishment') : saved.reason ?? t('products.noReason')
      }));
      await clearRecoveryMarker(marker).catch(error => Alert.alert(t('recovery.title'), errorMessage(error, t)));
      await refreshStockAfterWrite();
    } catch (error) {
      Alert.alert(t('recovery.title'), error instanceof ApiError && error.status === 404 && error.code === 'request_not_found'
        ? t('recovery.unresolved') : errorMessage(error, t));
    } finally { await loadRecovery(); recoveryPending.current = false; setCheckingRecovery(false); }
  };
  const reconcilePreviousRequest = (marker: RecoveryMarker) => {
    if (recoveryPending.current || stockWritePending.current || checkoutWritePending.current) return;
    Alert.alert(t('recovery.reconcile'), t('recovery.reconcileMessage', { backend: marker.apiBaseUrl }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('recovery.dismiss'), onPress: () => {
        if (recoveryPending.current || stockWritePending.current || checkoutWritePending.current) return;
        recoveryPending.current = true;
        setCheckingRecovery(true);
        void (async () => {
          try {
            await clearRecoveryMarker(marker);
            if (marker.operationType === 'checkout' && marker.apiBaseUrl === API_BASE_URL) uncertainCheckout.current = false;
          }
          catch (error) { Alert.alert(t('recovery.title'), errorMessage(error, t)); }
          finally { await loadRecovery(); recoveryPending.current = false; setCheckingRecovery(false); }
        })();
      } }
    ]);
  };
  const rememberSale = (saved: Sale) => {
    salesRevision.current += 1;
    catalogRevision.current += 1;
    historyRevision.current += 1;
    setSales(rows => [saved, ...rows.filter(row => row.id !== saved.id)]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)));
  };
  const refreshSaleAfterWrite = async () => {
    await salesPending.current?.catch(() => undefined);
    const results = await Promise.allSettled([refreshStockAfterWrite(), refreshSales()]);
    if (results[1].status === 'rejected') Alert.alert(t('sales.refreshFailed'), errorMessage(results[1].reason, t));
  };
  const completeCheckout = async (method: PaymentMethod, cash: number | null): Promise<void> => {
    if (checkoutWritePending.current || stockWritePending.current || recoveryPending.current) return;
    checkoutWritePending.current = true;
    setSavingCheckout(true);
    let lines = cartLines.map(line => ({ ...line }));
    try {
      while (true) {
        if ((await listRecoveryMarkers()).length) {
          Alert.alert(t('recovery.title'), t('recovery.unresolved')); return;
        }
        const input = checkoutInput(lines, method, cash);
        try {
          const saved = await checkout(input);
          rememberSale(saved);
          setCart({}); uncertainCheckout.current = false;
          setCheckoutOpen(false); setCartOpen(false);
          setConfirmedSale(saved);
          showNotice(t('alerts.saleSaved'));
          await refreshSaleAfterWrite();
          return;
        } catch (error) {
          if (error instanceof ApiError && error.status === 409 && error.code === 'total_changed') {
            const review = priceReview(error, input);
            setCart(current => Object.fromEntries(Object.entries(current).map(([id, line]) => {
              const price = review.items.find(item => item.productId === id);
              return [id, price ? { ...line, name: price.productName, unitPrice: price.unitPriceCents / 100, unitPriceCents: price.unitPriceCents,
                lineTotal: price.lineTotalCents / 100 } : line];
            })));
            Alert.alert(t('checkout.priceChangedTitle'), t('checkout.priceChanged'));
            return;
          }
          if (!(error instanceof ApiError) || error.status !== 409 || error.code !== 'insufficient_stock') throw error;
          const shortage = stockShortages(error, input)[0];
          const choice = await new Promise<'cancel' | 'stock' | 'override'>(resolve => Alert.alert(
            t('alerts.notEnoughStockTitle'), t('alerts.notEnoughStockMessage', {
              productName: shortage.productName, available: shortage.available, requested: shortage.requested
            }), [
              { text: t('common.cancel'), style: 'cancel', onPress: () => resolve('cancel') },
              { text: t('alerts.addStockForSale', { quantity: shortage.requested - shortage.available }), onPress: () => resolve('stock') },
              { text: t('sell.sellAnyway'), onPress: () => resolve('override') }
            ], { cancelable: false }));
          if (choice === 'cancel') return;
          if (choice === 'stock') {
            const amount = shortage.requested - shortage.available;
            if (amount > 2147483647) { Alert.alert(t('alerts.addStockFailedTitle'), t('errors.numericOverflow')); return; }
            if (!(await submitStockChange(shortage.productId, amount, STOCK_REASON_AUTO_SALE_REPLENISHMENT, true))) return;
          } else {
            lines = lines.map(line => line.productId === shortage.productId ? { ...line, allowInsufficientStock: true } : line);
            setCart(Object.fromEntries(lines.map(line => [line.productId, line])));
          }
          // A definitive rollback and the user's choice authorize a revised request with a new ID.
        }
      }
    } catch (error) {
      const outstanding = await listRecoveryMarkers().catch(() => null);
      uncertainCheckout.current = Boolean(outstanding?.some(m => m.operationType === 'checkout' && m.apiBaseUrl === API_BASE_URL));
      Alert.alert(t(outstanding?.length ? 'recovery.uncertain' : 'alerts.completeSaleFailedTitle'), errorMessage(error, t)
        + (outstanding?.length ? `\n\n${t('recovery.unresolved')}` : ''));
    } finally {
      await loadRecovery();
      checkoutWritePending.current = false; setSavingCheckout(false);
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
    salesError,
    retrySales: () => { void refreshSales().catch(() => undefined); },
    savingCheckout,
    cartLocked: savingCheckout || uncertainCheckout.current,
    confirmedSale,
    closeConfirmedSale: () => setConfirmedSale(null),
    stockHistory,
    productForm,
    editingProductId,
    productFormOpen,
    savingProduct,
    savingStock,
    markers,
    recoveryError,
    checkingRecovery,
    checkPreviousRequest,
    reconcilePreviousRequest,
    loadRecovery,
    historyError,
    retryHistory: () => { void refreshHistory().catch(() => undefined); },
    setProductForm: setProductForm as SetProductForm,
    filteredProducts,
    filteredCatalogProducts,
    search,
    setSearch,
    productSearch,
    setProductSearch,
    cartLines,
    cartTotal,
    cartTotalCents,
    cartQuantity,
    notice,
    scannerOpen,
    cartOpen,
    checkoutOpen,
    closeScanner: () => { scanAccepted.current = true; setScannerOpen(false); },
    setCartOpen: (open: boolean) => { if (!checkoutWritePending.current) setCartOpen(open); },
    setCheckoutOpen: (open: boolean) => { if (!checkoutWritePending.current && (!open || !uncertainCheckout.current)) setCheckoutOpen(open); },
    stockAdjustmentProduct,
    stockAdjustmentOpen: Boolean(stockAdjustmentProductId),
    openStockAdjustment: (id: string) => { if (!stockWritePending.current) setStockAdjustmentProductId(id); },
    closeStockAdjustment: () => { if (!stockWritePending.current) setStockAdjustmentProductId(null); },
    stockReasonEditEntry,
    stockReasonEditOpen: Boolean(stockReasonEditEntry),
    openStockReasonEdit: (entry: StockHistoryEntry) => {
      if (!stockWritePending.current && entry.source === 'adjustment') setStockReasonEditEntry(entry);
    },
    closeStockReasonEdit: () => { if (!stockWritePending.current) setStockReasonEditEntry(null); },
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
    refresh: () => {
      void refresh().catch((error) => Alert.alert(t('alerts.catalogRefreshFailedTitle'), errorMessage(error, t)));
      void refreshHistory().catch(() => undefined);
      void refreshSales().catch(() => undefined);
      void loadRecovery();
    }
  };
}
