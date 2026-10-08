import { Pressable, Text, View } from 'react-native';

import { useI18n } from '../i18n';
import { styles } from '../styles';

type StartupScreenProps = {
  bottomInset: number;
  topInset: number;
  error?: string | null;
  onRetry?: () => void;
};

export function StartupScreen({ bottomInset, topInset, error, onRetry }: StartupScreenProps) {
  const { t } = useI18n();

  return (
    <View style={[styles.loading, { paddingTop: topInset, paddingBottom: bottomInset }]}>
      <Text style={styles.logo}>stockroom</Text>
      {error ? (
        <>
          <Text style={styles.errorTitle}>{t('startup.databaseErrorTitle')}</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.primaryButton} onPress={onRetry}>
            <Text style={styles.primaryButtonText}>{t('startup.retry')}</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.muted}>{t('startup.startingDatabase')}</Text>
      )}
    </View>
  );
}
