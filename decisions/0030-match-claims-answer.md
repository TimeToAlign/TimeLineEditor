---
status: accepted
date: 2026-11-21
---

# Send the MatchClaim table to the server as bytes and answer it as aligned arrays behind a JSON header

## Context

`POST /api/match-claims` takes a package's `match_claims.parquet` together
with the manifest it belongs to, reads the table with timetoalign, checks
it against the manifest with TimeToShare's table checks and answers with
the columns of decision 0029 (`MatchClaimColumns`) and every row's beliefs,
from which the editor computes the belief filter's row mask. Decision 0029
fixes the arrays and the encoding of a value; this record fixes the bytes
of the request and of the answer.

The requirements:

1. **No new dependency** on either side. FastAPI reads a multipart form
   only through `python-multipart`, which the server does not have.
2. **No copy and no parse of the arrays in the browser**: the answer of
   250,000 MatchClaims is about 30 MB of numbers, which typed arrays view
   where `Response.arrayBuffer()` put them. A typed array's offset must be
   a multiple of its element size, eight bytes for a double or an int64.
3. **No copy of the picked file in the browser**: the request is built from
   the `File` the user picked without reading it.
4. **Self-describing**: a client refuses an answer it does not understand
   instead of misreading it.

## Considered options

- **A multipart form**: standard, but needs `python-multipart` on the
  server (requirement 1).
- **JSON with the file in Base64** (request) or with number lists
  (answer): a copy of the file and a parse of every number (requirements 2
  and 3).
- **Apache Arrow IPC** for the answer: the columnar format pyarrow writes,
  but reading it in the browser takes the `apache-arrow` package
  (requirement 1), and its buffers are not the arrays of decision 0029.
- **A length prefix and plain bytes**, both ways: the request is a `Blob`
  of a four-byte prefix, the manifest's text and the picked `File`; the
  answer is a four-byte prefix, a JSON header naming the arrays and the
  arrays themselves, each at a multiple of eight bytes.

## Decision

The last option, both ways little-endian, with media type
`application/octet-stream`.

**The request** is three parts, back to back:

| Bytes | Holds |
| --- | --- |
| 0 to 3 | the manifest's length `M` in bytes, an unsigned 32-bit integer |
| 4 to 4 + `M` | the manifest file's text, UTF-8, in any serialization TimeToShare reads, IDs written `#id` |
| the rest | the Parquet file, unchanged |

**The answer** (200) is:

| Bytes | Holds |
| --- | --- |
| 0 to 3 | the header's length `H` in bytes, an unsigned 32-bit integer |
| 4 to 4 + `H` | the header, compact JSON in UTF-8 |
| from `base` | the arrays, `base` being 4 + `H` rounded up to a multiple of 8; the bytes between are zero |

The header is `{format, version, rows, timelines, actors, beliefs,
arrays}`: `format` is `"tilie-match-claims"`, `version` is `1`; `rows` the
number of MatchClaims; `timelines` `[{id, number_type}]`, every timeline a
row names, by bare ID sorted by code point, each with its axis's number
type as the manifest states it; `actors` every actor holding a belief,
sorted by code point; `beliefs` the belief words in TimeToShare's order,
`["true", "false", "unlikely"]`; `arrays` maps each array's name to
`[offset, length]`, its offset from `base` (a multiple of 8) and its
number of entries. Padding after an array is zero bytes.

| Array | Entries | Element | Holds |
| --- | --- | --- | --- |
| `claim_ids` | bytes | `uint8` | the claim IDs in row order, UTF-8, joined by U+000A (an ID holds no control character) |
| `a.timeline`, `b.timeline` | `rows` | `uint32` | the index of the side's timeline in `timelines` |
| `a.start.position`, `b.start.position`, `a.end.position`, `b.end.position` | `rows` | `float64` | decision 0029's `position` |
| `….numerator`, `….denominator` of the same four | `rows` | `int64` | decision 0029's `numerator` and `denominator` |
| `start_present`, `end_present` | `rows` | `uint8` | 1 where the row has that anchor |
| `belief_offsets` | `rows` + 1 | `uint32` | where each row's beliefs start in the two arrays below; the last entry is their number |
| `belief_actors` | beliefs | `uint32` | per belief its actor's index in `actors` |
| `belief_words` | beliefs | `uint8` | per belief its word's index in `beliefs` |

A row's beliefs are those of its own provenance, or those of the file's
provenance (TimeToShare's `timetoshare:provenance` metadata) when the file
states it, which the checks allow only for a table whose rows state none.
The arrays are listed in the order above; a client reads them by name.

**Refusals** answer JSON, as the server's other routes: 422
`{"detail": {"path", "message"}}` for a body that cannot be split, a
manifest that cannot be read (`path` timetoshare's) or bytes that are no
Parquet file; a table TimeToShare's checks refuse adds `problems`, every
problem the checks find as `{code, row, column, message}`, `message` being
the first one's; 501 for a server whose timetoshare cannot check tables or
read manifests, or whose timetoalign cannot read the table.

The client (`@timetoalign/tilie-client`, `matchClaims`) refuses an answer
whose header is no such object, whose `format` or `version` differ, whose
`beliefs` are not those three words, or whose arrays are missing, out of
bounds, misaligned or of another length than their name requires; it
views every array where it lies, decodes the claim IDs with one
`TextDecoder` call and one split, and refuses to run on a big-endian
platform. The row mask is computed from the beliefs on the client
(`beliefMask`), so the same answer serves every believer and filter.

## Maintenance and dependencies

No dependency enters: `struct`, `json` and numpy (which timetoalign
requires) on the server, `Blob`, `DataView`, typed arrays and
`TextDecoder` in the browser. The server's tests decode the answer to the
TimeToShare fixture `tables/0.2.0` with their own reader of this layout
and compare every array; `scripts/record_match_claims.py` writes that
answer into the client's tests, which decode it and compare the same
values, written out from the fixture by hand.

Primary sources: <https://fetch.spec.whatwg.org/#body-mixin>
(`arrayBuffer()`), <https://tc39.es/ecma262/#sec-typedarray-objects> (a
view's offset a multiple of its element size), <https://w3c.github.io/FileAPI/#blob-section>
(a `Blob` of parts reads the picked file without copying it in script),
<https://www.rfc-editor.org/rfc/rfc8259> (JSON).

## Consequences

An answer of 250,000 MatchClaims costs one JSON parse of a header of a few
hundred bytes, one decode and split of the IDs, and no copy of the arrays.
A later layout raises `version`; a client refuses a version it does not
know. The exit cost is local: the server's encoder and the client's
decoder are the two readers of this layout.

Decision 0031 adds the routes that read a MatchClaim's provenance and
record a belief; both take this request behind their parameters.

## Review date

2027-05-21, or when the table reaches the browser without the server.
