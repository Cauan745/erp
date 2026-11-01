import { ActivityIndicator, Text, View } from 'react-native';

import { useI18n } from '../i18n';
import { styles } from '../styles';
import { colors } from '../constants';
import { useSyncStatus } from '../sync/status';

export function AppHeader() {
  const { t } = useI18n();
  const sync = useSyncStatus();
  const statusText = {
    syncing: t('header.syncing'),
    synced: t('header.synced'),
    pending: t('header.pending'),
    error: t('header.syncError')
  }[sync.status];
  const statusColor = {
    syncing: colors.accent,
    synced: colors.accent,
    pending: colors.warning,
    error: colors.danger
  }[sync.status];

  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>{t('header.localErpOfflineReady')}</Text>
        <Text style={styles.title}>stockroom</Text>
      </View>
      <View style={[styles.syncPill, { borderColor: statusColor }]}>
        {sync.status === 'syncing' ? (
          <ActivityIndicator size="small" color={statusColor} />
        ) : (
          <View style={[styles.syncDot, { backgroundColor: statusColor }]} />
        )}
        <Text style={[styles.syncText, { color: statusColor }]}>{statusText}</Text>
      </View>
    </View>
  );
}
