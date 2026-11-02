import { Pressable, Text, View } from 'react-native';

import { useI18n } from '../../i18n';
import { styles } from '../../styles';

export type ListStatusProps = {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRetry: () => void;
};

export function ListStatus({ loading, refreshing, error, onRetry }: ListStatusProps) {
  const { t } = useI18n();
  return <View>
    {loading || refreshing ? <Text style={styles.muted} accessibilityRole="progressbar">
      {t(loading ? 'lists.loading' : 'header.refreshing')}
    </Text> : null}
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
    {!loading ? <Pressable disabled={refreshing} onPress={onRetry} accessibilityRole="button">
      <Text style={styles.closeText}>{t(error ? 'common.retry' : 'header.refresh')}</Text>
    </Pressable> : null}
  </View>;
}
