import { Pressable, Text, View } from 'react-native';

import { styles } from '../styles';

type StartupScreenProps = {
  bottomInset: number;
  topInset: number;
  error?: string | null;
  onRetry?: () => void;
};

export function StartupScreen({ bottomInset, topInset, error, onRetry }: StartupScreenProps) {
  return (
    <View style={[styles.loading, { paddingTop: topInset, paddingBottom: bottomInset }]}>
      <Text style={styles.logo}>stockroom</Text>
      {error ? (
        <>
          <Text style={styles.errorTitle}>Local database could not start</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.primaryButton} onPress={onRetry}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.muted}>Starting local database…</Text>
      )}
    </View>
  );
}
