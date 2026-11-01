package com.stockroom.erp.common;

import java.util.Map;
import org.hibernate.exception.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionTimedOutException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.exc.MismatchedInputException;
import tools.jackson.databind.exc.UnrecognizedPropertyException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
    public record ErrorResponse(ErrorBody error) {}
    public record ErrorBody(String code, Map<String, ?> details) {}

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ErrorResponse> business(ApiException error) {
        return response(error.status(), error.code(), error.details());
    }

    // Service proxies have already rolled back before MVC translates these exceptions.
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ErrorResponse> constraint(DataIntegrityViolationException error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException constraint) {
                if ("products_name_unique".equals(constraint.getConstraintName())) return response(409, "product_name_taken", Map.of());
                if ("products_barcode_unique".equals(constraint.getConstraintName())) return response(409, "barcode_taken", Map.of());
            }
        }
        return unexpected(error);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErrorResponse> validation(MethodArgumentNotValidException error) {
        var fields = error.getBindingResult().getFieldErrors().stream().map(field -> Map.of(
                "field", field.getField(), "code", switch (field.getCode() == null ? "" : field.getCode()) {
                    case "NotNull", "NotBlank" -> "required";
                    case "Min", "Max" -> "out_of_range";
                    default -> "invalid_value";
                })).toList();
        return response(400, "validation_failed", Map.of("fields", fields));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ErrorResponse> unreadable(HttpMessageNotReadableException error) {
        String field = "body";
        String code = "invalid_value";
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof JacksonException jackson && !jackson.getPath().isEmpty()) {
                String property = jackson.getPath().getLast().getPropertyName();
                if (property != null) field = property;
            }
            if (cause instanceof UnrecognizedPropertyException unknown) {
                field = unknown.getPropertyName();
                code = "unknown_field";
            } else if (cause instanceof MismatchedInputException mismatch
                    && (mismatch.getTargetType() == Long.class || mismatch.getTargetType() == Integer.class)) {
                code = "integer";
            }
        }
        return business(ApiException.validation(field, code));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    ResponseEntity<ErrorResponse> missingParameter(MissingServletRequestParameterException error) {
        return business(ApiException.validation(error.getParameterName(), "required"));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ErrorResponse> invalidParameter(MethodArgumentTypeMismatchException error) {
        return business(ApiException.validation(error.getName(), "invalid_value"));
    }

    @ExceptionHandler({PessimisticLockingFailureException.class, TransactionTimedOutException.class,
            org.springframework.dao.QueryTimeoutException.class})
    ResponseEntity<ErrorResponse> busy(Exception error) { return response(503, "inventory_busy", Map.of()); }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorResponse> unexpected(Exception error) {
        log.error("Unhandled API failure", error);
        return response(500, "internal_error", Map.of());
    }

    private ResponseEntity<ErrorResponse> response(int status, String code, Map<String, ?> details) {
        return ResponseEntity.status(status).body(new ErrorResponse(new ErrorBody(code, details)));
    }
}
