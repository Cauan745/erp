import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { useEffect } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '../components/AppHeader';
import { StartupScreen } from '../components/StartupScreen';
import { CartModal } from '../components/modals/CartModal';
import { CheckoutModal } from '../components/modals/CheckoutModal';
import { ScannerModal } from '../components/modals/ScannerModal';
import { StockUpdateModal } from '../components/modals/StockUpdateModal';
import { StockReasonModal } from '../components/modals/StockReasonModal';
import { TabBar } from '../components/navigation/TabBar';
import { ProductsTab } from '../components/tabs/ProductsTab';
import { SalesTab } from '../components/tabs/SalesTab';
import { SellTab } from '../components/tabs/SellTab';
import { styles } from '../styles';
import { useAppState } from './useAppState';
import { startSyncWorker } from '../sync/service';

export function AppContent() {
  const insets = useSafeAreaInsets();
  const app = useAppState();

  useEffect(() => startSyncWorker(), []);

  if (app.loading) {
    return <StartupScreen topInset={insets.top} bottomInset={insets.bottom} />;
  }

  if (app.startupError) {
    return (
      <StartupScreen
        topInset={insets.top}
        bottomInset={insets.bottom}
        error={app.startupError}
        onRetry={app.retry}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <AppHeader />

        {app.tab === 'sell' && (
          <SellTab
            products={app.filteredProducts}
            search={app.search}
            onSearchChange={app.setSearch}
            onScan={() => app.openScanner('sell')}
            onAddToCart={app.addToCart}
            cartQuantity={app.cartQuantity}
            cartTotal={app.cartTotal}
            onOpenCart={() => app.setCartOpen(true)}
          />
        )}
        {app.tab === 'products' && (
          <ProductsTab
            products={app.products}
            form={app.productForm}
            setForm={app.setProductForm}
            onSave={app.saveProduct}
            editingProductId={app.editingProductId}
            onEditProduct={app.editProduct}
            onCancelEdit={app.cancelProductEdit}
            onScan={() => app.openScanner('product')}
            onOpenStockAdjustment={app.openStockAdjustment}
            onEditStockReason={app.openStockReasonEdit}
            stockHistory={app.stockHistory}
          />
        )}
        {app.tab === 'sales' && <SalesTab sales={app.sales} />}

        <TabBar activeTab={app.tab} bottomInset={insets.bottom} onChange={app.setTab} />
      </View>

      {app.notice ? (
        <View style={[styles.toast, { bottom: 82 + insets.bottom }]}>
          <Text style={styles.toastText}>{app.notice}</Text>
        </View>
      ) : null}
      <ScannerModal
        visible={app.scannerOpen}
        onClose={() => app.setScannerOpen(false)}
        onBarcode={app.onBarcode}
      />
      <CartModal
        visible={app.cartOpen}
        lines={app.cartLines}
        total={app.cartTotal}
        onClose={() => app.setCartOpen(false)}
        onUpdateQuantity={app.updateQuantity}
        onCheckout={() => app.setCheckoutOpen(true)}
      />
      <CheckoutModal
        visible={app.checkoutOpen}
        total={app.cartTotal}
        onClose={() => app.setCheckoutOpen(false)}
        onConfirm={app.completeCheckout}
      />
      <StockUpdateModal
        visible={app.stockAdjustmentOpen}
        product={app.stockAdjustmentProduct}
        onClose={app.closeStockAdjustment}
        onSubmit={app.saveStockAdjustment}
      />
      <StockReasonModal
        visible={app.stockReasonEditOpen}
        productName={app.stockReasonEditEntry?.productName ?? ''}
        reason={app.stockReasonEditEntry?.reason ?? null}
        onClose={app.closeStockReasonEdit}
        onSubmit={app.saveStockReason}
      />
    </SafeAreaView>
  );
}
