import { Pressable, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { colors } from '../../constants';
import { STOCK_REASON_AUTO_SALE_REPLENISHMENT } from '../../db';
import { Product } from '../../db/product/types';
import { StockHistoryEntry } from '../../db/stock/types';
import { shortDate } from '../../formatters';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';
import { EmptyState } from '../common/EmptyState';
import { ActionIcon } from '../common/ActionIcon';
import { ProductRow } from '../common/ProductRow';

type ProductsTabProps = {
  products: Product[];
  search: string;
  onSearchChange: (value: string) => void;
  onAddProduct: () => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (product: Product) => void;
  onOpenStockAdjustment: (productId: string) => void;
  onEditStockReason: (entry: StockHistoryEntry) => void;
  stockHistory: StockHistoryEntry[];
};

export function ProductsTab({
  products,
  search,
  onSearchChange,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onOpenStockAdjustment,
  onEditStockReason,
  stockHistory
}: ProductsTabProps) {
  const { locale, t } = useI18n();

  const reasonLabel = (entry: StockHistoryEntry) => {
    if (entry.source === 'sale') return t('products.sale');
    if (entry.reason === STOCK_REASON_AUTO_SALE_REPLENISHMENT) {
      return t('products.autoSaleReplenishment');
    }
    return entry.reason || t('products.noReason');
  };

  return (
    <View style={styles.content}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        bottomOffset={16}
      >
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.sectionKicker}>{t('products.catalog')}</Text>
            <Text style={styles.sectionTitle}>{t('products.catalogue')}</Text>
          </View>
          <Pressable
            accessibilityLabel={t('common.add')}
            accessibilityRole="button"
            style={styles.addProductButton}
            onPress={onAddProduct}
          >
            <Text style={styles.addProductButtonText}>＋</Text>
          </Pressable>
        </View>
        <Text style={styles.muted}>{t('products.localCatalogDescription')}</Text>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder={t('products.searchPlaceholder')}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>{t('products.catalogue')}</Text>
          <Text style={styles.muted}>{t('common.productCount', { count: products.length })}</Text>
        </View>
        {products.length ? products.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            compact
            onEdit={() => onEditProduct(product)}
            onStockUpdate={() => onOpenStockAdjustment(product.id)}
            onDelete={() => onDeleteProduct(product)}
          />
        )) : <EmptyState text={search.trim() ? t('products.noProductsMatch') : t('products.noProducts')} />}

        <View style={styles.historySection}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>{t('products.stockHistory')}</Text>
            <Text style={styles.muted}>{t('products.recentChanges')}</Text>
          </View>
          {stockHistory.length ? stockHistory.map((entry) => (
            <View style={styles.stockHistoryCard} key={`${entry.source}-${entry.id}`}>
              <View style={styles.stockHistoryInfo}>
                <Text style={styles.productName}>{entry.productName}</Text>
                <Text style={styles.muted}>
                  {reasonLabel(entry)} · {shortDate(entry.createdAt, locale)}
                </Text>
              </View>
              <View style={styles.stockHistoryActions}>
                <Text style={[styles.stockHistoryQuantity, entry.quantity < 0 && styles.stockHistoryDecrease]}>
                  {entry.quantity > 0 ? '+' : ''}{entry.quantity}
                </Text>
                {entry.source === 'adjustment' ? (
                  <ActionIcon icon="✎" label={t('products.editReason')} onPress={() => onEditStockReason(entry)} />
                ) : null}
              </View>
            </View>
          )) : <Text style={styles.muted}>{t('products.noStockChanges')}</Text>}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
