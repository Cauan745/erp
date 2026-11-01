import { Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { colors } from '../../constants';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';
import { ProductForm, SetProductForm } from '../../types';
import { Field } from '../common/Field';

type ProductFormModalProps = {
  visible: boolean;
  form: ProductForm;
  categories: string[];
  setForm: SetProductForm;
  editing: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onScan: () => void;
};

export function ProductFormModal({
  visible,
  form,
  categories,
  setForm,
  editing,
  saving,
  onClose,
  onSave,
  onScan
}: ProductFormModalProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryQuery = form.category.trim().toLocaleLowerCase();
  const categorySuggestions = useMemo(
    () => categories.filter((category) => category.toLocaleLowerCase().includes(categoryQuery)).slice(0, 8),
    [categories, categoryQuery]
  );
  const hasExactCategory = categories.some((category) => category.toLocaleLowerCase() === categoryQuery);

  useEffect(() => {
    if (!visible) setCategoryMenuOpen(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!saving) onClose(); }}>
      <KeyboardAvoidingView
        style={styles.productModalKeyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.productModalCard, { marginBottom: 20 + insets.bottom }]}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.eyebrow}>{t('products.catalog')}</Text>
                <Text style={styles.modalTitle}>{editing ? t('products.editingProduct') : t('products.addProduct')}</Text>
              </View>
              <Pressable disabled={saving} onPress={onClose} hitSlop={8}>
                <Text style={styles.closeText}>{t('common.close')}</Text>
              </Pressable>
            </View>

            <KeyboardAwareScrollView
              contentContainerStyle={styles.productModalContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="none"
              bottomOffset={16}
            >
              <Field
                editable={!saving}
                label={t('products.productName')}
                value={form.name}
                placeholder={t('products.productNamePlaceholder')}
                onChangeText={(name) => setForm((current) => ({ ...current, name }))}
              />
              <Field
                editable={!saving}
                label={t('products.sellingPrice')}
                value={form.sellingPrice}
                placeholder={t('products.pricePlaceholder')}
                keyboardType="decimal-pad"
                onChangeText={(sellingPrice) => setForm((current) => ({ ...current, sellingPrice }))}
              />
              <Field
                editable={!saving}
                label={<Text>{t('products.cost')} <Text style={styles.optional}>({t('common.optional')})</Text></Text>}
                value={form.cost}
                placeholder={t('products.pricePlaceholder')}
                keyboardType="decimal-pad"
                onChangeText={(cost) => setForm((current) => ({ ...current, cost }))}
              />
              {editing ? (
                <Text style={styles.stockUpdateCurrent}>{t('products.currentStock', { count: form.stock })}</Text>
              ) : (
                <Field
                  editable={!saving}
                  label={t('products.stock')}
                  value={form.stock}
                  placeholder={t('products.stockPlaceholder')}
                  keyboardType="numbers-and-punctuation"
                  onChangeText={(stock) => setForm((current) => ({ ...current, stock }))}
                />
              )}

              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>
                  {t('products.barcode')} <Text style={styles.optional}>({t('common.optional')})</Text>
                </Text>
                <Pressable disabled={saving} onPress={onScan}>
                  <Text style={styles.linkText}>{t('products.scanBarcode')}</Text>
                </Pressable>
              </View>
              <TextInput
                editable={!saving}
                value={form.barcode}
                placeholder={t('products.barcodePlaceholder')}
                placeholderTextColor={colors.muted}
                style={styles.input}
                onChangeText={(barcode) => setForm((current) => ({ ...current, barcode }))}
                keyboardType="number-pad"
              />

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('products.category')}</Text>
                <TextInput
                  editable={!saving}
                  value={form.category}
                  placeholder={t('products.categoryPlaceholder')}
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  onFocus={() => setCategoryMenuOpen(true)}
                  onBlur={() => setTimeout(() => setCategoryMenuOpen(false), 100)}
                  onChangeText={(category) => {
                    setForm((current) => ({ ...current, category }));
                    setCategoryMenuOpen(true);
                  }}
                />
                {categoryMenuOpen && (categorySuggestions.length > 0 || (categoryQuery.length > 0 && !hasExactCategory)) ? (
                  <View style={styles.categorySuggestions}>
                    {categorySuggestions.map((category) => (
                      <Pressable
                        disabled={saving}
                        key={category}
                        style={styles.categorySuggestion}
                        onPress={() => {
                          setForm((current) => ({ ...current, category }));
                          setCategoryMenuOpen(false);
                        }}
                      >
                        <Text style={styles.categorySuggestionText}>{category}</Text>
                      </Pressable>
                    ))}
                    {categoryQuery.length > 0 && !hasExactCategory ? (
                      <Pressable
                        disabled={saving}
                        style={styles.categoryCreateSuggestion}
                        onPress={() => setCategoryMenuOpen(false)}
                      >
                        <Text style={styles.categoryCreateText}>
                          {t('products.createCategory', { category: form.category.trim() })}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <Pressable style={styles.primaryButton} disabled={saving} onPress={onSave}>
                <Text style={styles.primaryButtonText}>{saving ? t('products.saving') : editing ? t('products.saveChanges') : t('products.save')}</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} disabled={saving} onPress={onClose}>
                <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
              </Pressable>
            </KeyboardAwareScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
