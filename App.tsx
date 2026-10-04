import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner
} from 'react-native-vision-camera';

import { Product } from './src/db/product/types';
import { Sale, SaleLine } from './src/db/sale/types';

import { checkout, createProduct, findProductByBarcode, getDatabase } from './src/db/rxdb';

type Tab = 'sell' | 'products' | 'sales';
type Cart = Record<string, SaleLine>;

const colors = {
  background: '#101418',
  panel: '#171d22',
  panelMuted: '#20282f',
  border: '#2b363f',
  text: '#f5f7f8',
  muted: '#95a2aa',
  accent: '#d6f36b',
  accentText: '#162000',
  danger: '#ff8f8f'
};

const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;
const shortDate = (value: string) =>
  new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(value)
  );
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unable to open the local database.';

export default function App() {
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}

function AppContent() {
  const insets = useSafeAreaInsets();
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
  const [productForm, setProductForm] = useState({ name: '', price: '', barcode: '', category: 'General' });

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();
      const [nextProducts, nextSales] = await Promise.all([
        db.products.find({ sort: [{ createdAt: 'desc' }] }).exec(),
        db.sales.find({ sort: [{ createdAt: 'desc' }] }).exec()
      ]);
      setProducts(nextProducts.map((document) => document.toJSON() as Product));
      setSales(nextSales.map((document) => document.toJSON() as unknown as Sale));
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
    return products.filter((product) => `${product.name} ${product.barcode} ${product.category}`.toLowerCase().includes(term));
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
    const product = await findProductByBarcode(barcode);
    if (product) {
      addToCart(product.toJSON());
      setSearch('');
      return;
    }
    Alert.alert('Product not found', `No product is registered for ${barcode}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add product', onPress: () => { setTab('products'); setProductForm((current) => ({ ...current, barcode })); } }
    ]);
  };

  const saveProduct = async () => {
    const name = productForm.name.trim();
    const price = Number(productForm.price.replace(',', '.'));
    if (!name || !Number.isFinite(price) || price < 0) {
      Alert.alert('Check product details', 'Enter a product name and a valid price.');
      return;
    }
    await createProduct({ name, price, barcode: productForm.barcode.trim(), category: productForm.category.trim() || 'General', stock: 0 });
    setProductForm({ name: '', price: '', barcode: '', category: 'General' });
    await refresh();
    showNotice('Product saved locally');
  };

  const completeCheckout = async () => {
    if (!cartLines.length) return;
    await checkout(cartLines);
    setCart({});
    setCheckoutOpen(false);
    setCartOpen(false);
    await refresh();
    showNotice('Sale saved on this device');
  };

  if (loading) {
    return <View style={[styles.loading, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><Text style={styles.logo}>stockroom</Text><Text style={styles.muted}>Starting local database…</Text></View>;
  }

  if (startupError) {
    return <View style={[styles.loading, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Text style={styles.logo}>stockroom</Text>
      <Text style={styles.errorTitle}>Local database could not start</Text>
      <Text style={styles.errorText}>{startupError}</Text>
      <Pressable style={styles.primaryButton} onPress={() => { setLoading(true); setStartupError(null); void refresh().catch(() => undefined); }}>
        <Text style={styles.primaryButtonText}>Retry</Text>
      </Pressable>
    </View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>LOCAL ERP · OFFLINE READY</Text>
            <Text style={styles.title}>stockroom</Text>
          </View>
          <View style={styles.syncPill}><View style={styles.greenDot} /><Text style={styles.syncText}>On device</Text></View>
        </View>

        {tab === 'sell' && (
          <SellTab products={filteredProducts} search={search} setSearch={setSearch} openScanner={() => openScanner('sell')} addToCart={addToCart} cartQuantity={cartQuantity} cartTotal={cartTotal} openCart={() => setCartOpen(true)} />
        )}
        {tab === 'products' && (
          <ProductsTab products={products} form={productForm} setForm={setProductForm} saveProduct={saveProduct} openScanner={() => openScanner('product')} />
        )}
        {tab === 'sales' && <SalesTab sales={sales} />}

        <View style={[styles.tabBar, { height: 66 + insets.bottom, paddingBottom: insets.bottom }]}>
          <TabButton label="Sell" icon="＋" active={tab === 'sell'} onPress={() => setTab('sell')} />
          <TabButton label="Products" icon="▦" active={tab === 'products'} onPress={() => setTab('products')} />
          <TabButton label="Sales" icon="↗" active={tab === 'sales'} onPress={() => setTab('sales')} />
        </View>
      </View>

      {notice ? <View style={[styles.toast, { bottom: 82 + insets.bottom }]}><Text style={styles.toastText}>{notice}</Text></View> : null}
      <ScannerModal visible={scannerOpen} onClose={() => setScannerOpen(false)} onBarcode={onBarcode} />
      <CartModal visible={cartOpen} lines={cartLines} total={cartTotal} onClose={() => setCartOpen(false)} updateQuantity={updateQuantity} checkout={() => setCheckoutOpen(true)} />
      <Modal visible={checkoutOpen} transparent animationType="fade" onRequestClose={() => setCheckoutOpen(false)}>
        <View style={styles.modalBackdrop}><View style={[styles.checkoutCard, { marginBottom: 20 + insets.bottom }]}>
          <Text style={styles.eyebrow}>PAYMENT</Text><Text style={styles.modalTitle}>Complete checkout</Text>
          <Text style={styles.muted}>This MVP records a cash sale locally on this device.</Text>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{money(cartTotal)}</Text></View>
          <Pressable style={styles.primaryButton} onPress={() => void completeCheckout()}><Text style={styles.primaryButtonText}>Confirm cash payment</Text></Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setCheckoutOpen(false)}><Text style={styles.secondaryButtonText}>Back to cart</Text></Pressable>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

function SellTab({ products, search, setSearch, openScanner, addToCart, cartQuantity, cartTotal, openCart }: { products: Product[]; search: string; setSearch: (value: string) => void; openScanner: () => void; addToCart: (product: Product) => void; cartQuantity: number; cartTotal: number; openCart: () => void }) {
  return <View style={styles.content}>
    <View style={styles.heroRow}><View><Text style={styles.sectionKicker}>QUICK SALE</Text><Text style={styles.sectionTitle}>Build a cart</Text></View><Pressable style={styles.scanButton} onPress={openScanner}><Text style={styles.scanIcon}>⌁</Text><Text style={styles.scanButtonText}>Scan</Text></Pressable></View>
    <View style={styles.searchBox}><Text style={styles.searchIcon}>⌕</Text><TextInput value={search} onChangeText={setSearch} placeholder="Search products or barcode" placeholderTextColor={colors.muted} style={styles.searchInput} /></View>
    <View style={styles.listHeader}><Text style={styles.listTitle}>{search ? 'MATCHES' : 'ALL PRODUCTS'}</Text><Text style={styles.muted}>{products.length} items</Text></View>
    <FlatList data={products} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} renderItem={({ item }) => <ProductRow product={item} onPress={() => addToCart(item)} />} ListEmptyComponent={<EmptyState text="No products match your search." />} />
    {cartQuantity > 0 ? <Pressable style={styles.cartBar} onPress={openCart}><View><Text style={styles.cartBarLabel}>{cartQuantity} {cartQuantity === 1 ? 'item' : 'items'} in cart</Text><Text style={styles.cartBarTotal}>{money(cartTotal)}</Text></View><Text style={styles.cartBarAction}>Review cart  →</Text></Pressable> : null}
  </View>;
}

function ProductsTab({ products, form, setForm, saveProduct, openScanner }: { products: Product[]; form: { name: string; price: string; barcode: string; category: string }; setForm: React.Dispatch<React.SetStateAction<{ name: string; price: string; barcode: string; category: string }>>; saveProduct: () => void; openScanner: () => void }) {
  return <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionKicker}>CATALOG</Text><Text style={styles.sectionTitle}>Add a product</Text><Text style={styles.muted}>Products are available immediately in this device’s local catalog.</Text>
      <Field label="Product name" value={form.name} placeholder="e.g. Reusable bottle" onChangeText={(name) => setForm((current) => ({ ...current, name }))} />
      <Field label="Price" value={form.price} placeholder="0,00" keyboardType="decimal-pad" onChangeText={(price) => setForm((current) => ({ ...current, price }))} />
      <View style={styles.fieldLabelRow}><Text style={styles.fieldLabel}>Barcode <Text style={styles.optional}>(optional)</Text></Text><Pressable onPress={openScanner}><Text style={styles.linkText}>Scan barcode</Text></Pressable></View>
      <TextInput value={form.barcode} placeholder="Type or scan a barcode" placeholderTextColor={colors.muted} style={styles.input} onChangeText={(barcode) => setForm((current) => ({ ...current, barcode }))} />
      <Field label="Category" value={form.category} placeholder="General" onChangeText={(category) => setForm((current) => ({ ...current, category }))} />
      <Pressable style={styles.primaryButton} onPress={() => void saveProduct()}><Text style={styles.primaryButtonText}>Save product locally</Text></Pressable>
      <View style={styles.listHeader}><Text style={styles.listTitle}>CATALOGUE</Text><Text style={styles.muted}>{products.length} products</Text></View>
      {products.map((product) => <ProductRow key={product.id} product={product} compact />)}
    </ScrollView>
  </KeyboardAvoidingView>;
}

function SalesTab({ sales }: { sales: Sale[] }) {
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  return <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}><Text style={styles.sectionKicker}>HISTORY</Text><Text style={styles.sectionTitle}>Recent sales</Text><View style={styles.statsRow}><Stat label="Sales" value={`${sales.length}`} /><Stat label="Revenue" value={money(revenue)} /></View>{sales.length ? sales.map((sale) => <View style={styles.saleCard} key={sale.id}><View><Text style={styles.saleTitle}>{sale.lines.reduce((sum, line) => sum + line.quantity, 0)} items</Text><Text style={styles.muted}>{shortDate(sale.createdAt)} · Cash</Text></View><Text style={styles.saleTotal}>{money(sale.total)}</Text></View>) : <EmptyState text="Completed checkouts will appear here." />}</ScrollView>;
}

function ProductRow({ product, onPress, compact = false }: { product: Product; onPress?: () => void; compact?: boolean }) {
  const body = <View style={[styles.productRow, compact && styles.productRowCompact]}><View style={styles.productMark}><Text style={styles.productMarkText}>{product.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.productInfo}><Text style={styles.productName}>{product.name}</Text><Text style={styles.muted}>{product.category} · {product.barcode || 'No barcode'}</Text></View><View style={styles.productRight}><Text style={styles.productPrice}>{money(product.price)}</Text>{onPress ? <Text style={styles.addHint}>Add +</Text> : <Text style={styles.muted}>{product.stock} in stock</Text>}</View></View>;
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

function CartModal({ visible, lines, total, onClose, updateQuantity, checkout }: { visible: boolean; lines: SaleLine[]; total: number; onClose: () => void; updateQuantity: (line: SaleLine, delta: number) => void; checkout: () => void }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={[styles.cartSheet, { paddingBottom: 30 + insets.bottom }]}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.eyebrow}>CURRENT SALE</Text><Text style={styles.modalTitle}>Your cart</Text></View><Pressable onPress={onClose}><Text style={styles.closeText}>Close</Text></Pressable></View>{lines.map((line) => <View style={styles.cartLine} key={line.productId}><View style={styles.cartLineInfo}><Text style={styles.productName}>{line.name}</Text><Text style={styles.muted}>{money(line.unitPrice)} each</Text></View><View style={styles.quantity}><Pressable onPress={() => updateQuantity(line, -1)}><Text style={styles.quantityButton}>−</Text></Pressable><Text style={styles.quantityText}>{line.quantity}</Text><Pressable onPress={() => updateQuantity(line, 1)}><Text style={styles.quantityButton}>＋</Text></Pressable></View><Text style={styles.lineTotal}>{money(line.lineTotal)}</Text></View>)}{!lines.length ? <EmptyState text="Your cart is empty." /> : <><View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{money(total)}</Text></View><Pressable style={styles.primaryButton} onPress={checkout}><Text style={styles.primaryButtonText}>Checkout</Text></Pressable></>}</View></View></Modal>;
}

function ScannerModal({ visible, onClose, onBarcode }: { visible: boolean; onClose: () => void; onBarcode: (barcode: string) => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const codeScanner = useCodeScanner({ codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128'], onCodeScanned: (codes) => { const value = codes[0]?.value; if (value) void onBarcode(value); } });
  useEffect(() => { if (visible && !hasPermission) void requestPermission(); }, [visible, hasPermission, requestPermission]);
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><View style={styles.scanner}><View style={[styles.scannerTop, { top: 20 + insets.top }]}><Text style={styles.scannerTitle}>Scan barcode</Text><Pressable onPress={onClose}><Text style={styles.closeText}>Cancel</Text></Pressable></View>{!hasPermission ? <View style={styles.scannerMessage}><Text style={styles.modalTitle}>Camera permission needed</Text><Text style={styles.muted}>Allow camera access to scan products.</Text><Pressable style={styles.primaryButton} onPress={() => void requestPermission()}><Text style={styles.primaryButtonText}>Allow camera</Text></Pressable></View> : device ? <><Camera style={StyleSheet.absoluteFill} device={device} isActive={visible} codeScanner={codeScanner} /><View style={styles.scanFrame}><View style={styles.scanCorner} /><Text style={styles.scanHint}>Align a barcode inside the frame</Text></View></> : <View style={styles.scannerMessage}><Text style={styles.modalTitle}>Camera unavailable</Text><Text style={styles.muted}>Use the barcode field instead.</Text></View>}</View></Modal>;
}

function Field({ label, value, placeholder, onChangeText, keyboardType }: { label: string; value: string; placeholder: string; onChangeText: (value: string) => void; keyboardType?: 'decimal-pad' }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} placeholder={placeholder} placeholderTextColor={colors.muted} style={styles.input} onChangeText={onChangeText} keyboardType={keyboardType} /></View>;
}

function TabButton({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) { return <Pressable style={styles.tabButton} onPress={onPress}><Text style={[styles.tabIcon, active && styles.tabActive]}>{icon}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></Pressable>; }
function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>; }
function EmptyState({ text }: { text: string }) { return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, paddingHorizontal: 20 },
  loading: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 10 },
  logo: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1.5 },
  errorTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: 13, maxWidth: 320, textAlign: 'center' },
  header: { paddingTop: 16, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -1.4, marginTop: 3 },
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20 },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  syncText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  content: { flex: 1 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 },
  sectionKicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 6 },
  sectionTitle: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.8, marginBottom: 7 },
  scanButton: { backgroundColor: colors.accent, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  scanIcon: { color: colors.accentText, fontSize: 20, fontWeight: '800' },
  scanButtonText: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, marginBottom: 22 },
  searchIcon: { color: colors.muted, fontSize: 25, marginRight: 8 },
  searchInput: { flex: 1, color: colors.text, height: 48, fontSize: 15 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  listTitle: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  listContent: { paddingBottom: 110 },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  productRowCompact: { paddingVertical: 12 },
  productMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.panelMuted, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  productMarkText: { color: colors.accent, fontSize: 17, fontWeight: '800' },
  productInfo: { flex: 1 },
  productName: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  muted: { color: colors.muted, fontSize: 12 },
  productRight: { alignItems: 'flex-end', marginLeft: 8 },
  productPrice: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  addHint: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  cartBar: { position: 'absolute', bottom: 11, left: 0, right: 0, backgroundColor: colors.accent, borderRadius: 17, paddingHorizontal: 17, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  cartBarLabel: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  cartBarTotal: { color: colors.accentText, fontSize: 18, fontWeight: '800', marginTop: 2 },
  cartBarAction: { color: colors.accentText, fontSize: 13, fontWeight: '800' },
  tabBar: { height: 66, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  tabButton: { alignItems: 'center', gap: 4, minWidth: 70 },
  tabIcon: { color: colors.muted, fontSize: 23, lineHeight: 24 },
  tabLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  tabActive: { color: colors.accent },
  scrollContent: { paddingBottom: 30 },
  field: { marginTop: 18 },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 8 },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  optional: { color: colors.muted, fontWeight: '400' },
  linkText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  input: { color: colors.text, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, height: 48, fontSize: 15 },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 13, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 22 },
  primaryButtonText: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
  secondaryButton: { borderColor: colors.border, borderWidth: 1, borderRadius: 13, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 10 },
  secondaryButtonText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 20 },
  stat: { flex: 1, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 15, padding: 15 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  saleCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  saleTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 5 },
  saleTotal: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  empty: { padding: 26, alignItems: 'center' },
  emptyText: { color: colors.muted, textAlign: 'center', fontSize: 13 },
  toast: { position: 'absolute', bottom: 82, left: 20, right: 20, backgroundColor: colors.text, borderRadius: 11, padding: 13, alignItems: 'center' },
  toastText: { color: colors.background, fontSize: 13, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  cartSheet: { backgroundColor: colors.background, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, paddingBottom: 30, maxHeight: '80%' },
  sheetHandle: { width: 38, height: 4, borderRadius: 4, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 18 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  closeText: { color: colors.accent, fontSize: 13, fontWeight: '800', paddingVertical: 4 },
  modalTitle: { color: colors.text, fontSize: 25, fontWeight: '800', letterSpacing: -0.8, marginTop: 5 },
  cartLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  cartLineInfo: { flex: 1 },
  quantity: { flexDirection: 'row', alignItems: 'center', gap: 11, marginRight: 12 },
  quantityButton: { color: colors.accent, fontSize: 22, fontWeight: '600' },
  quantityText: { color: colors.text, fontSize: 14, fontWeight: '800', minWidth: 13, textAlign: 'center' },
  lineTotal: { color: colors.text, fontSize: 14, fontWeight: '800', minWidth: 65, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 17, borderTopColor: colors.border, borderTopWidth: 1 },
  totalLabel: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  totalValue: { color: colors.text, fontSize: 25, fontWeight: '800' },
  checkoutCard: { backgroundColor: colors.background, borderRadius: 24, margin: 20, padding: 22 },
  scanner: { flex: 1, backgroundColor: '#080b0d' },
  scannerTop: { position: 'absolute', zIndex: 2, top: 55, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scannerTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  scanFrame: { position: 'absolute', top: '36%', left: 35, right: 35, height: 150, borderColor: colors.accent, borderWidth: 2, borderRadius: 18, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 13 },
  scanCorner: { position: 'absolute', left: -2, top: -2, width: 32, height: 32, borderLeftColor: colors.text, borderTopColor: colors.text, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 16 },
  scanHint: { color: colors.text, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, fontSize: 12 },
  scannerMessage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 }
});
