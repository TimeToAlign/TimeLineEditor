---
status: accepted
date: 2026-10-12
---

# Check accessibility of the running editor with axe-core

## Context

The canvas is keyboard-operable and exposes nodes as focusable groups with
labels; the editor's panes carry buttons, toolbars and live regions. Svelte's
compiler warnings (checked by `svelte-check --fail-on-warnings`) catch static
mistakes in templates, but not the rendered page: roles and names produced
at runtime by Svelte Flow, colour contrast, duplicate ids, or ARIA attributes
that refer to missing elements. The end-to-end suite (decision 0021) already
renders the real page in three engines, so an automated audit belongs there.

## Considered options

- `@axe-core/playwright` 4.13.0 with `axe-core` 4.13.0 (Deque), MPL-2.0: runs
  the axe rules inside a Playwright page and returns structured violations.
- Pa11y 10.0.0: a CLI around axe or HTML_CodeSniffer driving its own
  Puppeteer, a second browser automation stack beside Playwright.
- Lighthouse 13.5.0: its accessibility category is a subset of axe rules,
  Chromium only, with a much larger dependency graph.
- Write it ourselves: a hand-written list of checks would reproduce a
  fraction of axe's rules and none of its maintenance against WCAG updates.

Scores run from 1 (least suitable) to 5 (most suitable).

| Criterion | axe-core for Playwright | Pa11y | Lighthouse | Own code |
| --- | ---: | ---: | ---: | ---: |
| Maintenance cost | 5 | 3 | 4 | 1 |
| Size and transitive dependencies | 4 | 2 | 1 | 5 |
| Licence | 4 | 4 | 5 | 5 |
| Fit (inside the existing Playwright pages, all engines) | 5 | 2 | 2 | 1 |
| Exit cost | 4 | 3 | 3 | 5 |
| **Total** | **22** | **14** | **15** | **17** |

## Decision

Use `@axe-core/playwright` 4.13.0 (pinned exactly; it depends on `axe-core`
`~4.13.0`, locked at 4.13.0, and takes `playwright-core` as a peer). The
end-to-end specs build an `AxeBuilder` on the page and require an empty
violation list. A rule is disabled only with a comment naming the element and
the reason; a failing rule is otherwise fixed in the editor.

## Maintenance and dependencies

Both packages are published by Deque Systems (publishers include Wilco Fiers
and Dylan Barrell) and are the reference implementation behind many browser
accessibility tools. `axe-core` releases a minor version every few months
with rule updates; the Playwright integration follows it with the same
version number (540 published versions since 2021-06-02, together with the
other framework integrations of the same repository).

MPL-2.0 is a file-level copyleft: it applies to modifications of the
package's own files, which this project does not make, and it is used here
only as a development dependency that never reaches the built editor.

Registry metadata checked on 2026-10-12 (unpacked bytes):

| Package | Release | Licence | Size (bytes) | Dependencies |
| --- | --- | --- | ---: | --- |
| `@axe-core/playwright` 4.13.0 | 2026-08-11 | MPL-2.0 | 47,180 | `axe-core ~4.13.0`; peer `playwright-core >=1.0.0` |
| `axe-core` 4.13.0 | 2026-08-05 | MPL-2.0 | 3,113,323 | none |

Primary sources: <https://registry.npmjs.org/@axe-core/playwright>,
<https://registry.npmjs.org/axe-core>,
<https://github.com/dequelabs/axe-core-npm>,
<https://github.com/dequelabs/axe-core>,
<https://github.com/dequelabs/axe-core/blob/develop/LICENSE>,
<https://playwright.dev/docs/accessibility-testing>.

## Consequences

Accessibility regressions on the rendered page fail the end-to-end run in
every engine. axe finds only what can be detected automatically; keyboard
operation is tested by explicit specs, and screen-reader behaviour still
needs manual review. Exit cost: the calls to `AxeBuilder` in the specs.

## Review date

2027-04-12, or with the next `axe-core` minor version.
