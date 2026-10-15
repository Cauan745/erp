import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PaymentMethod, Sale } from '../../db/sale/types';
import { money, shortDate } from '../../formatters';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';

type SaleDetailsModalProps = {
  sale: Sale | null;
  onClose: () => void;
};

const paymentLabels: Record<PaymentMethod, 'sales.cash' | 'sales.debitCard' | 'sales.creditCard' | 'sales.pix'> = {
  cash: 'sales.cash',
  debit_card: 'sales.debitCard',
  credit_card: 'sales.creditCard',
  pix: 'sales.pix'
};

export function SaleDetailsModal({ sale, onClose }: SaleDetailsModalProps) {
  const insets = useSafeAreaInsets();
  const { locale, t } = useI18n();

  return (
    <Modal visible={Boolean(sale)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.saleDetailsSheet, { paddingBottom: 30 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.eyebrow}>{t('sales.saleDetails')}</Text>
              <Text style={styles.modalTitle}>{t('sales.saleDetailsTitle')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeText}>{t('common.close')}</Text>
            </Pressable>
          </View>

          {sale ? (
            <ScrollView contentContainerStyle={styles.saleDetailsContent}>
              <View style={styles.saleDetailsSection}>
                <View style={styles.saleDetailRow}>
                  <Text style={styles.saleDetailLabel}>{t('sales.saleDate')}</Text>
                  <Text style={styles.saleDetailValue}>{shortDate(sale.createdAt, locale)}</Text>
                </View>
                <View style={styles.saleDetailRow}>
                  <Text style={styles.saleDetailLabel}>{t('sales.paymentMethod')}</Text>
                  <Text style={styles.saleDetailValue}>{t(paymentLabels[sale.paymentMethod])}</Text>
                </View>
                {sale.paymentMethod === 'cash' ? (
                  <>
                    <View style={styles.saleDetailRow}>
                      <Text style={styles.saleDetailLabel}>{t('sales.cashReceived')}</Text>
                      <Text style={styles.saleDetailValue}>{money(sale.cashReceived ?? sale.total, locale)}</Text>
                    </View>
                    <View style={styles.saleDetailRow}>
                      <Text style={styles.saleDetailLabel}>{t('sales.change')}</Text>
                      <Text style={styles.saleDetailValue}>{money(Math.max(0, (sale.cashReceived ?? sale.total) - sale.total), locale)}</Text>
                    </View>
                  </>
                ) : null}
              </View>

              <Text style={styles.saleDetailsSectionTitle}>{t('sales.products')}</Text>
              {sale.lines.map((line) => (
                <View style={styles.saleDetailLine} key={`${sale.id}-${line.productId}`}>
                  <View style={styles.saleDetailInfo}>
                    <Text style={styles.productName}>{line.name}</Text>
                    <Text style={styles.muted}>{t('sales.quantity')}: {line.quantity}</Text>
                    <Text style={styles.muted}>{t('sales.unitPrice')}: {money(line.unitPrice, locale)}</Text>
                  </View>
                  <View style={styles.saleDetailRight}>
                    <Text style={styles.saleDetailLineTotal}>{money(line.lineTotal, locale)}</Text>
                    <Text style={styles.muted}>{t('sales.lineTotal')}</Text>
                  </View>
                </View>
              ))}

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t('sales.totalSale')}</Text>
                <Text style={styles.totalValue}>{money(sale.total, locale)}</Text>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
