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
   integral float (`2.0`) stays a float, as TimeToShare's lossless reader
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
inspector (`packages/editor/src/inspector/yaml.ts`) reads a text's value
with the schema package's `parseYaml`, so it accepts what Import accepts,
and keeps the text's parsed `Document` beside it; it writes integral
floats with one fractional digit (`minFractionDigits`) and patches the
document node by node, keeping a node, and so its comments, wherever the
new value has the same kind.

## Maintenance and dependencies

`yaml` is maintained by Eemeli Aro, its single maintainer on npm. His
library starts at 1.0 in 2018; the 0.x versions published under the same
name from 2011 to 2016 were TJ Holowaychuk's unrelated package (105
versions are published under the name in all; a 3.0 line is in prerelease
beside 2.x). The repository has about 1,700 stars and a test suite that runs the official
YAML test suite. A single maintainer is a bus-factor risk; the 2.x line is
mature and the exit cost is low (one module).

Registry metadata checked on 2026-10-12 (unpacked bytes):

| Package | Release | Licence | Size (bytes) | Dependencies |
| --- | --- | --- | ---: | --- |
| `yaml` 2.9.1 | 2026-09-11 | ISC | 686,297 | none |

What the editor bundle gains: the parts the inspector imports, built alone
with Vite and minified, are 129,871 bytes (34,171 gzipped). The schema
package `@timetoalign/timetoshare` reads YAML manifests with the same
library since its 0.2.0 (TimeToShare's
`decisions/0014-typescript-yaml-reader.md`), so `yaml` is part of the schema package's chunk and loads at start; the
build resolves one copy for both (`resolve.dedupe`). The inspector's
codec, loaded by a dynamic import the first time YAML is chosen, is a
chunk of its own of 2.03 kB (1.00 kB gzipped; measured 2026-11-18).

Primary sources: <https://registry.npmjs.org/yaml>,
<https://github.com/eemeli/yaml>, <https://eemeli.org/yaml/>,
<https://github.com/eemeli/yaml/blob/main/LICENSE>,
<https://registry.npmjs.org/js-yaml>.

## Consequences

The YAML text survives Apply and outside changes with its comments while one
block stays selected; switching block, format or reloading writes the text
anew. A text whose value Apply leaves as it is stays exactly as typed; once
the value changes, a document holding a comment is written in the
library's own layout (a mapping in a sequence begins on its dash's line),
so whitespace the user typed may change; values and comments do not. Exit
cost: `yaml.ts`.

## Review date

2027-04-12, or when `yaml` 3.0 is released.
