---
status: accepted
date: 2026-10-11
---

# Rasterize review renders with rsvg-convert

## Context

The look of a drawing is approved from a review sheet: every manifest
fixture of the schema package, drawn by `layout` and written by `writeSvg`,
rasterized to PNG at zoom 2 and listed on one HTML page
(`app/packages/writers/scripts/review-sheet.ts`). The rasterizer must draw
the SVG's text in the font the drawing specification names, the
`fonts/DejaVuSans.ttf` that timeskeleton ships, and never in a system copy of
it, so it must take its fonts from a directory the script names. This is a
development tool run by hand; nothing of it reaches a package, the wheel or
CI.

## Considered options

- **rsvg-convert** (librsvg), a command-line SVG rasterizer using cairo,
  pango and fontconfig; a fontconfig file passed in `FONTCONFIG_FILE` whose
  only font directory is timeskeleton's `fonts/` limits it to the bundled
  font.
- **A headless browser** (Playwright's Chromium): a large download, and its
  font selection is harder to confine to one directory.
- **resvg**: a rasterizer with its own font database; not packaged on the
  development machines in use and a further binary to audit.
- **Write it ourselves**: not reasonable; rasterizing SVG text needs a font
  shaper and a renderer.

## Decision

Use `rsvg-convert` from the system's librsvg package, audited at version
2.62.3 (cairo 1.18.4, pango 1.58.0, fontconfig 2.18.1). The review-sheet
script calls it as a subprocess with a temporary fontconfig file whose only
font directory holds the bundled font, and refuses to rasterize when
`fc-list` under that file lists any other font or when `rsvg-convert`
fails.

## Maintenance and dependencies

librsvg is a GNOME project maintained since 2002 with several active
maintainers, released several times a year, licensed LGPL-2.1-or-later, and
packaged by every Linux distribution and Homebrew. The script uses only
`--zoom` and `--output` (PNG is the default format), options stable for many
years.

Primary sources: <https://gitlab.gnome.org/GNOME/librsvg>,
<https://gitlab.gnome.org/GNOME/librsvg/-/blob/main/COPYING.LIB>.

## Consequences

The review sheet can be rebuilt on any machine with librsvg. Exit cost: the
one subprocess call; any rasterizer that takes its fonts from a named
directory replaces it.

## Review date

2027-04-11.
