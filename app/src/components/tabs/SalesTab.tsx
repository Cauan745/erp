import { Pressable, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';

import { PaymentMethod, Sale } from '../../db/sale/types';
import { money, shortDate } from '../../formatters';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';
import { EmptyState } from '../common/EmptyState';
import { Stat } from '../common/Stat';
import { SaleDetailsModal } from '../modals/SaleDetailsModal';

type SaleDayGroup = {
  key: string;
  sales: Sale[];
  revenue: number;
};

function dayKey(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function groupSalesByDay(sales: Sale[]): SaleDayGroup[] {
  const groups = new Map<string, SaleDayGroup>();

  for (const sale of sales) {
    const key = dayKey(sale.createdAt);
    const group = groups.get(key);
    if (group) {
      group.sales.push(sale);
      group.revenue += sale.total;
      continue;
    }

    groups.set(key, { key, sales: [sale], revenue: sale.total });
  }

  return Array.from(groups.values());
}

function dayLabel(value: string, locale: Parameters<Intl.DateTimeFormatConstructor>[0]): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(new Date(value));
}

export function SalesTab({ sales }: { sales: Sale[] }) {
  const { locale, t } = useI18n();
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const todayKey = dayKey(new Date());
  const todaySales = sales.filter((sale) => dayKey(sale.createdAt) === todayKey);
  const todayRevenue = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const salesByDay = groupSalesByDay(sales.filter((sale) => dayKey(sale.createdAt) !== todayKey));
  const paymentLabels: Record<PaymentMethod, 'sales.cash' | 'sales.debitCard' | 'sales.creditCard' | 'sales.pix'> = {
    cash: 'sales.cash',
    debit_card: 'sales.debitCard',
    credit_card: 'sales.creditCard',
    pix: 'sales.pix'
  };
  const renderSale = (sale: Sale) => (
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
  );

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionKicker}>{t('sales.history')}</Text>
      <Text style={styles.sectionTitle}>{t('sales.todaySales')}</Text>
      <View style={styles.statsRow}>
        <Stat label={t('sales.todaySales')} value={`${todaySales.length}`} />
        <Stat label={t('sales.todayRevenue')} value={money(todayRevenue, locale)} />
      </View>

      {todaySales.length ? todaySales.map(renderSale) : <EmptyState text={t('sales.noSalesToday')} />}

      {salesByDay.length ? (
        <>
          <Text style={styles.salesHistoryTitle}>{t('sales.historyByDay')}</Text>
          {salesByDay.map((group) => (
            <View key={group.key} style={styles.salesDay}>
              <Text style={styles.salesDayTitle}>{dayLabel(group.sales[0].createdAt, locale)}</Text>
              <View style={styles.salesDaySummary}>
                <Stat label={t('sales.sales')} value={`${group.sales.length}`} />
                <Stat label={t('sales.revenue')} value={money(group.revenue, locale)} />
              </View>
              {group.sales.map(renderSale)}
            </View>
          ))}
        </>
      ) : null}

      <SaleDetailsModal
        sale={selectedSale}
        onClose={() => setSelectedSale(null)}
      />
    </ScrollView>
  );
}
