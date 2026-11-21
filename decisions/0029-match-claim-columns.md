---
status: accepted
date: 2026-11-21
---

# Hold the MatchClaim table as typed columns of exact values

## Context

The editor draws the AlignmentAnchors a package's MatchClaim table gives
(TimeToShare's README, "From MatchClaims to anchors"): each MatchClaim
passing the belief filter gives the anchor of its two start coordinates
and, for an interval claim, of its two end coordinates; two anchors are the
same when both coordinates are equal, **exactly on their timeline's axis**;
a potential MatchStamp is a connected set of coordinates under the unique
anchors. The table is Parquet; the editor has no Parquet reader, so
`tilie-server` reads it and answers with its columns.

The requirements:

1. **Exact equality** on every axis: an `int` value is an int64 (sample
   numbers pass 2^53), a `fraction` value a pair of int64 integers, a
   `float` value a double. Two values that round to the same double are
   two coordinates; `-0.0` and `0.0` on a float axis are one.
2. **No parsing and no object per row**: 250,000 claims become an index
   within about 100 ms of their arrival, and a hover is answered within
   1 ms. The browser views the server's arrays without copying them.
3. **A float key for order**: drawing and hit-testing need a position on a
   timeline as a double; it orders and searches, never decides equality on
   an exact axis.

## Considered options

- **JSON rows with coordinate dicts** (`{unit, number_type, value}`), the
  form the library writes elsewhere: exact, but one object per value and a
  parse of every row; refused by requirement 2.
- **Rationals in core** (`Rational` over `BigInt`, ADR 0011) per value:
  exact, but a heap object per value and BigInt arithmetic in every
  comparison of a sort; refused by requirement 2.
- **Doubles only**: fast, but 2^53 and 2^53 + 1, or 1/3 and the double
  nearest it, would merge; refused by requirement 1.
- **Typed columns: a double position plus an int64 numerator and an int64
  denominator per value**, the timeline's number type deciding which
  column is the value. Equality on an exact axis compares the two int64
  words of numerator and denominator, read through an `Int32Array` view
  without creating a BigInt; equality on a float axis compares the double.
  BigInt arithmetic is needed only to order distinct exact values sharing a
  double, which is rare.

## Decision

The last option. `MatchClaimColumns` (`app/packages/core/src/matches/columns.ts`)
is the form `POST /api/match-claims` answers in:

| Member | Type | Holds |
| --- | --- | --- |
| `rows` | number | the number of MatchClaims |
| `claimIds` | `string[]` | per row the claim's ID |
| `timelines` | `{id, numberType}[]` | the timelines the table names, each with its axis's number type |
| `a.timeline`, `b.timeline` | `Uint32Array` | per row the index of side A's and side B's timeline in `timelines` |
| `a.start`, `b.start`, `a.end`, `b.end` | three arrays each | per row the value of that side and anchor: `position` (`Float64Array`), `numerator` and `denominator` (`BigInt64Array`) |
| `startPresent`, `endPresent` | `Uint8Array` | per row 1 when it has a start (an end) anchor; a NOMATCH or conceptual MatchClaim has neither, a row with an end anchor has a start anchor |

A value is encoded by its timeline's number type:

| Number type | `position` | `numerator` | `denominator` |
| --- | --- | --- | --- |
| `int` | the double nearest the integer, ties to even | the integer | 1 |
| `fraction` | the double nearest the fraction, ties to even | the numerator in lowest terms | the denominator, positive |
| `float` | the value itself | 0 | 0 |

The position of an exact value is what Python's `float(value)` returns
(correctly rounded), and core's `toFloat` returns the same, so a value
looked up from a manifest finds its coordinate. Cells of a row without
that anchor are not read. The index takes, besides the columns, a row mask
(`Uint8Array`, 1 where the row passes the belief filter), computed by the
caller from the provenance it holds; the same columns serve every mask.
The mask is the belief filter's and nothing else: the comparison of a named
MatchStamp reads a recorded claim the mask leaves out as one the belief
filter does not pass, so a caller narrowing what is shown by anything else
(the timelines a view holds, say) narrows after the index and the
comparison, never through the mask.

Every array is a little-endian typed array, so the server can send them
as raw bytes, each aligned to eight bytes, behind a small header, and the
browser views them where they lie. The byte layout of that answer belongs
to the server and its client; this record fixes the arrays and their
encoding. `checkColumns` refuses columns that break the encoding (a length
other than `rows`, a claim ID given to two rows, a timeline index out of
range, an end anchor without a start anchor, a non-finite position, an
`int` denominator other than 1, a `fraction` denominator below 1 or not in
lowest terms, an exact value whose position is not the double nearest it,
which would split one coordinate in two, since exact equality is decided
only among equal positions); an index checks its columns on its first
build only, since columns are never changed after they arrive. The check
builds the map from claim ID to row that refuses a repeated ID, and every
comparison of a named MatchStamp against these columns reads that map.

The anchor index (`matches/anchors.ts`) sorts the values with a radix sort
of the positions' bits within each timeline, splits runs of one position by
exact value, and holds every part (coordinates, anchors with their claim
rows, neighbours, potential MatchStamps, matched spans) as typed arrays of
integer references.

## Maintenance and dependencies

No dependency enters: typed arrays, `BigInt64Array` among them, and their
`Int32Array` views are part of every supported runtime. The tests in
`app/packages/core/tests/matches.test.ts` pin the encoding (two fractions
and two integers sharing a double stay apart, `-0.0` is `0.0`, each
refusal), compare the index with a reference built from exact value texts
over generated tables, and `matches-budget.test.ts`, in the budget run
alone (`pnpm test:budget`), holds the check and build of 250,000 generated
claims to 200 ms and a hover to 1 ms.

Primary sources: <https://tc39.es/ecma262/#sec-typedarray-objects>,
<https://arrow.apache.org/docs/format/Columnar.html> (the columnar layout
the server reads with pyarrow), <https://docs.python.org/3/library/fractions.html>
(`Fraction` is always in lowest terms, `float()` correctly rounded).

## Consequences

The index never builds a number from a string or a BigInt per comparison,
and an exact value is read back from its columns only when it is shown or
written to a manifest. A server must write fractions in lowest terms and
positions correctly rounded, which Python's `Fraction` and `float` do;
`checkColumns` refuses either broken. Measured on 250,000 generated claims
(390,795 coordinates) inside the test runner: the check 57 to 59 ms, about
40 ms of it the map from claim IDs, the build 116 to 118 ms, a hover about
1 µs. The exit cost is
local: the columns are the only contract between the server and core.

## Review date

2027-05-21, or when the table reaches the browser without the server.
