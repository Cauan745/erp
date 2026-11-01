import { Pressable, Text, View } from 'react-native';

import { Product } from '../../db/product/types';
import { money } from '../../formatters';
import { useI18n } from '../../i18n';
import { styles } from '../../styles';
import { ActionIcon } from './ActionIcon';

type ProductRowProps = {
  product: Product;
  onPress?: () => void;
  onStockUpdate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  compact?: boolean;
};

export function ProductRow({ product, onPress, onStockUpdate, onEdit, onDelete, compact = false }: ProductRowProps) {
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
        {onPress ? (
          <ActionIcon icon="＋" label={t('common.add')} onPress={onPress} />
        ) : (
          <View style={styles.iconActionGroup}>
            {onEdit ? <ActionIcon icon="✎" label={t('products.editProduct')} onPress={onEdit} /> : null}
            {onStockUpdate ? <ActionIcon icon="±" label={t('common.adjustStock')} onPress={onStockUpdate} /> : null}
            {onDelete ? <ActionIcon icon="×" label={t('common.delete')} onPress={onDelete} danger /> : null}
          </View>
        )}
      </View>
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}
