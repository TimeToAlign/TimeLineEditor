---
status: accepted
date: 2026-10-19
---

# Set the inspector's title line in IBM Plex Mono, bundled with the editor

## Context

The inspector's first tab is named by the level the canvas is at
(Arranger, Bundle, Group or Timeline), and its panel opens with one title
line, "<level> <name>": the level's word in one style and the name of the
workspace or of the edited element in another, set as a console field in a
typewriter face. The line should look the same on every platform, so the
face is bundled rather than taken from the system. The editor already
bundles one face, DejaVu Sans 2.37 from the schema package, for the
drawing; it carries no monospaced face, and the text areas and codes of the
inspector name the platform's monospaced stack (`ui-monospace, "DejaVu Sans
Mono", Menlo, Consolas, monospace`).

The requirements:

1. **A typewriter look**: monospaced, with slab serifs, readable at 11 to
   15 CSS pixels.
2. **One file**: the two styles of the line come from size, case, letter
   spacing and colour, so one upright regular weight serves.
3. **Coverage**: Latin-1 and Latin Extended-A complete, since names are
   mostly European; a character the face lacks (Greek, the accidentals ♭ and
   ♯) falls back glyph by glyph to the platform's monospaced face.
4. **Small**: a WOFF2 file published upstream, so the bytes are the
   upstream release's, unconverted.
5. **A licence** that permits bundling in an MIT application with the
   licence text in the notices file.
6. **No package**: a static file vendored beside the editor's sources; no
   npm package is installed for it.

## Considered options

Each candidate was taken from its upstream release on 2026-10-19 and
measured with fontTools (character map coverage of Latin-1 U+00A0–U+00FF,
Latin Extended-A U+0100–U+017F, Greek U+0391–U+03C9, Cyrillic
U+0410–U+044F, and U+266D–U+266F).

| Face | Release | File | Bytes | SHA-256 | Licence |
| --- | --- | --- | ---: | --- | --- |
| DejaVu Sans Mono 2.37 | `version_2_37`, 2016-07-30 | `ttf/DejaVuSansMono.ttf` | 340,712 | `b4a6c3e4faab8773f4ff761d56451646409f29abedd68f05d38c2df667d3c582` | Bitstream Vera and Arev licences, DejaVu changes in the public domain |
| IBM Plex Mono 2.5.0 | `@ibm/plex-mono@2.5.0`, 2026-06-11 | `fonts/complete/woff2/IBMPlexMono-Regular.woff2` | 49,248 | `ba204497f16b6d334cee9d1e963a831b73e3a56e1d6300a8489d18df7214b350` | OFL-1.1, Reserved Font Name "Plex" |
| Courier Prime 3.018 | no release; repository head `7fd585a`, 2019-12-05 | `fonts/ttf/CourierPrime-Regular.ttf` | 71,188 | `72f793376f8e2841656bf21d77a5de010f2929bd6956a22ee848ad0c7eb978af` | OFL-1.1 |
| JetBrains Mono 2.304 | `v2.304`, 2023-01-14 | `fonts/webfonts/JetBrainsMono-Regular.woff2` | 92,164 | `a9cb1cd82332b23a47e3a1239d25d13c86d16c4220695e34b243effa999f45f2` | OFL-1.1 |
| The platform's `ui-monospace` stack | none | none | 0 | none | none |

Coverage (share of each range in the character map):

| Face | Latin-1 | Latin Ext-A | Greek | Cyrillic | ♭ ♮ ♯ |
| --- | ---: | ---: | ---: | ---: | --- |
| DejaVu Sans Mono 2.37 | 100 % | 100 % | 98 % | 100 % | all three |
| IBM Plex Mono 2.5.0 | 100 % | 100 % | 2 % | 100 % | none |
| Courier Prime 3.018 | 100 % | 98 % | 7 % | 0 % | none |
| JetBrains Mono 2.304 | 100 % | 98 % | 98 % | 100 % | ♭ and ♯ |

- **DejaVu Sans Mono 2.37**, the monospaced member of the release whose Sans
  the schema package already bundles, under the same licence. The widest
  coverage, but a sans-serif coding face without any typewriter feature,
  and only a TrueType file upstream: 340,712 bytes, seven times Plex Mono's
  WOFF2.
- **IBM Plex Mono 2.5.0**: slab serifs on `i`, `l`, `r` and the capitals, a
  typewriter's rhythm with a contemporary finish; an upstream WOFF2 of
  49,248 bytes; maintained by IBM in `IBM/plex` (the last push 2026-10-16,
  releases per face, a variable version released 2026-07-30 beside the
  static one). Greek and the accidentals fall back.
- **Courier Prime 3.018**: the most literal typewriter face (a redrawn
  Courier), but no tagged release, no upstream WOFF2, no change since 2019,
  and no Greek or Cyrillic.
- **JetBrains Mono 2.304**: good coverage, but a coding face without serifs,
  and nearly twice Plex Mono's bytes.
- **The platform's `ui-monospace` stack**: no bytes, no notice and no
  maintenance, but not bundled: SF Mono where the browser maps
  `ui-monospace` (Safari on Apple systems), elsewhere whatever `monospace`
  resolves to (Consolas, DejaVu Sans Mono, Liberation Mono), so the line
  looks different on every platform, and on none like a typewriter.
- **Write it ourselves**: designing and hinting a typeface is a craft of its
  own, out of all proportion to one line of the inspector.

Scores run from 1 (least suitable) to 5 (most suitable).

| Criterion | DejaVu Sans Mono | Plex Mono | Courier Prime | JetBrains Mono | `ui-monospace` | Own face |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fit (typewriter look, same everywhere) | 2 | 5 | 5 | 2 | 1 | 3 |
| Coverage | 5 | 4 | 3 | 5 | 4 | 1 |
| Bytes | 2 | 5 | 4 | 4 | 5 | 3 |
| Maintenance cost | 4 | 5 | 3 | 5 | 5 | 1 |
| Licence | 5 | 5 | 5 | 5 | 5 | 5 |
| Exit cost | 5 | 5 | 5 | 5 | 5 | 3 |
| **Total** | **23** | **29** | **25** | **26** | **25** | **16** |

## Decision

Bundle IBM Plex Mono 2.5.0 Regular: the file
`fonts/complete/woff2/IBMPlexMono-Regular.woff2` of the release archive
`ibm-plex-mono.zip` of `@ibm/plex-mono@2.5.0` (font revision 2.005), copied
unchanged to `app/packages/editor/fonts/IBMPlexMono-Regular.woff2` (49,248
bytes, SHA-256
`ba204497f16b6d334cee9d1e963a831b73e3a56e1d6300a8489d18df7214b350`), with
the archive's `LICENSE.txt` beside it as `fonts/LICENSE.txt`. The
inspector's stylesheet declares it with `@font-face` as the family "TiLiE
Plex Mono" (`font-display: swap`), which only the title line names,
followed by `ui-monospace, monospace` for the characters it lacks. The
About pane lists it with its licence and copyright line, and the notices
file carries its full licence text after DejaVu Sans's. The build test
requires the emitted asset to equal the vendored file byte for byte.

## Maintenance and dependencies

No package and no code: one static file and its licence. IBM maintains
Plex in `IBM/plex` (11,713 stars on 2026-10-19), publishing each face as
its own release; the static Regular of 2.5.0 is final as it stands, so the
file changes only by a decision to take a later release, checked against
this record.

What the builds gain: the page build and the embed build each emit the file
as one asset, 49,248 bytes, which the browser fetches only when the title
line is first shown (a face is loaded on use, so a host page that never
opens the inspector never fetches it); the stylesheet gains the minified
`@font-face` rule, 159 bytes in the embed's `tilie.css` (measured on the
embed build of 2026-10-19) and seven fewer in the page's stylesheet, which
lies beside the asset and so names it without the `assets/` prefix. No
script bytes. The wheel carries the page build, so it
gains the same asset.

Primary sources:
<https://github.com/IBM/plex/releases/tag/%40ibm%2Fplex-mono%402.5.0>,
<https://github.com/IBM/plex>,
<https://github.com/dejavu-fonts/dejavu-fonts/releases/tag/version_2_37>,
<https://github.com/quoteunquoteapps/CourierPrime>,
<https://github.com/JetBrains/JetBrainsMono/releases/tag/v2.304>,
<https://openfontlicense.org/open-font-license-official-text/>.

## Consequences

The title line looks the same in every browser and in every host page of
the embed. Greek letters and the accidentals ♭ and ♯ in a name are drawn by
the platform's monospaced face, so a name holding them mixes two faces.
The Reserved Font Name binds only modified versions; the file is shipped
unmodified. Exit cost: the two files in `fonts/`, the `@font-face` rule,
the attribution, the notice and the build test's lines.

## Review date

2027-04-19, or when a release of IBM Plex Mono adds Greek or the musical
accidentals.
