import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { money } from '../../formatters';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';
import { CartLine } from '../../types';
import { EmptyState } from '../common/EmptyState';

type CartModalProps = {
  visible: boolean;
  lines: CartLine[];
  total: number;
  onClose: () => void;
  onUpdateQuantity: (line: CartLine, delta: number) => void;
  onCheckout: () => void;
};

export function CartModal({ visible, lines, total, onClose, onUpdateQuantity, onCheckout }: CartModalProps) {
  const insets = useSafeAreaInsets();
  const { locale, t } = useI18n();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.cartSheet, { paddingBottom: 30 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.eyebrow}>{t('cart.currentSale')}</Text>
              <Text style={styles.modalTitle}>{t('cart.title')}</Text>
            </View>
            <Pressable onPress={onClose}><Text style={styles.closeText}>{t('common.close')}</Text></Pressable>
          </View>

          {lines.map((line) => (
            <View style={styles.cartLine} key={line.productId}>
              <View style={styles.cartLineInfo}>
                <Text style={styles.productName}>{line.name}</Text>
                <Text style={styles.muted}>{money(line.unitPrice, locale)} {t('cart.each')}</Text>
              </View>
              <View style={styles.quantity}>
                <Pressable onPress={() => onUpdateQuantity(line, -1)}><Text style={styles.quantityButton}>−</Text></Pressable>
                <Text style={styles.quantityText}>{line.quantity}</Text>
                <Pressable onPress={() => onUpdateQuantity(line, 1)}><Text style={styles.quantityButton}>＋</Text></Pressable>
              </View>
              <Text style={styles.lineTotal}>{money(line.lineTotal, locale)}</Text>
            </View>
          ))}

          {!lines.length ? <EmptyState text={t('cart.empty')} /> : (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t('common.total')}</Text>
                <Text style={styles.totalValue}>{money(total, locale)}</Text>
              </View>
              <Pressable style={styles.primaryButton} onPress={onCheckout}>
                <Text style={styles.primaryButtonText}>{t('cart.checkout')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
