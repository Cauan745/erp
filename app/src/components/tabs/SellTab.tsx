import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { colors } from '../../constants';
import { money } from '../../formatters';
import { useI18n } from '../../i18n';
import { Product } from '../../repositories/product';
import { styles } from '../../styles';
import { EmptyState } from '../common/EmptyState';
import { ListStatus, ListStatusProps } from '../common/ListStatus';
import { ProductRow } from '../common/ProductRow';

type SellTabProps = {
  products: Product[];
  catalogStatus: ListStatusProps;
  lookingUpBarcode: boolean;
  barcodeError: string | null;
  onRetryBarcode: () => void;
  cartLocked: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onScan: () => void;
  onAddToCart: (product: Product) => void;
  cartQuantity: number;
  cartTotal: number;
  onOpenCart: () => void;
};

export function SellTab({
  products, catalogStatus, lookingUpBarcode, barcodeError, onRetryBarcode, cartLocked,
  search,
  onSearchChange,
  onScan,
  onAddToCart,
  cartQuantity,
  cartTotal,
  onOpenCart
}: SellTabProps) {
  const { locale, t } = useI18n();

  return (
    <KeyboardAvoidingView style={styles.content} behavior="height">
      <View style={styles.heroRow}>
        <View>
          <Text style={styles.sectionKicker}>{t('sell.quickSale')}</Text>
          <Text style={styles.sectionTitle}>{t('sell.buildCart')}</Text>
        </View>
        <Pressable style={styles.scanButton} disabled={lookingUpBarcode || cartLocked} onPress={onScan}>
          <Text style={styles.scanIcon}>⌁</Text>
          <Text style={styles.scanButtonText}>{t('sell.scan')}</Text>
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={search}
          onChangeText={onSearchChange}
          placeholder={t('sell.searchPlaceholder')}
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{search ? t('sell.matches') : t('sell.allProducts')}</Text>
        <Text style={styles.muted}>{t('common.itemCount', { count: products.length })}</Text>
      </View>

      <ListStatus {...catalogStatus} />
      {lookingUpBarcode ? <Text style={styles.muted}>{t('barcode.loading')}</Text> : null}
      {barcodeError ? <View>
        <Text style={styles.errorText}>{barcodeError}</Text>
        <Pressable disabled={lookingUpBarcode || cartLocked} onPress={onRetryBarcode}>
          <Text style={styles.closeText}>{t('barcode.retry')}</Text>
        </Pressable>
      </View> : null}
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        renderItem={({ item }) => <ProductRow product={item} disabled={cartLocked} onPress={() => onAddToCart(item)} />}
        ListEmptyComponent={!catalogStatus.loading && !catalogStatus.error ? <EmptyState text={t('sell.noProductsMatch')} /> : null}
      />

      {cartQuantity > 0 ? (
        <Pressable style={styles.cartBar} onPress={onOpenCart}>
          <View>
            <Text style={styles.cartBarLabel}>{t('sell.itemsInCart', { count: cartQuantity })}</Text>
            <Text style={styles.cartBarTotal}>{money(cartTotal, locale)}</Text>
          </View>
          <Text style={styles.cartBarAction}>{t('sell.reviewCart')}</Text>
        </Pressable>
      ) : null}
    </KeyboardAvoidingView>
  );
}
