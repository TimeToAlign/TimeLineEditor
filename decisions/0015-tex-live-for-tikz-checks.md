---
status: accepted
date: 2026-10-10
---

# Compile the TikZ figures with TeX Live from the Ubuntu archive in CI

## Context

The TikZ writer must produce text that compiles, not only text that equals a
snapshot: a snapshot cannot tell a misplaced brace from a correct one. The
golden figures are complete LuaLaTeX documents (`standalone` class,
`fontspec` with DejaVu Sans for the `♩` glyph, TikZ with `arrows.meta`), so
the check needs `lualatex`, those packages and the font. This is a test tool;
nothing of it reaches the packages or the wheel.

## Considered options

- **TeX Live from the Ubuntu 24.04 archive** (`texlive-luatex`,
  `texlive-latex-recommended`, `texlive-latex-extra`, `texlive-pictures`,
  `fonts-dejavu-core`), installed with `apt-get` in a separate CI job.
- **A third-party GitHub action installing TeX Live** (for example
  `teatimeguest/setup-texlive-action`): faster with its cache, but a further
  supply-chain dependency with write access to the job's environment.
- **Tectonic**: a single binary that downloads packages on demand, so the
  job would depend on its bundle server at run time; its XeTeX engine is not
  the LuaLaTeX the figures declare.
- **Write it ourselves**: not possible; only a TeX engine can tell whether a
  TikZ document compiles.

## Decision

Install TeX Live from the Ubuntu archive in a CI job of its own, `tikz`,
which runs the compile test of the writers with `TILIE_REQUIRE_LUALATEX=1`,
so a missing `lualatex` fails it. On a machine without TeX the test is
skipped with that reason; everywhere else it compiles every golden figure.

## Maintenance and dependencies

The packages are those of TeX Live 2023 as packaged by Debian and Ubuntu
(LPPL and GPL-compatible licences, maintained by the Debian TeX
maintainers, security updates through the Ubuntu archive); DejaVu Sans is
`fonts-dejavu-core` (Bitstream Vera licence). The archive pins the versions
per Ubuntu release, so the job changes only when the runner's Ubuntu
release does. The installation takes a few minutes and several hundred
megabytes, which is why it is a job of its own.

Primary sources: <https://packages.ubuntu.com/noble/texlive-luatex>,
<https://packages.ubuntu.com/noble/texlive-latex-extra>,
<https://packages.ubuntu.com/noble/fonts-dejavu-core>,
<https://ctan.org/pkg/standalone>, <https://ctan.org/pkg/pgf>.

## Consequences

The figures are proven to compile on every push. Exit cost: one job; any
other TeX distribution with LuaLaTeX, `standalone`, `fontspec`, TikZ and
DejaVu Sans replaces it without touching the tests.

## Review date

2027-04-10.
