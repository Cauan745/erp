package com.stockroom.erp.sale;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PaymentMethodConverterTest {
    private final PaymentMethodConverter converter = new PaymentMethodConverter();

    @Test
    void mapsAllCanonicalValuesExplicitlyInBothDirections() {
        assertThat(PaymentMethod.values()).extracting(PaymentMethod::value)
                .containsExactly("cash", "debit_card", "credit_card", "pix");
        for (PaymentMethod method : PaymentMethod.values()) {
            assertThat(converter.convertToEntityAttribute(converter.convertToDatabaseColumn(method))).isEqualTo(method);
        }
        assertThat(converter.convertToDatabaseColumn(null)).isNull();
        assertThat(converter.convertToEntityAttribute(null)).isNull();
        assertThatThrownBy(() -> converter.convertToEntityAttribute("CASH")).isInstanceOf(IllegalArgumentException.class);
    }
}
