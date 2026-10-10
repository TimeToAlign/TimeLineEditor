---
status: accepted
date: 2026-10-10
---

# Write the exact rationals of `core` ourselves

## Context

Every coordinate whose number type is `fraction` is an exact ratio of two int64 integers, and integers on `int` axes may exceed 2^53. `core` must add, subtract, compare and normalize such values without ever building one from a JavaScript float, and must read and write them in the TimeSkeleton JSON forms: a `[numerator, denominator]` pair, a JSON integer, a JSON number. Nothing else is needed: no division, no rounding, no parsing of decimal fractions, no formatting beyond the pair.

## Considered options

- Write it ourselves: a `Rational` class over native `BigInt`, normalized on construction, built only from a Fraction pair of integers, a bigint or a decimal integer string.
- fraction.js 5.3.4: BigInt-based, MIT, widely used.
- big-rational and bigint-fraction style packages: small, but unmaintained or single-purpose forks.
- Decimal libraries (decimal.js, big.js): decimal, not rational; 1/3 is not representable.

## Decision

Write it ourselves (`app/packages/core/src/number/rational.ts`, about 100 lines). The surface is `Rational.of`, `fromParts`, `add`, `subtract`, `compare`, `equals`, `toFraction` and `toString`; the coordinate functions mirror timetoalign's `coordinate_from_dict` and `coordinate_to_dict`.

fraction.js is rejected because its constructor accepts JavaScript floats and decimal strings (`new Fraction(0.1)` approximates by continued fractions), which is the one behaviour the document model forbids; using it safely would need a wrapper that re-implements input checking, leaving its arithmetic as the only gain. Its arithmetic for our four operations is a few lines of BigInt code.

## Maintenance and dependencies

The code has no dependency; `BigInt` is part of every supported runtime. Tests in `app/packages/core/tests/number.test.ts` pin normalization, refusal of floats and exact arithmetic above 2^53.

fraction.js 5.3.4 (released 2025-08-22, MIT, 147,709 bytes unpacked, no dependencies) is published by a single maintainer (Robert Eisele); its bus factor is one, which matters less than its float-accepting API.

Primary sources: <https://registry.npmjs.org/fraction.js>, <https://github.com/rawify/Fraction.js>, <https://tc39.es/ecma262/#sec-bigint-objects>.

## Consequences

The rational type carries exactly the operations the invariants need and refuses floats by construction. Adding an operation later (multiplication for conversion maps, for example) is a local change with its own tests. Exit cost is nil: no package to replace.

## Review date

2027-04-10, or when a feature needs operations beyond addition, subtraction and comparison.
