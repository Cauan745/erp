import { ScrollView, Text, View } from 'react-native';

import { Sale } from '../../db/sale/types';
import { money, shortDate } from '../../formatters';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';
import { EmptyState } from '../common/EmptyState';
import { Stat } from '../common/Stat';

export function SalesTab({ sales }: { sales: Sale[] }) {
  const { locale, t } = useI18n();
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionKicker}>{t('sales.history')}</Text>
      <Text style={styles.sectionTitle}>{t('sales.recentSales')}</Text>
      <View style={styles.statsRow}>
        <Stat label={t('sales.sales')} value={`${sales.length}`} />
        <Stat label={t('sales.revenue')} value={money(revenue, locale)} />
      </View>

      {sales.length ? sales.map((sale) => (
        <View style={styles.saleCard} key={sale.id}>
          <View>
            <Text style={styles.saleTitle}>{t('common.itemCount', { count: sale.lines.reduce((sum, line) => sum + line.quantity, 0) })}</Text>
            <Text style={styles.muted}>{shortDate(sale.createdAt, locale)} · {t('sales.cash')}</Text>
          </View>
          <Text style={styles.saleTotal}>{money(sale.total, locale)}</Text>
        </View>
      )) : <EmptyState text={t('sales.completedCheckouts')} />}
    </ScrollView>
  );
}
