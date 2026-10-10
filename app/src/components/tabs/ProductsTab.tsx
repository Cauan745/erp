import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants';
import { STOCK_REASON_AUTO_SALE_REPLENISHMENT } from '../../db';
import { Product } from '../../db/product/types';
import { StockHistoryEntry } from '../../db/stock/types';
import { shortDate } from '../../formatters';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';
import { ProductForm, SetProductForm } from '../../types';
import { Field } from '../common/Field';
import { ProductRow } from '../common/ProductRow';

type ProductsTabProps = {
  products: Product[];
  form: ProductForm;
  setForm: SetProductForm;
  onSave: () => void;
  editingProductId: string | null;
  onEditProduct: (product: Product) => void;
  onCancelEdit: () => void;
  onScan: () => void;
  onOpenStockAdjustment: (productId: string) => void;
  onEditStockReason: (entry: StockHistoryEntry) => void;
  stockHistory: StockHistoryEntry[];
};

export function ProductsTab({
  products,
  form,
  setForm,
  onSave,
  editingProductId,
  onEditProduct,
  onCancelEdit,
  onScan,
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
    <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionKicker}>{t('products.catalog')}</Text>
        <Text style={styles.sectionTitle}>{editingProductId ? t('products.editingProduct') : t('products.addProduct')}</Text>
        <Text style={styles.muted}>{t('products.localCatalogDescription')}</Text>

        <Field
          label={t('products.productName')}
          value={form.name}
          placeholder={t('products.productNamePlaceholder')}
          onChangeText={(name) => setForm((current) => ({ ...current, name }))}
        />
        <Field
          label={t('products.price')}
          value={form.price}
          placeholder={t('products.pricePlaceholder')}
          keyboardType="decimal-pad"
          onChangeText={(price) => setForm((current) => ({ ...current, price }))}
        />
        {editingProductId ? (
          <Text style={styles.stockUpdateCurrent}>{t('products.currentStock', { count: form.stock })}</Text>
        ) : (
          <Field
            label={t('products.stock')}
            value={form.stock}
            placeholder={t('products.stockPlaceholder')}
            keyboardType="numbers-and-punctuation"
            onChangeText={(stock) => setForm((current) => ({ ...current, stock }))}
          />
        )}

        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>{t('products.barcode')} <Text style={styles.optional}>({t('common.optional')})</Text></Text>
          <Pressable onPress={onScan}><Text style={styles.linkText}>{t('products.scanBarcode')}</Text></Pressable>
        </View>
        <TextInput
          value={form.barcode}
          placeholder={t('products.barcodePlaceholder')}
          placeholderTextColor={colors.muted}
          style={styles.input}
          onChangeText={(barcode) => setForm((current) => ({ ...current, barcode }))}
        />

        <Field
          label={t('products.category')}
          value={form.category}
          placeholder={t('products.categoryPlaceholder')}
          onChangeText={(category) => setForm((current) => ({ ...current, category }))}
        />
        <Pressable style={styles.primaryButton} onPress={onSave}>
          <Text style={styles.primaryButtonText}>{editingProductId ? t('products.saveChanges') : t('products.saveLocally')}</Text>
        </Pressable>
        {editingProductId ? (
          <Pressable style={styles.secondaryButton} onPress={onCancelEdit}>
            <Text style={styles.secondaryButtonText}>{t('products.cancelEdit')}</Text>
          </Pressable>
        ) : null}

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>{t('products.catalogue')}</Text>
          <Text style={styles.muted}>{t('common.productCount', { count: products.length })}</Text>
        </View>
        {products.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            compact
            onEdit={() => onEditProduct(product)}
            onStockUpdate={() => onOpenStockAdjustment(product.id)}
          />
        ))}

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
                  <Pressable onPress={() => onEditStockReason(entry)} hitSlop={8}>
                    <Text style={styles.addHint}>{t('products.editReason')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )) : <Text style={styles.muted}>{t('products.noStockChanges')}</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
