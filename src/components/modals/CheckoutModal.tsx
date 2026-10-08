import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { money } from '../../formatters';
import { styles } from '../../styles';

type CheckoutModalProps = {
  visible: boolean;
  total: number;
  onClose: () => void;
  onConfirm: () => void;
};

export function CheckoutModal({ visible, total, onClose, onConfirm }: CheckoutModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.checkoutCard, { marginBottom: 20 + insets.bottom }]}>
          <Text style={styles.eyebrow}>PAYMENT</Text>
          <Text style={styles.modalTitle}>Complete checkout</Text>
          <Text style={styles.muted}>This MVP records a cash sale locally on this device.</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{money(total)}</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={onConfirm}>
            <Text style={styles.primaryButtonText}>Confirm cash payment</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Back to cart</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
