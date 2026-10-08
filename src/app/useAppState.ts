import { Alert } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  addProductStock,
  checkout,
  createProduct,
  findProductByBarcode,
  InsufficientStockError,
  listProducts,
  listSales
} from '../db';
import { Product } from '../db/product/types';
import { Sale, SaleLine } from '../db/sale/types';
import { errorMessage } from '../formatters';
import { Cart, ProductForm, SetProductForm, Tab } from '../types';

const emptyProductForm: ProductForm = {
  name: '',
  price: '',
  barcode: '',
  category: 'General'
};

export function useAppState() {
  const [tab, setTab] = useState<Tab>('sell');
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [search, setSearch] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerPurpose, setScannerPurpose] = useState<'sell' | 'product'>('sell');
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);

  const refresh = useCallback(async () => {
    try {
      const [nextProducts, nextSales] = await Promise.all([listProducts(), listSales()]);
      setProducts(nextProducts);
      setSales(nextSales);
      setStartupError(null);
      setLoading(false);
    } catch (error) {
      console.error('Local database startup failed', error);
      setStartupError(errorMessage(error));
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

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 2400);
  };

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current[product.id];
      const quantity = (existing?.quantity ?? 0) + 1;
      return {
        ...current,
        [product.id]: {
          productId: product.id,
          name: product.name,
          quantity,
          unitPrice: product.price,
          lineTotal: quantity * product.price
        }
      };
    });
    showNotice(`${product.name} added`);
  };

  const updateQuantity = (line: SaleLine, delta: number) => {
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
      showNotice('Barcode captured');
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
      Alert.alert('Product lookup failed', errorMessage(error));
      return;
    }

    Alert.alert('Product not found', `No product is registered for ${barcode}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Add product',
        onPress: () => {
          setTab('products');
          setProductForm((current) => ({ ...current, barcode }));
        }
      }
    ]);
  };

  const saveProduct = async () => {
    const name = productForm.name.trim();
    const price = Number(productForm.price.replace(',', '.'));
    if (!name || !Number.isFinite(price) || price < 0) {
      Alert.alert('Check product details', 'Enter a product name and a valid price.');
      return;
    }

    try {
      await createProduct({
        name,
        price,
        barcode: productForm.barcode.trim(),
        category: productForm.category.trim() || 'General',
        stock: 0
      });
      setProductForm(emptyProductForm);
      await refresh();
      showNotice('Product saved locally');
    } catch (error) {
      Alert.alert('Could not save product', errorMessage(error));
    }
  };

  const retryCheckoutAfterAddingStock = async (productId: string) => {
    try {
      await addProductStock(productId);
      await refresh();
    } catch (error) {
      Alert.alert('Could not add stock', errorMessage(error));
      return;
    }

    await completeCheckout();
  };

  const completeCheckout = async (allowInsufficientStock = false): Promise<void> => {
    if (!cartLines.length) return;
    try {
      await checkout(cartLines, { allowInsufficientStock });
      setCart({});
      setCheckoutOpen(false);
      setCartOpen(false);
      await refresh();
      showNotice('Sale saved on this device');
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        const { shortage } = error;
        Alert.alert(
          'Not enough stock',
          `${shortage.productName} has ${shortage.available} in stock, but this cart needs ${shortage.requested}.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Add 1 to stock',
              onPress: () => { void retryCheckoutAfterAddingStock(shortage.productId); }
            },
            {
              text: 'Sell anyway',
              onPress: () => { void completeCheckout(true); }
            }
          ]
        );
        return;
      }
      Alert.alert('Could not complete sale', errorMessage(error));
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
    sales,
    productForm,
    setProductForm: setProductForm as SetProductForm,
    filteredProducts,
    search,
    setSearch,
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
    openScanner,
    addToCart,
    updateQuantity,
    onBarcode,
    saveProduct,
    completeCheckout,
    loading,
    startupError,
    retry
  };
}
