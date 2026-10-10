import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { money } from '../../formatters';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';

type CheckoutModalProps = {
  visible: boolean;
  total: number;
  onClose: () => void;
  onConfirm: () => void;
};

export function CheckoutModal({ visible, total, onClose, onConfirm }: CheckoutModalProps) {
  const insets = useSafeAreaInsets();
  const { locale, t } = useI18n();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.checkoutCard, { marginBottom: 20 + insets.bottom }]}>
          <Text style={styles.eyebrow}>{t('checkout.payment')}</Text>
          <Text style={styles.modalTitle}>{t('checkout.title')}</Text>
          <Text style={styles.muted}>{t('checkout.description')}</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('common.total')}</Text>
            <Text style={styles.totalValue}>{money(total, locale)}</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={() => onConfirm()}>
            <Text style={styles.primaryButtonText}>{t('checkout.confirmCashPayment')}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>{t('checkout.backToCart')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
