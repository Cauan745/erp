import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';

import { styles } from '../../styles';

type ScannerModalProps = {
  visible: boolean;
  onClose: () => void;
  onBarcode: (barcode: string) => Promise<void>;
};

export function ScannerModal({ visible, onClose, onBarcode }: ScannerModalProps) {
  const insets = useSafeAreaInsets();
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
          <Text style={styles.scannerTitle}>Scan barcode</Text>
          <Pressable onPress={onClose}><Text style={styles.closeText}>Cancel</Text></Pressable>
        </View>

        {!hasPermission ? (
          <View style={styles.scannerMessage}>
            <Text style={styles.modalTitle}>Camera permission needed</Text>
            <Text style={styles.muted}>Allow camera access to scan products.</Text>
            <Pressable style={styles.primaryButton} onPress={() => void requestPermission()}>
              <Text style={styles.primaryButtonText}>Allow camera</Text>
            </Pressable>
          </View>
        ) : device ? (
          <>
            <Camera style={StyleSheet.absoluteFill} device={device} isActive={visible} codeScanner={codeScanner} />
            <View style={styles.scanFrame}>
              <View style={styles.scanCorner} />
              <Text style={styles.scanHint}>Align a barcode inside the frame</Text>
            </View>
          </>
        ) : (
          <View style={styles.scannerMessage}>
            <Text style={styles.modalTitle}>Camera unavailable</Text>
            <Text style={styles.muted}>Use the barcode field instead.</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}
