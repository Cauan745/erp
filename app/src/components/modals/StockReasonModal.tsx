import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../constants';
import { STOCK_REASON_AUTO_SALE_REPLENISHMENT } from '../../db';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';

type StockReasonModalProps = {
  visible: boolean;
  productName: string;
  reason: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
};

export function StockReasonModal({
  visible,
  productName,
  reason,
  onClose,
  onSubmit
}: StockReasonModalProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) {
      setValue(reason === STOCK_REASON_AUTO_SALE_REPLENISHMENT
        ? t('products.autoSaleReplenishment')
        : reason ?? '');
    }
  }, [reason, visible, t]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.checkoutCard, { marginBottom: 20 + insets.bottom }]}>
          <Text style={styles.eyebrow}>{t('stock.inventory')}</Text>
          <Text style={styles.modalTitle}>{t('stock.editReason')}</Text>
          <Text style={styles.muted}>{productName}</Text>
          <Text style={styles.fieldLabel}>{t('stock.reason')}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={t('stock.reasonPlaceholder')}
            placeholderTextColor={colors.muted}
            style={styles.input}
            editable
            autoCapitalize="sentences"
            autoFocus
            returnKeyType="done"
          />
          <Pressable style={styles.primaryButton} onPress={() => onSubmit(value)}>
            <Text style={styles.primaryButtonText}>{t('stock.saveReason')}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
