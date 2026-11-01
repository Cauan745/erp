package com.stockroom.erp.common;

import com.stockroom.erp.sale.PaymentMethod;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class RequestFingerprintsTest {
    private static final UUID A = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID B = UUID.fromString("80000000-0000-0000-0000-000000000002");
    private RequestFingerprints.Item item(UUID id, int quantity) { return new RequestFingerprints.Item(id, quantity); }

    @Test
    void adjustmentUsesDocumentedCompactUtf8JsonAndWhitespaceNormalization() {
        assertThat(RequestFingerprints.adjustment(A, 2, "  café  "))
                .isEqualTo("9b21e1b44f3c4b7857e6d62a121afd9ec84f4408c530e8f2cc8cc7105c38bcfd");
        assertThat(RequestFingerprints.adjustment(A, 2, " "))
                .isEqualTo(RequestFingerprints.adjustment(A, 2, null));
        assertThat(RequestFingerprints.adjustment(A, -2, "café"))
                .isNotEqualTo(RequestFingerprints.adjustment(A, 2, "café"));
    }

    @Test
    void checkoutMergesLinesAndSortsCanonicalIdsAndOverrideSets() {
        String first = RequestFingerprints.checkout(List.of(item(B, 1), item(A, 1), item(A, 2)),
                PaymentMethod.PIX, null, 1500, List.of(B, A, B));
        assertThat(first).isEqualTo("d98397b3c6d411a48e6b29825f70163c299164a977f2459dc1b4d5f3be4405be");
        assertThat(first).isEqualTo(RequestFingerprints.checkout(List.of(item(A, 3), item(B, 1)),
                PaymentMethod.PIX, null, 1500, List.of(A, B)));
        assertThat(first).isNotEqualTo(RequestFingerprints.checkout(List.of(item(A, 3), item(B, 1)),
                PaymentMethod.PIX, null, 1501, List.of(A, B)));
    }

    @Test
    void identityIncludesPaymentCashAndAllSubmittedSemantics() {
        var items = List.of(item(A, 1));
        String original = RequestFingerprints.checkout(items, PaymentMethod.CASH, 500L, 400, List.of());
        assertThat(original).isNotEqualTo(RequestFingerprints.checkout(items, PaymentMethod.CASH, 600L, 400, List.of()));
        assertThat(original).isNotEqualTo(RequestFingerprints.checkout(items, PaymentMethod.CASH, 500L, 400, List.of(A)));
        assertThat(RequestFingerprints.checkout(items, PaymentMethod.PIX, null, 400, List.of()))
                .isNotEqualTo(RequestFingerprints.checkout(items, PaymentMethod.DEBIT_CARD, null, 400, List.of()));
    }

    @Test
    void rejectsInvalidOrOverflowingNormalizedInputs() {
        assertThatThrownBy(() -> RequestFingerprints.adjustment(A, 0, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RequestFingerprints.checkout(List.of(item(A, Integer.MAX_VALUE), item(A, 1)),
                PaymentMethod.PIX, null, 0, List.of())).isInstanceOf(ArithmeticException.class);
        assertThatThrownBy(() -> RequestFingerprints.checkout(List.of(item(A, 1)),
                PaymentMethod.PIX, null, 0, List.of(B))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RequestFingerprints.checkout(List.of(item(A, 1)),
                PaymentMethod.CASH, null, 0, List.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RequestFingerprints.checkout(List.of(item(A, 1)),
                PaymentMethod.PIX, null, RequestFingerprints.MAX_SAFE_CENTS + 1, List.of())).isInstanceOf(IllegalArgumentException.class);
    }
}
