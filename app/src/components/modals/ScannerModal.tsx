import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';

import { styles } from '../../styles';
import { useI18n } from '../../i18n';

type ScannerModalProps = {
  visible: boolean;
  onClose: () => void;
  onBarcode: (barcode: string) => Promise<void>;
};

export function ScannerModal({ visible, onClose, onBarcode }: ScannerModalProps) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128'],
    onCodeScanned: (codes) => {
      const value = codes[0]?.value;
      if (value) void onBarcode(value);
    }
  });

  useEffect(() => {
    if (visible && !hasPermission) void requestPermission();
  }, [visible, hasPermission, requestPermission]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.scanner}>
        <View style={[styles.scannerTop, { top: 20 + insets.top }]}>
          <Text style={styles.scannerTitle}>{t('scanner.title')}</Text>
          <Pressable onPress={onClose}><Text style={styles.closeText}>{t('common.cancel')}</Text></Pressable>
        </View>

        {!hasPermission ? (
          <View style={styles.scannerMessage}>
            <Text style={styles.modalTitle}>{t('scanner.cameraPermissionNeeded')}</Text>
            <Text style={styles.muted}>{t('scanner.allowCameraDescription')}</Text>
            <Pressable style={styles.primaryButton} onPress={() => void requestPermission()}>
              <Text style={styles.primaryButtonText}>{t('scanner.allowCamera')}</Text>
            </Pressable>
          </View>
        ) : device ? (
          <>
            <Camera style={StyleSheet.absoluteFill} device={device} isActive={visible} codeScanner={codeScanner} />
            <View style={styles.scanFrame}>
              <View style={styles.scanCorner} />
              <Text style={styles.scanHint}>{t('scanner.alignBarcode')}</Text>
            </View>
          </>
        ) : (
          <View style={styles.scannerMessage}>
            <Text style={styles.modalTitle}>{t('scanner.unavailable')}</Text>
            <Text style={styles.muted}>{t('scanner.useBarcodeField')}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
