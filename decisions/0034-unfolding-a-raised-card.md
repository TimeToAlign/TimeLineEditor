---
status: accepted
date: 2026-11-22
---

# Unfold a raised ancestor card from its member card by one tweened progress

## Context

A group member that is a child timeline is drawn in its member card with
the faded lines of its ancestors, and its root is drawn whole in an
ancestor card behind the group's frame (TimeToShare's drawing
specification, section 8.8). When the root's timeline editor opens, the
canvas raises that ancestor card over the frame; when it closes, the card
falls back behind the frame. Raising changes only the order the block
shows its drawing in (`stackingOf`, `raisedEntries`); the drawing itself
is the same. The member card and the raised card draw the same timelines
at different ordinates: the raised card's root line lies on the member
card's ancestor line of it, so the member's own row and every timeline
between lie some units off their rows in the member card, more with
conversion maps or bands between. Rows of the raised card that the member
card does not draw (siblings, the root's bands beyond the member) appear
with it, and rows the member card alone draws (the member's marks on its
ancestor lines) go.

The switch is abrupt: the user does not see that the raised card is the
member card's own timelines, laid out at the root's proportions. The
raise should read as one card unfolding into the other, and the close as
the same motion backwards.

The requirements:

1. **Rows travel**: each row of the raised card starts where the member
   card draws the same timeline and moves to its own place; a row the
   member card does not draw unfolds out of the gap between its
   neighbours and blends in; what the member card alone draws blends out.
   The card opens left and right from the member card's rectangle to its
   own.
2. **The layout's geometry**: the motion is read from what layout records
   (each drawn line's card and ordinate, each box's rectangle and range),
   never from offsets written in the canvas, so it follows any layout.
3. **Interruption**: closing during the opening reverses from where the
   motion stands, and the reverse takes the time the distance left needs.
4. **Reduced motion**: under `prefers-reduced-motion: reduce` the card
   switches at once.
5. **Input**: the canvas never waits for a motion; what the pointer reads
   is the drawing at rest.
6. **Reuse**: one small module, its pure part testable without a DOM.

## Considered options

- **FLIP over the drawn elements** (Svelte's `animate:` and the arranger's
  own `slide`, measuring each element's screen rectangle before and after
  an update): FLIP moves one element from where it was to where it is. The
  raise moves no element: the raised card's elements never were in the
  member card, whose own elements stay where they are. The pairing is by
  timeline, between two different sets of elements, so there is nothing
  for FLIP to measure.
- **Svelte transitions** (`in:`, `out:`, `transition:`): they run when an
  element enters or leaves the DOM. The raised card's elements are drawn
  before, during and after the raise; only their layer changes.
- **Web Animations on each element** (as the arranger's `settle` moves a
  dropped card's copy): each element would need its own keyframes, and a
  reversal would read every animation's current time. Animating a clip
  rectangle's `x`, `y`, `width` and `height` needs them as CSS properties
  of an SVG `rect`, which the engines do not support alike.
- **Interpolating between two drawings by one progress value**: a pure
  function pairs the member card's rows with the raised card's by timeline
  ID and gives, for a progress `t` from 0 (the member card's places) to 1
  (the drawing at rest), each element's vertical shift and opacity and the
  clip rectangle. One reactive number drives `t`; the block node writes
  the results as SVG attributes (`transform`, `opacity`, a `clipPath`),
  which every engine draws alike. Reversal is that number set back to 0:
  it starts from its current value.
- **Svelte's `Tween` or `Spring`** (`svelte/motion`) to drive `t`: a
  `Tween` does what is needed, but loading `svelte/motion` makes its
  `prefersReducedMotion` media query at once, so every module loading it
  needs a `matchMedia` before it is imported, which the canvas's component
  tests give the page only when they mount it; the canvas already reads
  reduced motion from a `MediaQuery` it makes when it mounts. A `Spring`
  would also overshoot the rows past their places and has no fixed
  duration. The number is driven by `requestAnimationFrame` in a few
  lines instead, eased by `svelte/easing`'s `cubicInOut`.

## Decision

Interpolate between the two drawings by one tweened progress, with no new
dependency:

- `app/packages/arranger/src/animation/unfold.ts`, pure and independent of
  TiLiE's drawing: `pairRows(from, to)` pairs two lists of rows by key and
  gives each row of `to` its shift `from − to` (a row `from` lacks takes
  the shift interpolated between its paired neighbours by its ordinate, the
  nearest one's beyond them, and enters); `frameAt(motion, t)` (shift ×
  (1 − t), opacity 1 for a paired row and `t` for an entering one or for
  an element of no row); `rectAt(from, to, t)`; `durationOf(from, to,
  reduced)` (`UNFOLD_DURATION` 400 ms for the whole way, in proportion for
  a part of it, 0 under reduced motion); easing `cubicInOut` (`UNFOLD_EASING`).
- `app/packages/arranger/src/animation/raise.ts`, the canvas's reading:
  `raiseUnfold(manifest, drawing, card, measure)` takes the rows of the
  member card the ancestor card is aligned to (`DrawnBox.ancestor`) and of
  the ancestor card from layout's `lineAxes`, the clip's start from the
  member card's rectangle and its end from the bounds of everything the
  ancestor card draws, and gives each element of the card's range the
  motion of the timeline it belongs to (core's `indexOf(…).owners`); the
  card's rectangle and shadow belong to no row and blend in, so the member
  card beneath blends out.
- `app/packages/arranger/src/animation/unfolding.svelte.ts`, the binding:
  `class Unfolding(raised, reduced)` follows the raised root, holds the
  root folding back until its progress reaches 0, unfolds a newly raised
  root from 0 and reverses from the current value; its progress is a
  `$state` number moved over animation frames (`requestAnimationFrame`,
  `performance.now()`), stopped when the block node is destroyed.
- `BlockNode.svelte` draws each raised card in its own layer
  (`g.tilie-raised`), clipped and shifted while it moves, letting the
  pointer through while it moves. The canvas's hit tests, marks and
  commands read the stacking of the open editor at once
  (`raisedRoot`), never the motion.

A switch from one raised root to another unfolds the new one from 0 and
drops the old one at once.

## Maintenance and dependencies

No dependency: `cubicInOut` is Svelte's own (`svelte/easing`, 5.57.1,
the version the lockfile holds). The pure modules are tested with exact
values (`tests/unfold.test.ts`), the binding under Vitest's fake timers,
which fake `requestAnimationFrame` and `performance.now`
(`tests/unfolding.svelte.test.ts`); the end-to-end spec
`ancestor-cards.spec.ts` asserts the states at rest before and after the
editor is open, the first state of a raise and that it moved, and the
plain switch under reduced motion. Review the choice of the progress if
`svelte/motion` stops making its media query at load, by 2027-05-22.
Another motion of the canvas between two drawings reuses `unfold.ts` with
its own reading of the records.

Primary sources:
<https://svelte.dev/docs/svelte/svelte-motion>,
<https://svelte.dev/docs/svelte/svelte-animate>,
<https://www.w3.org/TR/SVG2/masking.html#ClipPathElement>,
<https://www.w3.org/TR/css-masking-1/#the-clip-path>.
