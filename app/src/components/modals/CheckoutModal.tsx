import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { money, parseMoneyToCents } from '../../formatters';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';
import { PaymentMethod } from '../../db/sale/types';

type CheckoutModalProps = {
  visible: boolean;
  total: number;
  onClose: () => void;
  onConfirm: (paymentMethod: PaymentMethod, cashReceivedCents: number | null) => void;
};

export function CheckoutModal({ visible, total, onClose, onConfirm }: CheckoutModalProps) {
  const insets = useSafeAreaInsets();
  const { locale, t } = useI18n();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashAmount, setCashAmount] = useState('');

  useEffect(() => {
    if (visible) {
      setPaymentMethod('cash');
      setCashAmount((total).toFixed(2).replace('.', ','));
    }
  }, [visible, total]);

  const totalCents = Math.round(total * 100);
  const cashReceivedCents = paymentMethod === 'cash' ? parseMoneyToCents(cashAmount, locale) : null;
  const cashAmountValid = paymentMethod !== 'cash'
    || (cashReceivedCents !== null && cashReceivedCents >= totalCents);
  const changeCents = cashReceivedCents === null ? null : cashReceivedCents - totalCents;
  const paymentOptions: Array<{ key: PaymentMethod; label: string }> = [
    { key: 'cash', label: t('checkout.cash') },
    { key: 'debit_card', label: t('checkout.debitCard') },
    { key: 'credit_card', label: t('checkout.creditCard') },
    { key: 'pix', label: t('checkout.pix') }
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.checkoutCard, { marginBottom: 20 + insets.bottom }]}>
          <Text style={styles.eyebrow}>{t('checkout.payment')}</Text>
          <Text style={styles.modalTitle}>{t('checkout.title')}</Text>
          <Text style={styles.muted}>{t('checkout.description')}</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('common.total')}</Text>
            <Text style={styles.totalValue}>{money(total, locale)}</Text>
          </View>
          <Text style={styles.fieldLabel}>{t('checkout.method')}</Text>
          <View style={styles.paymentOptions}>
            {paymentOptions.map((option) => (
              <Pressable
                key={option.key}
                style={[styles.paymentOption, paymentMethod === option.key && styles.paymentOptionSelected]}
                onPress={() => setPaymentMethod(option.key)}
              >
                <Text style={[styles.paymentOptionText, paymentMethod === option.key && styles.paymentOptionTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {paymentMethod === 'cash' ? (
            <>
              <Text style={styles.fieldLabel}>{t('checkout.cashReceived')}</Text>
              <TextInput
                style={styles.input}
                value={cashAmount}
                onChangeText={setCashAmount}
                keyboardType="decimal-pad"
                placeholder={t('checkout.cashReceivedPlaceholder')}
                placeholderTextColor={styles.muted.color}
              />
              {!cashAmountValid ? <Text style={styles.errorText}>{t('checkout.cashReceivedTooLow')}</Text> : null}
              {cashAmountValid && changeCents !== null ? (
                <View style={styles.changeRow}>
                  <Text style={styles.totalLabel}>{t('checkout.change')}</Text>
                  <Text style={styles.changeValue}>{money(changeCents / 100, locale)}</Text>
                </View>
              ) : null}
            </>
          ) : null}
          <Pressable
            style={[styles.primaryButton, !cashAmountValid && styles.buttonDisabled]}
            disabled={!cashAmountValid}
            onPress={() => onConfirm(paymentMethod, cashReceivedCents)}
          >
            <Text style={styles.primaryButtonText}>{t('checkout.confirmPayment')}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>{t('checkout.backToCart')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
