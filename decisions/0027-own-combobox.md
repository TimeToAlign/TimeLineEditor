---
status: accepted
date: 2026-11-19
---

# Write the editor's combobox ourselves, after the WAI-ARIA pattern

## Context

The inspector's Metadata tab composes a statement from three fields (a
verb, a vocabulary, a value), each a text field with a list of options:
options filtered from a fixed list as the user types, or found by a search
that runs while the user types and answers later. The WAI-ARIA Authoring
Practices name this widget a combobox and describe its keys, roles and
states in the "Combobox Pattern"; its example "Editable Combobox With List
Autocomplete" is the variant needed: the options are suggestions for the
typed text, typing never selects one, and the focus stays in the text field
while the active option is named through `aria-activedescendant`.

The editor has no combobox, and no component library: every control of the
header, the dialogs and the inspector is a native element or a Svelte
component of this repository, and the editor's runtime dependencies are
Svelte, the schema package, the canvas packages of this repository and two
text codecs.

The requirements:

1. **The pattern**: the roles, states and keys of the APG example, with the
   list's state announced in a live region ("3 results", "Searching…").
2. **The drawer**: the list opens below its field inside the inspector
   drawer, which scrolls; no portal to the end of the document, so the list
   stays in the drawer's stacking context, its theme and its focus order,
   and an embedding host page sees no element outside the editor's own.
3. **Asynchronous options**: the options and a loading flag come from the
   component's user; a search's results arriving after a key press must not
   be picked by mistake.
4. **Svelte 5**: runes, snippets for an option's content, typed generically
   over the option.
5. **Small and replaceable**: no package that brings more than the one
   widget, and a way out that touches the three fields alone.

## Considered options

Versions and sizes are the npm registry's on 2026-11-19. A version enters
the lockfile only 14 days after its release, so the admissible version is
named where the latest is younger.

| Option | Version | Unpacked | Runtime dependencies |
| --- | --- | ---: | --- |
| Bits UI | 2.21.0 (2026-11-11; admissible 2.20.6) | 1,991,117 bytes | `@floating-ui/dom`, `@floating-ui/core`, `runed`, `svelte-toolbelt`, `tabbable`, `esm-env`; peer `@internationalized/date` |
| Melt (`melt`, the Svelte 5 rewrite of Melt UI) | 0.44.0 (2026-01-04) | 387,419 bytes | `@floating-ui/dom`, `focus-trap`, `dequal`, `runed`, `jest-axe` |
| Zag (`@zag-js/combobox` with `@zag-js/svelte`, the machines under Ark UI) | 1.48.0 (2026-11-13; admissible 1.47.0) | 151,958 + 25,324 bytes | `@zag-js/core`, `types`, `utils`, `popper` (over `@floating-ui/dom`), `anatomy`, `dom-query`, `collection`, `dismissable`, `live-region`, `focus-visible` |
| Ark UI for Svelte | 5.25.1 (2026-11-02) | 1,457,249 bytes | every Zag machine of the library, the combobox among them |
| Writing it | none | 355 lines (`Combobox.svelte` 265, `keys.ts` 90) | none |

- **Bits UI**: Svelte 5 headless components, maintained and released often.
  Its combobox is a family of parts (root, input, trigger, content, items,
  groups) positioned by Floating UI, with an optional portal and its own
  layers for dismissal, focus scope and text selection. It fits the
  pattern, but it brings six packages and a calendar peer for one widget,
  and its parts set the markup, so the drawer's styles and tests would
  follow its structure rather than the APG's. Leaving it means rewriting
  the three fields.
- **Melt**: builders that spread attributes on the user's own elements,
  which keeps the markup ours. The Svelte 5 rewrite is still before 1.0
  (0.44.0, ten months without a release) and lists a test library,
  `jest-axe`, among its runtime dependencies; Melt UI 0.86.6 is the Svelte 3
  and 4 line. An API before 1.0 may change under every update.
- **Zag, or Ark UI over it**: framework-independent state machines with a
  thin Svelte adapter; the combobox machine is careful about the pattern and
  announces through its own live region. It carries ten packages of its own
  machinery (state charts, DOM queries, dismissal, a popper over Floating
  UI) for one widget, its machine owns the open state and the active item,
  so asynchronous options pass through its collection API, and Ark UI
  would add every other machine of the library.
- **Writing it**: one component and one pure module. The APG example is
  short and fully specified: the key table fits on a page and is tested
  row by row without a DOM; the component is the attributes and the
  pointer rules around it. Positioning is a CSS rule inside the drawer, so
  no floating library is needed. The cost is ours: a change of the pattern
  or a browser quirk is fixed here.

Scores run from 1 (least suitable) to 5 (most suitable).

| Criterion | Bits UI | Melt | Zag | Ark UI | Own |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fit (the pattern, the drawer, asynchronous options) | 4 | 4 | 4 | 3 | 5 |
| Maintenance cost | 3 | 2 | 3 | 3 | 4 |
| Size | 2 | 3 | 3 | 1 | 5 |
| Exit cost | 2 | 3 | 3 | 2 | 5 |
| The repository's practice (no component library) | 2 | 3 | 3 | 1 | 5 |
| **Total** | **13** | **15** | **16** | **10** | **24** |

## Decision

Write the combobox in the editor: `app/packages/editor/src/combobox/`,
`Combobox.svelte` over the pure key table `keys.ts`, after the APG example
"Editable Combobox With List Autocomplete" (`aria-autocomplete="list"`, no
automatic selection). The field keeps the focus; the listbox holds the
options alone, a message for an empty result lies beside it, and a
visually hidden status region announces the count or a running search. An
option is picked on the primary button's `pointerup`, and the press in the
list is cancelled so that the field keeps the focus. The options, the
loading flag and the text are the user's: a search is driven through a
function binding of the text, and an active option that a shrinking list
no longer holds counts as none. No package is added.

## Maintenance and dependencies

No dependency. The key table is tested exhaustively for 0, 1 and 3
options, closed and open; the component's attributes, focus, pointer
rules, announcements and paste are tested in jsdom.

Primary sources:
<https://www.w3.org/WAI/ARIA/apg/patterns/combobox/>,
<https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/>,
<https://www.npmjs.com/package/bits-ui>,
<https://www.npmjs.com/package/melt>,
<https://www.npmjs.com/package/@zag-js/combobox>,
<https://www.npmjs.com/package/@ark-ui/svelte>.

## Consequences

The three fields of the Metadata tab and any later field with suggestions
share one component whose markup and keys are the pattern's and this
repository's. A fix of the pattern's behaviour is ours to make; the key
table's tests say what each key does. Exit cost: the three fields' markup,
if a library ever replaces the component.

## Review date

2027-05-20, or when the WAI-ARIA Authoring Practices change the combobox
pattern.
