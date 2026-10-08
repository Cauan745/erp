import { Pressable, Text, View } from 'react-native';

import { Tab } from '../../types';
import { styles } from '../../styles';

type TabBarProps = {
  activeTab: Tab;
  bottomInset: number;
  onChange: (tab: Tab) => void;
};

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'sell', label: 'Sell', icon: '＋' },
  { id: 'products', label: 'Products', icon: '▦' },
  { id: 'sales', label: 'Sales', icon: '↗' }
];

export function TabBar({ activeTab, bottomInset, onChange }: TabBarProps) {
  return (
    <View style={[styles.tabBar, { height: 66 + bottomInset, paddingBottom: bottomInset }]}>
      {tabs.map((tab) => (
        <Pressable key={tab.id} style={styles.tabButton} onPress={() => onChange(tab.id)}>
          <Text style={[styles.tabIcon, activeTab === tab.id && styles.tabActive]}>{tab.icon}</Text>
          <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabActive]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
