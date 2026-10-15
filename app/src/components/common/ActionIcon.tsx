import { Pressable, Text } from 'react-native';

import { styles } from '../../styles';

type ActionIconProps = {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
};

export function ActionIcon({ icon, label, onPress, danger = false }: ActionIconProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={styles.iconAction}
    >
      <Text style={[styles.iconActionText, danger && styles.iconActionDanger]}>{icon}</Text>
    </Pressable>
  );
}
