import { Text, View } from 'react-native';

import { styles } from '../styles';

export function AppHeader() {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>LOCAL ERP · OFFLINE READY</Text>
        <Text style={styles.title}>stockroom</Text>
      </View>
      <View style={styles.syncPill}>
        <View style={styles.greenDot} />
        <Text style={styles.syncText}>On device</Text>
      </View>
    </View>
  );
}
