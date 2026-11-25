# Building these docs

This folder is the source of the documentation site: Sphinx with the PyData
theme, pages in Markdown read by MyST ([decisions/0039](../decisions/0039-sphinx-documentation-site.md)).
`architecture.md` and `developing.md` are pages of their own; the overview,
the changelog, the contributing guide and the decision records are the
repository's files, included by short pages here. The Python API is written
from the docstrings of `tilie_server` by autodoc, the TypeScript API from the
doc comments of the app's packages by TypeDoc with typedoc-plugin-markdown
(`typedoc.json`).

## Prerequisites

The installed app workspace and the server's `docs` dependency group, as in
the contributing guide's setup:

```sh
pnpm -C app install
cd server && uv sync --group docs
```

## Build

From the repository root:

```sh
uv run --project server --group docs sphinx-build -W --keep-going -n -d docs/_build/doctrees docs docs/_build/html
```

The site is written to `docs/_build/html`; open `index.html` there. Every link
inside the site is relative, so the folder can be served from any path.

The build first writes three folders of generated pages, all ignored by git:
`docs/api-ts/` (TypeDoc, run through `pnpm exec` in `app/`), `docs/api-py/`
(autosummary) and `docs/decisions/` (one page per decision record, each
including the record). They are written anew by every build.

Sphinx reuses the pages it has read when a build is run again; after a change
to `conf.py`, delete `docs/_build` first so that every page is read anew.
