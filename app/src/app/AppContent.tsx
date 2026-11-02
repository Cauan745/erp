import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '../components/AppHeader';
import { SaleDetailsModal } from '../components/modals/SaleDetailsModal';
import { CartModal } from '../components/modals/CartModal';
import { CheckoutModal } from '../components/modals/CheckoutModal';
import { ScannerModal } from '../components/modals/ScannerModal';
import { StockUpdateModal } from '../components/modals/StockUpdateModal';
import { StockReasonModal } from '../components/modals/StockReasonModal';
import { ProductFormModal } from '../components/modals/ProductFormModal';
import { TabBar } from '../components/navigation/TabBar';
import { ProductsTab } from '../components/tabs/ProductsTab';
import { SalesTab } from '../components/tabs/SalesTab';
import { SellTab } from '../components/tabs/SellTab';
import { styles } from '../styles';
import { useI18n } from '../i18n';
import { useAppState } from './useAppState';

export function AppContent() {
  const insets = useSafeAreaInsets();
  const app = useAppState();
  const { t } = useI18n();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <AppHeader onRefresh={app.refresh} refreshing={app.refreshing} />

        {app.legacyTaskCleanupFailed ? <Pressable accessibilityRole="button" onPress={() => { void app.retryLegacyTaskCleanup(); }}>
          <Text style={styles.muted}>{t('upgrade.cleanupFailed')} · {t('common.retry')}</Text>
        </Pressable> : null}
        {app.recoveryError ? <Pressable onPress={() => { void app.loadRecovery(); }}>
          <Text style={styles.muted}>{app.recoveryError} · {t('common.retry')}</Text>
        </Pressable> : null}
        {app.markers.length ? <ScrollView style={{ maxHeight: 180 }}>
          <Text style={styles.listTitle}>{t('recovery.title')}</Text>
          {app.markers.map(marker => <View key={`${marker.apiBaseUrl}-${marker.operationType}-${marker.requestId}`}>
            <Text style={styles.muted}>{marker.apiBaseUrl} · {marker.requestId}</Text>
            <Pressable disabled={app.checkingRecovery || app.savingStock || app.savingCheckout} onPress={() => { void app.checkPreviousRequest(marker); }}>
              <Text style={styles.closeText}>{t(app.checkingRecovery ? 'recovery.checking' : 'recovery.check')}</Text>
            </Pressable>
            <Pressable disabled={app.checkingRecovery || app.savingStock || app.savingCheckout} onPress={() => app.reconcilePreviousRequest(marker)}>
              <Text style={styles.muted}>{t('recovery.reconcile')}</Text>
            </Pressable>
          </View>)}
        </ScrollView> : null}

        {app.tab === 'sell' && (
          <SellTab
            products={app.filteredProducts}
            catalogStatus={{ loading: app.catalogLoading, refreshing: app.catalogRefreshing, error: app.catalogError, onRetry: app.retryCatalog }}
            lookingUpBarcode={app.lookingUpBarcode}
            barcodeError={app.barcodeError}
            onRetryBarcode={app.retryBarcode}
            cartLocked={app.cartLocked || app.savingStock}
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
            products={app.filteredCatalogProducts}
            catalogStatus={{ loading: app.catalogLoading, refreshing: app.catalogRefreshing, error: app.catalogError, onRetry: app.retryCatalog }}
            historyLoading={app.historyLoading}
            historyRefreshing={app.historyRefreshing}
            savingProduct={app.savingProduct}
            savingStock={app.savingStock || app.savingCheckout || app.checkingRecovery}
            search={app.productSearch}
            onSearchChange={app.setProductSearch}
            onAddProduct={app.openNewProduct}
            onEditProduct={app.editProduct}
            onDeleteProduct={app.deleteProduct}
            onOpenStockAdjustment={app.openStockAdjustment}
            onEditStockReason={app.openStockReasonEdit}
            stockHistory={app.stockHistory}
            historyError={app.historyError}
            onRetryHistory={app.retryHistory}
          />
        )}
        {app.tab === 'sales' && <SalesTab loading={app.salesLoading} refreshing={app.salesRefreshing} sales={app.sales} error={app.salesError} onRetry={app.retrySales} />}

        <TabBar activeTab={app.tab} bottomInset={insets.bottom} onChange={app.setTab} />
      </View>

      {app.notice ? (
        <View style={[styles.toast, { bottom: 82 + insets.bottom }]}>
          <Text style={styles.toastText}>{app.notice}</Text>
        </View>
      ) : null}
      <ScannerModal
        visible={app.scannerOpen}
        onClose={app.closeScanner}
        onBarcode={app.onBarcode}
      />
      <CartModal
        visible={app.cartOpen}
        locked={app.cartLocked}
        checkoutBlocked={app.checkoutBlocked}
        lines={app.cartLines}
        total={app.cartTotal}
        onClose={() => app.setCartOpen(false)}
        onUpdateQuantity={app.updateQuantity}
        onCheckout={() => app.setCheckoutOpen(true)}
      />
      <CheckoutModal
        visible={app.checkoutOpen}
        totalCents={app.cartTotalCents}
        saving={app.savingCheckout}
        blocked={(app.cartLocked && !app.savingCheckout) || app.checkoutBlocked}
        onClose={() => app.setCheckoutOpen(false)}
        onConfirm={app.completeCheckout}
      />
      <SaleDetailsModal sale={app.confirmedSale} onClose={app.closeConfirmedSale} />
      <StockUpdateModal
        visible={app.stockAdjustmentOpen}
        blocked={app.stockChangesBlocked}
        saving={app.savingStock}
        product={app.stockAdjustmentProduct}
        onClose={app.closeStockAdjustment}
        onSubmit={app.saveStockAdjustment}
      />
      <StockReasonModal
        visible={app.stockReasonEditOpen}
        saving={app.savingStock}
        productName={app.stockReasonEditEntry?.productName ?? ''}
        reason={app.stockReasonEditEntry?.reason ?? null}
        onClose={app.closeStockReasonEdit}
        onSubmit={app.saveStockReason}
      />
      <ProductFormModal
        visible={app.productFormOpen}
        form={app.productForm}
        categories={app.categories}
        setForm={app.setProductForm}
        editing={Boolean(app.editingProductId)}
        saving={app.savingProduct}
        onClose={app.closeProductForm}
        onSave={app.saveProduct}
        onScan={() => app.openScanner('product')}
      />
    </SafeAreaView>
  );
}
