import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants';
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
  onScan: () => void;
  onOpenStockAdjustment: (productId: string) => void;
  stockHistory: StockHistoryEntry[];
};

export function ProductsTab({
  products,
  form,
  setForm,
  onSave,
  onScan,
  onOpenStockAdjustment,
  stockHistory
}: ProductsTabProps) {
  const { locale, t } = useI18n();

  return (
    <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionKicker}>{t('products.catalog')}</Text>
        <Text style={styles.sectionTitle}>{t('products.addProduct')}</Text>
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
          <Text style={styles.primaryButtonText}>{t('products.saveLocally')}</Text>
        </Pressable>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>{t('products.catalogue')}</Text>
          <Text style={styles.muted}>{t('common.productCount', { count: products.length })}</Text>
        </View>
        {products.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            compact
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
                  {entry.source === 'sale' ? t('products.sale') : entry.reason || t('products.noReason')} · {shortDate(entry.createdAt, locale)}
                </Text>
              </View>
              <Text style={[styles.stockHistoryQuantity, entry.quantity < 0 && styles.stockHistoryDecrease]}>
                {entry.quantity > 0 ? '+' : ''}{entry.quantity}
              </Text>
            </View>
          )) : <Text style={styles.muted}>{t('products.noStockChanges')}</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
