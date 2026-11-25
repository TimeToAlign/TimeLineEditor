---
status: accepted
date: 2026-11-25
---

# Build the documentation site with Sphinx, MyST and TypeDoc

## Context

The repository's documentation is Markdown: the README, `docs/architecture.md`,
`docs/developing.md`, CONTRIBUTING, the changelog and the decision records in
this folder. The code carries more: Google-style docstrings in the server's
Python package and doc comments on the exported functions, classes and types
of the app's six TypeScript packages. None of it is published as a site.

A documentation site for this repository needs:

1. **Both languages.** The Python API of `tilie_server` and the TypeScript API
   of the pnpm workspace in `app/`, one section per package, built from the
   comments in the code, beside the Markdown pages.
2. **The Markdown as it is.** The existing pages are written for GitHub; the
   site includes them without copying or rewriting their text, and their
   links between each other keep working on the site.
3. **One stack with the sibling repositories.** The TimeToShare schema
   repository and the timetoalign library publish sites of the same kind,
   from one publishing setup with a version menu; a site is plain HTML with
   relative links, servable from any path.
4. **Built locally with one command**, checked strictly (a broken reference
   fails the build), with dependencies under this repository's dependency
   policy: development tools pinned, lockfiles, the fourteen-day window.

## Considered options

- **Sphinx** with the PyData theme, MyST for Markdown, autodoc and napoleon
  for the Python API, and TypeDoc with typedoc-plugin-markdown writing the
  TypeScript API as Markdown pages that Sphinx reads.
- **Sphinx with sphinx-js** (5.0.3, the pyodide project's) for the
  TypeScript API instead of the Markdown plugin: TypeScript objects as Sphinx
  objects, placed by directives. Tried on this code base: the build crashed
  inside TypeDoc on core and arranger together (`RangeError: Maximum call
  stack size exceeded`), and on the client package alone it took over three
  minutes and then could not find the module it was asked to document. It
  passes `--entryPointStrategy expand` itself, so TypeDoc's `packages`
  strategy, which converts each workspace package with its own `tsconfig.json`,
  cannot be used, and it fetches `tsx` through `npx` at build time, outside
  the lockfile. Every module would also need a directive of its own.
- **Doxygen.** No TypeScript support; Python docstrings are not rendered as
  Google-style sections.
- **Quarto.** Set aside for these repositories in favour of one Sphinx stack
  for all three; it has no TypeScript API generator either.
- **Zensical** (the successor of Material for MkDocs, with mkdocstrings for
  Python): young, its plugin ecosystem in transition, and Material for MkDocs
  itself in maintenance mode; no TypeScript API generator of its own.
- **TypeDoc's own HTML site** for the TypeScript part beside a separate Python
  site: two sites, two navigations, two themes, and the Markdown pages in
  neither.
- **Write it ourselves**: a generator reading TypeScript doc comments is a
  TypeScript compiler client of its own (generics, re-exports, overloads);
  its maintenance is out of proportion to a documentation site.

Scores run from 1 (least suitable) to 5 (most suitable).

| Criterion | Sphinx + TypeDoc Markdown | Sphinx + sphinx-js | Doxygen | Zensical | Own code |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fit (both languages, Markdown as is, strict build) | 5 | 2 | 1 | 3 | 3 |
| Maintenance cost | 4 | 2 | 3 | 3 | 1 |
| Size and transitive dependencies | 3 | 3 | 4 | 3 | 5 |
| Licence | 5 | 5 | 5 | 5 | 5 |
| Exit cost | 4 | 3 | 4 | 4 | 5 |
| **Total** | **21** | **15** | **17** | **18** | **19** |

## Decision

The first option. The site's source is `docs/`, its configuration
`docs/conf.py`, its build `docs/_build/html` (`docs/README.md` names the
command):

- **Python** (`server/pyproject.toml`, dependency group `docs`, pinned):
  `sphinx` 9.0.4, `pydata-sphinx-theme` 0.24.0, `myst-parser` 5.1.0, the
  versions the TimeToShare site pins, so that the sites of the sibling
  repositories look and behave alike. Sphinx 9.0.4 is the last release that
  runs on Python 3.11, the server's lowest version; 9.1 needs 3.12. The theme
  0.24.0 is younger than the lockfile's global release-age date and has an
  entry of its own in `[tool.uv] exclude-newer-package`. Sphinx's own
  `autodoc`, `autosummary` (one page per module, written at build time),
  `intersphinx` (Python, NumPy, PyArrow) and `viewcode`, and napoleon's
  Google-style reader.
- **npm** (`app/package.json`, devDependencies of the workspace root, pinned):
  `typedoc` 0.28.20 and `typedoc-plugin-markdown` 4.14.1. `docs/typedoc.json`
  converts each package with the `packages` strategy, every module under its
  `src/` (`.ts` and `.svelte.ts`; declaration files, tests and Svelte
  components left out), and writes one Markdown page per module into
  `docs/api-ts/`. TypeDoc treats its warnings as errors, a broken `{@link}`
  among them, so they fail the build. It runs with `skipErrorChecking`: each package's
  `tsconfig.json` also covers its tests, which import named types from Svelte
  components that only `svelte-check` resolves; type checking is the
  `typecheck` script's task.
- The configuration runs TypeDoc when the build starts, aligns the anchors of
  its pages with MyST's (the plugin numbers repeated headings differently),
  and writes a page per decision record that includes the record. Links in
  the included files that lead to other repository files are pointed, while
  the files are read, at the page that shows the linked file, or at the file
  on GitHub; no text is changed on disk.
- Napoleon's reader is called directly, not through its extension, and reads
  every docstring but a constant's or an attribute's, which in this code base
  is a sentence, its type being its annotation.
- The navigation sidebar shows only the branch of the current page, two levels
  deep: it is repeated on every page, and with all modules of the six
  packages in it, it made up more than half of each TypeScript page.

## Maintenance and dependencies

- **Sphinx** is maintained by the Sphinx organisation on GitHub (a team of
  maintainers, releases since 2008); its newest release, 9.2.0, came out on
  2026-10-21. BSD-2-Clause.
- **pydata-sphinx-theme** is maintained by the PyData community (the theme of
  NumPy, pandas and SciPy, among others); 0.24.0, the newest release, came
  out on 2026-11-02. BSD-3-Clause.
- **MyST-Parser** is maintained by the Executable Books project; its newest
  release, 5.2.0, came out on 2026-11-10. MIT.
- **TypeDoc** has five maintainers on npm and a release history since 2014;
  0.28.20 (2026-07-05) is the last 0.28 release, a 1.0 line is in
  prerelease. It supports TypeScript up to 6.0, the version of this workspace.
  Apache-2.0.
- **typedoc-plugin-markdown** has one maintainer on npm (Thomas Grey) and a
  release history since 2017, following each TypeDoc line; 4.14.1 was
  released on 2026-10-19 and requires TypeDoc 0.28. A single maintainer is a
  bus-factor risk; the exit is TypeDoc's own HTML output, linked from the site.

Registry metadata checked on 2026-11-25 (audited versions, wheel or unpacked
bytes):

| Package | Release | Licence | Size (bytes) | New transitive packages |
| --- | --- | --- | ---: | --- |
| `sphinx` 9.0.4 | 2025-12-04 | BSD-2-Clause | 3,917,713 | 24 Python packages in all three, among them `docutils`, `jinja2`, `babel`, `requests` |
| `pydata-sphinx-theme` 0.24.0 | 2026-11-02 | BSD-3-Clause | 3,217,864 | `beautifulsoup4`, `accessible-pygments` |
| `myst-parser` 5.1.0 | 2026-05-13 | MIT | 85,817 | `markdown-it-py`, `mdit-py-plugins` |
| `typedoc` 0.28.20 | 2026-07-05 | Apache-2.0 | 2,180,489 | 18 npm packages in both, among them `markdown-it`, `lunr`, `minimatch`, `@gerrit0/mini-shiki` |
| `typedoc-plugin-markdown` 4.14.1 | 2026-10-19 | MIT | 396,953 | none |

None of these reaches the wheel or the editor bundle: the Python packages are
in a dependency group the wheel does not declare, the npm packages in the
devDependencies of the private workspace root.

Primary sources: <https://pypi.org/project/Sphinx/>,
<https://www.sphinx-doc.org/>, <https://pypi.org/project/pydata-sphinx-theme/>,
<https://pydata-sphinx-theme.readthedocs.io/>,
<https://pypi.org/project/myst-parser/>, <https://myst-parser.readthedocs.io/>,
<https://registry.npmjs.org/typedoc>, <https://typedoc.org/>,
<https://registry.npmjs.org/typedoc-plugin-markdown>,
<https://typedoc-plugin-markdown.org/>, <https://pypi.org/project/sphinx-js/>,
<https://github.com/pyodide/sphinx-js>.

## Consequences

The site documents the Python API from docstrings and the TypeScript API from
doc comments; a doc comment is now published text, and a broken reference in
either fails the strict build. The TypeScript pages are Markdown, so they
take Sphinx's navigation, search and theme, but TypeScript objects are not
Sphinx objects: a Python page cannot cross-reference a TypeScript symbol.
Svelte components are not documented. Building the site needs the installed
app workspace (`pnpm install`) and the server's `docs` group (`uv sync
--group docs`). Exit cost: `docs/conf.py`, `docs/typedoc.json` and the
`docs` group; the pages are Markdown any other generator reads.

## Review date

2027-05-25, or when TypeDoc 1.0 is released.
