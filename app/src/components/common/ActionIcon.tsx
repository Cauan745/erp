import { Pressable, Text } from 'react-native';

import { styles } from '../../styles';

type ActionIconProps = {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export function ActionIcon({ icon, label, onPress, danger = false, disabled = false }: ActionIconProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={[styles.iconAction, disabled && { opacity: 0.4 }]}
    >
      <Text style={[styles.iconActionText, danger && styles.iconActionDanger]}>{icon}</Text>
    </Pressable>
  );
}
