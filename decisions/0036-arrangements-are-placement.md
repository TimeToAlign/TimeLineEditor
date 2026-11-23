---
status: accepted
date: 2026-11-23
---

# Arrangements are placement; a root drawn once along the row

## Context

The arranger places blocks freely on the canvas, and the bundle editor
places a block's items, its groups' frames and its ungrouped roots' cards,
freely in the block. Two needs go beyond free places: blocks lined up
without placing each by hand, and a bundle's groups read along a timeline
they share. The second is the common case of a bundle: the movements of a
score, or the takes of a session, are children of one root, each a member
of its own group beside the timelines aligned to it. Each such root is
drawn whole as an ancestor card behind each group's frame (TimeToShare's
drawing specification, section 8.8), so groups one under another draw the
same root once per group, each copy at the scale of its own frame.

Two questions follow. Where does an arrangement live? And when groups
stand side by side, how is a root several of them hang on drawn?

The requirements:

1. **A manifest knows nothing about where it is shown** (the three layers
   of [`AGENTS.md`](../AGENTS.md)): it holds musical time and its
   graphics, never a canvas's layout.
2. **The canvas draws what an export draws**: the drawing specification
   defines every input of a drawing, so another program given the same
   inputs draws the same.
3. **One command per change**, undone in one step, through the four
   commands only.
4. **Proportions are kept**: under a group's frame a root is drawn at that
   frame's scale, and wherever the scale changes the drawing shows it.
5. **Predictable**: what is drawn follows from the rules and from orders
   the user chose, never from an order the user cannot see; where the
   rules cannot hold, the user is told why.
6. **Switching loses nothing**: an item's stated place survives an
   arrangement and returns when the block is free again.

## Considered options

Where an arrangement lives:

- **A key of the manifest**, in its `graphical` object: a manifest would
  carry where its items stand on one canvas (1), and two blocks of one
  manifest could not be arranged apart.
- **A workspace setting**, outside the journal: an arrangement changes
  what is drawn, so it would escape undo (3), and a script drawing the
  block from its manifest and placement would not reproduce it (2).
- **A member of the placement**, the drawing's input that already holds
  the stated places (`places`): `arrangement` beside it, stored with the
  block and set by a journalled `set`; the blocks' own arrangement a
  member of the workspace, set the same way.

How a shared root is drawn side by side:

- **Each group keeps its own ancestor card**, as one under another: the
  root drawn once per group, the copies side by side at different scales,
  so no line reads the shared timeline across the groups.
- **Partial**: groups whose order along a root conflicts keep their own
  copy, the others share one. Which group keeps a copy depends on an order
  of the groups the user never chose (5).
- **Free places, the root stretched between them**: the stretches of the
  root outside the frames would be drawn at scales the frames do not
  show, and moving a group would stretch the root (4).
- **One row, the root drawn once**: the groups in one row, every root they
  hang on drawn once behind it, the root at each group's frame's scale
  over that group and changing scale only between two groups, in a gap
  that leaves out what the room cannot show, or at a seam where nothing
  needs leaving out; where no row satisfies the rules, horizontal is
  refused with the reason.

## Decision

Arrangements are placement, and a root that groups hang on is drawn once
along the row:

- A block's `arrangement` is a member of its placement (the drawing
  specification's section 1): `null`, or `{direction, order}`, `vertical`
  or `horizontal`, `order` the IDs of its groups and ungrouped roots. The
  workspace's `arrangement` of its blocks is `null` or `{direction,
  columns?}`, `vertical`, `horizontal` or `matrix`, packed in the blocks'
  order. Each is one `set`; an arranged content keeps its stated place and
  does not use it.
- Side by side, a group **hangs on** a root when one of its members lies
  inside it; its first such member anchors it there, over that member's
  stretch on the root. Along every root the stretches follow the row
  without overlapping, and in every group the anchors lie in the order of
  their roots. Core decides the row and the roots' order from these rules
  (`rowOf`), keeping the order given wherever they leave it free, and
  stores a horizontal arrangement as its row; one the rules refuse is
  refused (`arrangement_conflict`) with the conflict's reason. A stored
  horizontal arrangement that a later edit breaks is drawn one item under
  another, the drawing stating the conflict, and returns when the
  conflict is gone.
- Each root is drawn once, by its ancestor card behind the first group of
  the row hanging on it, the **once card**; its line is drawn in runs, one
  per anchor at that anchor's frame's scale, and between two anchors in a
  gap of whole units or, where none fits, at a **seam**, a jump of the
  axis that leaves out nothing and is no element of the drawing.
- Matrix arranges blocks only: in a block, ancestor cards reach past their
  frames and would cross their neighbours in a grid.
- In a group's editor, while its block stands side by side, the cards
  anchoring the group are pinned and a drop that would change an anchor is
  refused, so the roots' order stays what the groups make it.

## Consequences

- The workspace format kept its version: an absent arrangement is none,
  a file stating `null` is read as none and none is written, so every
  file written before keeps its bytes.
- A once card has one exposure: the editor lists the gaps the row cuts in
  it read-only, its stored card elisions between its first and last
  anchor are kept and not drawn, and its derived elisions take the least
  proportion of its groups.
- The specification's fixtures pin the drawing: the arranged bundle
  drawn horizontal is derived by hand, and a bundle whose groups overlap
  on their root, asked horizontal, draws as it does without an arrangement.
- No new command, no schema key and no dependency.

Review this decision if a bundle needs groups side by side along roots in
an order the rules refuse, by 2027-05-23.

Primary sources:
<https://github.com/TimeToAlign/TimeToShare/blob/main/docs/drawing.md>
(sections 1, 3.2, 8.5, 8.6 and 8.8).
