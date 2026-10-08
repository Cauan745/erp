import { Pressable, Text, View } from 'react-native';

import { Tab } from '../../types';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';

type TabBarProps = {
  activeTab: Tab;
  bottomInset: number;
  onChange: (tab: Tab) => void;
};

const tabs: Array<{ id: Tab; icon: string }> = [
  { id: 'sell', icon: '＋' },
  { id: 'products', icon: '▦' },
  { id: 'sales', icon: '↗' }
];

export function TabBar({ activeTab, bottomInset, onChange }: TabBarProps) {
  const { t } = useI18n();
  const labels: Record<Tab, Parameters<typeof t>[0]> = {
    sell: 'tabs.sell',
    products: 'tabs.products',
    sales: 'tabs.sales'
  };

  return (
    <View style={[styles.tabBar, { height: 66 + bottomInset, paddingBottom: bottomInset }]}>
      {tabs.map((tab) => (
        <Pressable key={tab.id} style={styles.tabButton} onPress={() => onChange(tab.id)}>
          <Text style={[styles.tabIcon, activeTab === tab.id && styles.tabActive]}>{tab.icon}</Text>
          <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabActive]}>{t(labels[tab.id])}</Text>
        </Pressable>
      ))}
    </View>
  );
}
