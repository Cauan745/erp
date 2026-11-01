import { ReactNode } from 'react';
import { Text, TextInput, View } from 'react-native';

import { colors } from '../../constants';
import { styles } from '../../styles';

type FieldProps = {
  label: ReactNode;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'decimal-pad' | 'numbers-and-punctuation';
};

export function Field({ label, value, placeholder, onChangeText, keyboardType }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.input}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
      />
    </View>
  );
}
