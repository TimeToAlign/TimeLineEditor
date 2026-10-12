---
status: accepted
date: 2026-10-12
---

# Read and write the inspector's YAML with `yaml`

## Context

The inspector shows the selected block's manifest as JSON, YAML or TOML and
writes an edited text back as one `set` command. For YAML it needs:

1. **Comments survive.** A comment the user types stays in the text after
   Apply and after a later change of the manifest from elsewhere (a drag,
   an undo) while the same block stays selected. The text must therefore be
   kept as a parsed document whose values are patched in place, not written
   anew from the manifest.
2. **Numbers stay exact.** Integers beyond 2^53 survive as `bigint`, and an
   integral float (`2.0`) stays a float, as timeskeleton's lossless reader
   keeps them; a float keeps its exact double.
3. YAML 1.2 (the core schema), so `yes`, `no` and `0.6.0` are strings, as in
   JSON.
4. Small, dependency-free, browser-ready, permissively licensed.

## Considered options

- `yaml` 2.9.1 (Eemeli Aro), ISC: YAML 1.1 and 1.2 with a document model
  (`parseDocument`, `Document`, nodes with `comment` and `commentBefore`),
  `intAsBigInt` (every integer a `bigint`, so a `number` is always a
  float), errors with line and column, no dependencies.
- `js-yaml` 5.4.3, MIT: parses to plain values only; comments are lost on
  the first write, so requirement 1 fails; integers beyond 2^53 lose
  precision.
- Write it ourselves: a YAML parser that keeps comments is a large grammar
  (block and flow collections, scalars in five styles, anchors) with a long
  tail of edge cases; maintaining it is out of proportion to the inspector.

Scores run from 1 (least suitable) to 5 (most suitable).

| Criterion | `yaml` | `js-yaml` | Own code |
| --- | ---: | ---: | ---: |
| Fit (comments kept, exact numbers, YAML 1.2) | 5 | 1 | 3 |
| Maintenance cost | 4 | 4 | 1 |
| Size and transitive dependencies | 4 | 3 | 5 |
| Licence | 5 | 5 | 5 |
| Exit cost | 4 | 4 | 5 |
| **Total** | **22** | **17** | **19** |

## Decision

Use `yaml` `^2.9.1` in the editor (locked at 2.9.1, released 2026-09-11),
always with `{intAsBigInt: true, schema: "core", uniqueKeys: true}`. The
inspector (`packages/editor/src/inspector/formats.ts`) keeps the parsed
`Document`, reads values by walking its nodes (a `bigint` within the safe
range becomes a plain number, an integral `number` a `JsonFloat`), writes
integral floats with one fractional digit (`minFractionDigits`), and
patches the document node by node, keeping a node, and so its comments,
wherever the new value has the same kind.

## Maintenance and dependencies

`yaml` is maintained by Eemeli Aro, its single maintainer on npm, since
2011 (105 published versions; a 3.0 line is in prerelease beside 2.x). The
repository has about 1,700 stars and a test suite that runs the official
YAML test suite. A single maintainer is a bus-factor risk; the 2.x line is
mature and the exit cost is low (one module).

Registry metadata checked on 2026-10-12 (unpacked bytes):

| Package | Release | Licence | Size (bytes) | Dependencies |
| --- | --- | --- | ---: | --- |
| `yaml` 2.9.1 | 2026-09-11 | ISC | 686,297 | none |

What the editor bundle gains: the parts the inspector imports, built alone
with Vite and minified, are 129,871 bytes (34,171 gzipped). The inspector loads it by a dynamic import the first time its format is chosen, so it sits in its own chunk of the built editor, 98.22 kB (30.77 kB gzipped), never in the main chunk.

Primary sources: <https://registry.npmjs.org/yaml>,
<https://github.com/eemeli/yaml>, <https://eemeli.org/yaml/>,
<https://github.com/eemeli/yaml/blob/main/LICENSE>,
<https://registry.npmjs.org/js-yaml>.

## Consequences

The YAML text survives Apply and outside changes with its comments while one
block stays selected; switching block, format or reloading writes the text
anew. The library writes the document back in its own layout (indentation,
flow sequences of scalars), so whitespace the user typed may change; values
and comments do not. Exit cost: `formats.ts`'s YAML section.

## Review date

2027-04-12, or when `yaml` 3.0 is released.
