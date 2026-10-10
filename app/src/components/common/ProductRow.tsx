import { Pressable, Text, View } from 'react-native';

import { Product } from '../../db/product/types';
import { money } from '../../formatters';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';

type ProductRowProps = {
  product: Product;
  onPress?: () => void;
  onStockUpdate?: () => void;
  onEdit?: () => void;
  compact?: boolean;
};

export function ProductRow({ product, onPress, onStockUpdate, onEdit, compact = false }: ProductRowProps) {
  const { locale, t } = useI18n();

  const body = (
    <View style={[styles.productRow, compact && styles.productRowCompact]}>
      <View style={styles.productMark}>
        <Text style={styles.productMarkText}>{product.name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.muted}>{product.category} · {product.barcode || t('common.noBarcode')}</Text>
      </View>
      <View style={styles.productRight}>
        <Text style={styles.productPrice}>{t('products.sellingPrice')}: {money(product.sellingPrice, locale)}</Text>
        <Text style={styles.muted}>{t('products.cost')}: {product.cost === null ? t('products.costNotSet') : money(product.cost, locale)}</Text>
        <Text style={[styles.muted, product.profit !== null && product.profit < 0 && styles.stockHistoryDecrease]}>
          {t('products.profit')}: {product.profit === null ? t('products.costNotSet') : money(product.profit, locale)}
        </Text>
        <Text style={styles.muted}>{t('common.inStock', { count: product.stock })}</Text>
        {onPress ? <Text style={styles.addHint}>{t('common.add')}</Text> : (
          <>
            {onEdit ? (
              <Pressable onPress={onEdit} hitSlop={8}>
                <Text style={styles.addHint}>{t('products.editProduct')}</Text>
              </Pressable>
            ) : null}
            {onStockUpdate ? (
              <Pressable onPress={onStockUpdate} hitSlop={8}>
                <Text style={styles.addHint}>{t('common.adjustStock')}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}
