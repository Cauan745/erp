import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants';
import { Product } from '../../db/product/types';
import { StockHistoryEntry } from '../../db/stock/types';
import { shortDate } from '../../formatters';
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
  return (
    <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionKicker}>CATALOG</Text>
        <Text style={styles.sectionTitle}>Add a product</Text>
        <Text style={styles.muted}>Products are available immediately in this device’s local catalog.</Text>

        <Field
          label="Product name"
          value={form.name}
          placeholder="e.g. Reusable bottle"
          onChangeText={(name) => setForm((current) => ({ ...current, name }))}
        />
        <Field
          label="Price"
          value={form.price}
          placeholder="0,00"
          keyboardType="decimal-pad"
          onChangeText={(price) => setForm((current) => ({ ...current, price }))}
        />

        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>Barcode <Text style={styles.optional}>(optional)</Text></Text>
          <Pressable onPress={onScan}><Text style={styles.linkText}>Scan barcode</Text></Pressable>
        </View>
        <TextInput
          value={form.barcode}
          placeholder="Type or scan a barcode"
          placeholderTextColor={colors.muted}
          style={styles.input}
          onChangeText={(barcode) => setForm((current) => ({ ...current, barcode }))}
        />

        <Field
          label="Category"
          value={form.category}
          placeholder="General"
          onChangeText={(category) => setForm((current) => ({ ...current, category }))}
        />
        <Pressable style={styles.primaryButton} onPress={onSave}>
          <Text style={styles.primaryButtonText}>Save product locally</Text>
        </Pressable>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>CATALOGUE</Text>
          <Text style={styles.muted}>{products.length} products</Text>
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
            <Text style={styles.listTitle}>STOCK HISTORY</Text>
            <Text style={styles.muted}>Recent changes</Text>
          </View>
          {stockHistory.length ? stockHistory.map((entry) => (
            <View style={styles.stockHistoryCard} key={`${entry.source}-${entry.id}`}>
              <View style={styles.stockHistoryInfo}>
                <Text style={styles.productName}>{entry.productName}</Text>
                <Text style={styles.muted}>
                  {entry.source === 'sale' ? 'Sale' : entry.reason || 'No reason'} · {shortDate(entry.createdAt)}
                </Text>
              </View>
              <Text style={[styles.stockHistoryQuantity, entry.quantity < 0 && styles.stockHistoryDecrease]}>
                {entry.quantity > 0 ? '+' : ''}{entry.quantity}
              </Text>
            </View>
          )) : <Text style={styles.muted}>Stock changes will appear here.</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
