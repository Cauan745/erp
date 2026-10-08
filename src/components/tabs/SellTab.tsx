import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants';
import { money } from '../../formatters';
import { Product } from '../../db/product/types';
import { styles } from '../../styles';
import { EmptyState } from '../common/EmptyState';
import { ProductRow } from '../common/ProductRow';

type SellTabProps = {
  products: Product[];
  search: string;
  onSearchChange: (value: string) => void;
  onScan: () => void;
  onAddToCart: (product: Product) => void;
  cartQuantity: number;
  cartTotal: number;
  onOpenCart: () => void;
};

export function SellTab({
  products,
  search,
  onSearchChange,
  onScan,
  onAddToCart,
  cartQuantity,
  cartTotal,
  onOpenCart
}: SellTabProps) {
  return (
    <View style={styles.content}>
      <View style={styles.heroRow}>
        <View>
          <Text style={styles.sectionKicker}>QUICK SALE</Text>
          <Text style={styles.sectionTitle}>Build a cart</Text>
        </View>
        <Pressable style={styles.scanButton} onPress={onScan}>
          <Text style={styles.scanIcon}>⌁</Text>
          <Text style={styles.scanButtonText}>Scan</Text>
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={search}
          onChangeText={onSearchChange}
          placeholder="Search products or barcode"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{search ? 'MATCHES' : 'ALL PRODUCTS'}</Text>
        <Text style={styles.muted}>{products.length} items</Text>
      </View>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <ProductRow product={item} onPress={() => onAddToCart(item)} />}
        ListEmptyComponent={<EmptyState text="No products match your search." />}
      />

      {cartQuantity > 0 ? (
        <Pressable style={styles.cartBar} onPress={onOpenCart}>
          <View>
            <Text style={styles.cartBarLabel}>{cartQuantity} {cartQuantity === 1 ? 'item' : 'items'} in cart</Text>
            <Text style={styles.cartBarTotal}>{money(cartTotal)}</Text>
          </View>
          <Text style={styles.cartBarAction}>Review cart  →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
