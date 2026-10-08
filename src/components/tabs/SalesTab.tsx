import { ScrollView, Text, View } from 'react-native';

import { Sale } from '../../db/sale/types';
import { money, shortDate } from '../../formatters';
import { styles } from '../../styles';
import { EmptyState } from '../common/EmptyState';
import { Stat } from '../common/Stat';

export function SalesTab({ sales }: { sales: Sale[] }) {
  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionKicker}>HISTORY</Text>
      <Text style={styles.sectionTitle}>Recent sales</Text>
      <View style={styles.statsRow}>
        <Stat label="Sales" value={`${sales.length}`} />
        <Stat label="Revenue" value={money(revenue)} />
      </View>

      {sales.length ? sales.map((sale) => (
        <View style={styles.saleCard} key={sale.id}>
          <View>
            <Text style={styles.saleTitle}>{sale.lines.reduce((sum, line) => sum + line.quantity, 0)} items</Text>
            <Text style={styles.muted}>{shortDate(sale.createdAt)} · Cash</Text>
          </View>
          <Text style={styles.saleTotal}>{money(sale.total)}</Text>
        </View>
      )) : <EmptyState text="Completed checkouts will appear here." />}
    </ScrollView>
  );
}
