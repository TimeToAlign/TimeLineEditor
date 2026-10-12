---
status: accepted
date: 2026-10-12
---

# Read and write the inspector's TOML with `@decimalturn/toml-patch`

## Context

The inspector shows the selected block's manifest as JSON, YAML or TOML and
writes an edited text back as one `set` command. For TOML it needs:

1. **Comments survive.** A comment the user types stays in the text after
   Apply and after a later change of the manifest from elsewhere while the
   same block stays selected, so the parsed document is patched in place.
2. **Numbers stay exact.** Integers beyond 2^53 survive as `bigint`; an
   integral float (`2.0`) stays a float, an integer an integer.
3. TOML 1.0, small, dependency-free, browser-ready, permissively licensed.

TOML has no null; that is the inspector's own rule
(`packages/editor/src/inspector/nulls.ts`), independent of the library. A
null member the schema requires and admits as null is omitted and restored
as null on read. Any other null cannot be shown and the manifest is refused
for TOML as `not_representable` at the null's path: a measure-map row's
`nominal_length: null` (optional and nullable, so absent and null mean
different things) or a null array item. Such a manifest is shown and edited
as JSON or YAML, which both have null.

## Considered options

- `@decimalturn/toml-patch` 3.3.0 (Martin Leduc, a maintained continuation
  of Tim Hall's `toml-patch`), MIT: a concrete syntax tree with
  `TomlDocument.patch(value)` that changes only differing values and keeps
  comments and layout; `integersAsBigInt: true` returns every integer as a
  `bigint` (so a `number` is always a float); `minimumDecimals: 1` writes a
  plain JavaScript number as a float and a `bigint` as an integer; errors
  carry line and column. No dependencies.
- `toml-patch` 0.2.3 (Tim Hall), MIT: the original; unreleased since
  2019, integers as JavaScript numbers (precision lost beyond 2^53).
- `@rainbowatcher/toml-edit-js` 0.6.5, MIT: Rust's `toml_edit` compiled to
  WebAssembly; comment-preserving, but a WebAssembly module to load and a
  smaller release history (14 versions), last released 2026-03-13.
- `smol-toml` 1.9.1, BSD-3-Clause: fast and exact, but parses to plain
  values only; comments are lost on the first write.
- Write it ourselves: a TOML parser and a comment-preserving writer is a
  moderate grammar (tables, arrays of tables, inline tables, four string
  forms, dotted keys) whose edge cases the candidates already cover.

Scores run from 1 (least suitable) to 5 (most suitable).

| Criterion | decimalturn | toml-patch | toml-edit-js | smol-toml | Own code |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fit (comments kept, exact numbers) | 5 | 2 | 4 | 1 | 3 |
| Maintenance cost | 3 | 1 | 3 | 4 | 1 |
| Size and transitive dependencies | 3 | 3 | 2 | 5 | 5 |
| Licence | 5 | 5 | 5 | 5 | 5 |
| Exit cost | 4 | 4 | 3 | 4 | 5 |
| **Total** | **20** | **15** | **17** | **19** | **19** |

`@decimalturn/toml-patch` is the only published candidate that meets both
hard requirements today; writing it ourselves would meet them only after
work this project would then maintain.

## Decision

Use `@decimalturn/toml-patch` `^3.3.0` in the editor (locked at 3.3.0,
released 2026-09-27), always with `{integersAsBigInt: true}` to read and
`{minimumDecimals: 1, inlineTableStart: Number.MAX_SAFE_INTEGER}` to write
(every table its own `[section]`; arrays of tables inside arrays stay
inline, as TOML requires). The inspector converts every integer to a
`bigint` and every `JsonFloat` to a number before writing, and back after
reading, so integer and float kinds and exact values survive; every
manifest fixture round-trips byte for byte after `dumps` (tested).

## Maintenance and dependencies

The package is maintained by Martin Leduc (`decimalturn`) with Tim Hall,
the original author, listed as a contributor; 52 versions since
2025-04-12, frequent releases (3.1, 3.2 and 3.3 within September 2026),
about ten stars. A single active maintainer and a high release churn are
the main risks, mitigated by locking the version, the tests above and the
small surface the inspector uses (`TomlDocument`, `patch`, `toTomlString`,
`toJsObject`, `stringify`).

Registry metadata checked on 2026-10-12 (unpacked bytes):

| Package | Release | Licence | Size (bytes) | Dependencies |
| --- | --- | --- | ---: | --- |
| `@decimalturn/toml-patch` 3.3.0 | 2026-09-27 | MIT | 204,756 | none |
| `toml-patch` 0.2.3 | 2019-08-01 | MIT | 418,933 | none |
| `@rainbowatcher/toml-edit-js` 0.6.5 | 2026-03-13 | MIT | 349,733 | none |
| `smol-toml` 1.9.1 | 2026-10-09 | BSD-3-Clause | 140,039 | none |

What the editor bundle gains: `TomlDocument` and `stringify` built alone
with Vite and minified are 217,434 bytes (53,246 gzipped); the package
ships one prebuilt module, so little is shaken off. The inspector loads it by a dynamic import the first time its format is chosen, so it sits in its own chunk of the built editor, 168.07 kB (47.91 kB gzipped), never in the main chunk.

Primary sources: <https://registry.npmjs.org/@decimalturn/toml-patch>,
<https://github.com/DecimalTurn/toml-patch>,
<https://github.com/DecimalTurn/toml-patch/blob/main/LICENSE>,
<https://registry.npmjs.org/toml-patch>, <https://github.com/timhall/toml-patch>,
<https://registry.npmjs.org/@rainbowatcher/toml-edit-js>,
<https://registry.npmjs.org/smol-toml>, <https://toml.io/en/v1.0.0>.

## Consequences

The TOML text keeps its comments and layout across Apply and outside
changes while one block stays selected. Exit cost: `formats.ts`'s TOML
section; the null rule and the number conversion are the project's own and
stay. If the package stalls, `smol-toml` for reading plus an own writer is
the fallback, giving up comment survival.

## Review date

2027-01-12 (three months, for the release churn), or at its next major
version.
