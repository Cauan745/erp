import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { colors } from '../../constants';
import { Product } from '../../repositories/product';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';

type StockUpdateModalProps = {
  visible: boolean;
  saving: boolean;
  product: Product | null;
  onClose: () => void;
  onSubmit: (quantity: string, reason: string) => void;
};

export function StockUpdateModal({ visible, saving, product, onClose, onSubmit }: StockUpdateModalProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (visible) {
      setQuantity('');
      setReason('');
    }
  }, [visible, product?.id]);

  return (
    <Modal visible={visible && Boolean(product)} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.productModalKeyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAwareScrollView
            style={styles.modalKeyboardScroll}
            contentContainerStyle={styles.modalKeyboardContent}
            keyboardShouldPersistTaps="handled"
            bottomOffset={16}
          >
            <View style={[styles.checkoutCard, { marginBottom: 20 + insets.bottom }]}>
          <Text style={styles.eyebrow}>{t('stock.inventory')}</Text>
          <Text style={styles.modalTitle}>{t('stock.adjust')}</Text>
          <Text style={styles.muted}>{product?.name}</Text>
          <Text style={styles.stockUpdateCurrent}>{t('stock.current', { count: product?.stock ?? 0 })}</Text>

          <Text style={styles.fieldLabel}>{t('stock.change')}</Text>
          <TextInput
            editable={!saving}
            value={quantity}
            onChangeText={setQuantity}
            placeholder={t('stock.changePlaceholder')}
            placeholderTextColor={colors.muted}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
            autoFocus
          />
          <Text style={styles.stockUpdateHint}>{t('stock.changeHint')}</Text>

          <Text style={styles.fieldLabel}>{t('stock.reason')} <Text style={styles.optional}>({t('common.optional')})</Text></Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={t('stock.reasonPlaceholder')}
            placeholderTextColor={colors.muted}
            style={styles.input}
            editable={!saving}
            autoCapitalize="sentences"
            returnKeyType="done"
          />

          <Pressable style={styles.primaryButton} disabled={saving} onPress={() => onSubmit(quantity, reason)}>
            <Text style={styles.primaryButtonText}>{t(saving ? 'products.saving' : 'stock.saveChange')}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} disabled={saving} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
          </Pressable>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
