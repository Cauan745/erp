import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants';
import { Product } from '../../db/product/types';
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
};

export function ProductsTab({ products, form, setForm, onSave, onScan }: ProductsTabProps) {
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
        {products.map((product) => <ProductRow key={product.id} product={product} compact />)}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
