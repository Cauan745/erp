import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../constants';
import { Product } from '../../db/product/types';
import { styles } from '../../styles';

type StockUpdateModalProps = {
  visible: boolean;
  product: Product | null;
  onClose: () => void;
  onSubmit: (quantity: string, reason: string) => void;
};

export function StockUpdateModal({ visible, product, onClose, onSubmit }: StockUpdateModalProps) {
  const insets = useSafeAreaInsets();
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
      <View style={styles.modalBackdrop}>
        <View style={[styles.checkoutCard, { marginBottom: 20 + insets.bottom }]}>
          <Text style={styles.eyebrow}>INVENTORY</Text>
          <Text style={styles.modalTitle}>Adjust stock</Text>
          <Text style={styles.muted}>{product?.name}</Text>
          <Text style={styles.stockUpdateCurrent}>Current stock: {product?.stock}</Text>

          <Text style={styles.fieldLabel}>Stock change</Text>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            placeholder="+1 or -1"
            placeholderTextColor={colors.muted}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
            autoFocus
          />
          <Text style={styles.stockUpdateHint}>Use a positive number to add stock or a negative number to remove it.</Text>

          <Text style={styles.fieldLabel}>Reason <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Delivery received"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Pressable style={styles.primaryButton} onPress={() => onSubmit(quantity, reason)}>
            <Text style={styles.primaryButtonText}>Save stock change</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
