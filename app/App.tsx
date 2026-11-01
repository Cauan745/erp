import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { AppContent } from './src/app/AppContent';
import { I18nProvider } from './src/i18n';

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <I18nProvider locale="pt-BR">
          <AppContent />
        </I18nProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
