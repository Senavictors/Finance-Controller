# ADR-002: Store Monetary Amounts as Integers (Cents)

## Status

Accepted

## Context

Floating-point arithmetic in JavaScript (and most languages) causes precision errors with decimal numbers. For example, `0.1 + 0.2 !== 0.3`. Financial calculations must be exact.

## Decision

All monetary amounts are stored as **integers representing cents** (or the smallest currency unit). For example, R$ 150.75 is stored as `15075`.

## Consequences

- No floating-point rounding errors in calculations
- Database column type is `Int` (or `BigInt` for very large amounts)
- UI layer converts cents to display format: `amount / 100`
- API accepts and returns cents
- Transfers, sums, and comparisons are exact integer arithmetic
