import { Pressable, Text, View } from 'react-native';

import { useI18n } from '../i18n';
import { styles } from '../styles';

export function AppHeader({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  const { t } = useI18n();
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>{t('header.onlineCatalog')}</Text>
        <Text style={styles.title}>stockroom</Text>
      </View>
      <Pressable style={styles.syncPill} disabled={refreshing} onPress={onRefresh} accessibilityRole="button">
        <Text style={styles.syncText}>{t(refreshing ? 'header.refreshing' : 'header.refresh')}</Text>
      </Pressable>
    </View>
  );
}
