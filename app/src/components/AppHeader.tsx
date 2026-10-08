import { Text, View } from 'react-native';

import { useI18n } from '../i18n';
import { styles } from '../styles';

export function AppHeader() {
  const { t } = useI18n();

  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>{t('header.localErpOfflineReady')}</Text>
        <Text style={styles.title}>stockroom</Text>
      </View>
      <View style={styles.syncPill}>
        <View style={styles.greenDot} />
        <Text style={styles.syncText}>{t('header.onDevice')}</Text>
      </View>
    </View>
  );
}
