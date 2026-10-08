import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppContent } from './src/app/AppContent';
import { I18nProvider } from './src/i18n';

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider locale="pt-BR">
        <AppContent />
      </I18nProvider>
    </SafeAreaProvider>
  );
}
