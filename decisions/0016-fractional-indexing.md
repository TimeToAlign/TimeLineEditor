---
status: accepted
date: 2026-10-11
---

# Write fractional indices in `core`

## Context

Workspace siblings need stable order keys that can be inserted between two
existing keys without renumbering the collection. Keys must use base-62 digits
`0-9A-Za-z`, the length-prefixed integer head used by Rocicorp's
`fractional-indexing` 4.0.0, and ordinary JavaScript string comparison. The
required surface is three small functions: one key, several evenly distributed
keys, and validation.

The npm registry was checked on 2026-10-11. Version 4.0.0 was released on
2026-06-25, is CC0-1.0, has no runtime dependencies, and is 36,839 bytes
unpacked.

## Considered options

- `fractional-indexing` 4.0.0 from Rocicorp: use `generateKeyBetween` and
  `generateNKeysBetween`, plus a local validation wrapper.
- Write the fixed-alphabet subset in `core/src/workspace/order.ts`: one
  file of 166 lines in total (the whole file, counting comments, input checks
  and blank lines), copied from the published
  algorithm's public-domain structure and pinned to its key format.

Scores run from 1 (least suitable) to 5 (most suitable). For maintenance and
size, a higher score means less code or package surface to carry.

| Criterion | Package | Local subset |
| --- | ---: | ---: |
| Maintenance cost | 4 | 3 |
| Size | 3 | 5 |
| Transitive dependencies | 5 | 5 |
| Licence | 5 | 5 |
| Fit to the fixed key format | 5 | 5 |
| **Total** | **22** | **23** |

The package is well maintained and exactly defines the compatibility target.
Its configurable digit alphabets, caches and compatibility surface are not
needed here. The local subset has a higher testing obligation, but the four
published vectors and ordering properties cover the complete fixed-alphabet
surface.

Primary sources:
<https://registry.npmjs.org/fractional-indexing/4.0.0>,
<https://github.com/rocicorp/fractional-indexing>, and
<https://github.com/rocicorp/fractional-indexing/blob/main/LICENSE>.

## Decision

Write the fixed subset locally, key-compatible with `fractional-indexing`
4.0.0. `indexBetween` rejects invalid or unordered bounds rather than swapping
them, because an inverted sibling interval is a caller error.

## Consequences

No runtime dependency is added. Compatibility is pinned by `a0`, `a1`, `Zz`
and `a0V`, plus generated-key and generated-batch properties. The exit cost is
small: replace the three functions with wrappers around the package and keep
the same exported names and tests.

## Review date

2027-04-10, or when the compatibility package changes its key format.
