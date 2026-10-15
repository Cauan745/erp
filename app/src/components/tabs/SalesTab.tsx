import { Pressable, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';

import { PaymentMethod, Sale } from '../../db/sale/types';
import { money, shortDate } from '../../formatters';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';
import { EmptyState } from '../common/EmptyState';
import { Stat } from '../common/Stat';
import { SaleDetailsModal } from '../modals/SaleDetailsModal';

export function SalesTab({ sales }: { sales: Sale[] }) {
  const { locale, t } = useI18n();
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const paymentLabels: Record<PaymentMethod, 'sales.cash' | 'sales.debitCard' | 'sales.creditCard' | 'sales.pix'> = {
    cash: 'sales.cash',
    debit_card: 'sales.debitCard',
    credit_card: 'sales.creditCard',
    pix: 'sales.pix'
  };

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionKicker}>{t('sales.history')}</Text>
      <Text style={styles.sectionTitle}>{t('sales.recentSales')}</Text>
      <View style={styles.statsRow}>
        <Stat label={t('sales.sales')} value={`${sales.length}`} />
        <Stat label={t('sales.revenue')} value={money(revenue, locale)} />
      </View>

      {sales.length ? sales.map((sale) => (
        <Pressable
          style={styles.saleCard}
          key={sale.id}
          onPress={() => setSelectedSale(sale)}
          accessibilityRole="button"
          accessibilityLabel={`${t('sales.saleDetails')}: ${money(sale.total, locale)}`}
        >
          <View>
            <Text style={styles.saleTitle}>{t('common.itemCount', { count: sale.lines.reduce((sum, line) => sum + line.quantity, 0) })}</Text>
            <Text style={styles.muted}>{shortDate(sale.createdAt, locale)} · {t(paymentLabels[sale.paymentMethod])}</Text>
            {sale.paymentMethod === 'cash' ? (
              <Text style={styles.muted}>{t('sales.change')}: {money(Math.max(0, (sale.cashReceived ?? sale.total) - sale.total), locale)}</Text>
            ) : null}
          </View>
          <Text style={styles.saleTotal}>{money(sale.total, locale)}</Text>
        </Pressable>
      )) : <EmptyState text={t('sales.completedCheckouts')} />}

      <SaleDetailsModal
        sale={selectedSale}
        onClose={() => setSelectedSale(null)}
      />
    </ScrollView>
  );
}
