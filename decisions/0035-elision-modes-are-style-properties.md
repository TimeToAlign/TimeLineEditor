---
status: accepted
date: 2026-11-23
---

# Elision modes are style properties; group elisions belong to the frame

## Context

An elision leaves a stretch of one timeline out of a drawing: every row
crossing the stretch stops at its start and resumes at its end, with a
narrow gap between holding one ellipsis (TimeToShare's drawing
specification, sections 2 and 8.9). A manifest stores its elisions in its
`graphical` object, each on one timeline. A root is drawn whole in up to
several cards: its own card when it is in no group, and an ancestor card
behind the frame of every group one of its descendants is a member of
(section 8.8). For those cards the editor lets the user choose what is
elided: nothing, the stored elisions, or gaps an ancestor card derives by
itself around its member, at a proportion and on rows the user may set.

Two questions follow. Where does that choice live? And where is an
elision drawn whose timeline lies in a group, that is a member or a
member's descendant, which its member card draws but which the frame's
other member cards share an axis with?

The requirements:

1. **The manifest draws what the editor shows**: an export, and any other
   implementation of the drawing specification, draws the elisions the
   user chose. A manifest holds musical time and its graphics; settings of
   the workspace and of the viewer change nothing drawn.
2. **One choice per root**: every card of a root shares one address
   (`{id: R, part: ["card"]}`), so a statement about the root's cards
   reaches all of them; a stored elision of the root must not be drawn on
   one of its cards and ignored on another for a reason the user cannot
   see.
3. **Switching loses nothing**: the stored elisions stay while another
   choice is drawn, and return with it.
4. **One command per switch**, undone in one step, through the four
   commands only.
5. **A frame keeps one axis**: the member cards of a frame convert
   linearly between their shared start and end (TimeToShare's README,
   "Groups and the `graphical` object"); an elision drawn in one member
   card alone would break that.

## Considered options

- **A workspace setting** per block or per root: the choice would stay in
  the workspace file, so an exported manifest would draw differently from
  the canvas and another program could not reproduce it (1).
- **A member of the manifest beside the elisions** (a mode on a timeline,
  or a flag on each elision): a new schema key for what the drawing does,
  read by no rule of the cascade; a choice of "the gaps the card derives"
  would have no stored object to hang on, and switching would rewrite or
  delete stored elisions (3).
- **Properties of the style cascade** on the cards: four properties,
  `elision-mode` (`auto`, `full`, `proportional`, `custom`),
  `elision-proportion`, `elision-depths` and `elision-display`, never
  inherited, set by one rule on the root's card address, the rule that
  already carries the `display` hiding its ancestor cards. The cascade
  already gives layers (the specification's defaults, the workspace's
  rules, the manifest's own), rule ranks and named styles; the manifest
  carries the rule, so an export draws it (1); the address reaches every
  card of the root (2); the stored elisions are untouched by a switch (3);
  a switch is one `style` (4).
- **The same properties chosen per card**: the cards of a root have no
  address of their own by design, and one card drawing a root's stored
  elisions while another derives its own would contradict (2).

For an elision whose timeline lies in a group:

- **Drawn in the member card alone**: breaks the frame's shared axis (5).
- **Marked as a group's elision in the manifest**: a stored fact that the
  timeline already states; a timeline lies in a group exactly when a
  groupstamp on it would cross the frame, so the marker could only
  disagree with it.
- **Held by the frame**: read from the timeline, never stored, an elision
  whose timeline lies in a group is that group's. It is drawn across the
  frame, at one place in every member card, with one width for all of
  them, the frame drawn shorter by its gaps, and carried into the ancestor
  cards behind the frame over their member's span. The frame reads
  `elision-mode` as an ungrouped root's card does, from a rule on its own
  address `{id: G}`.

## Decision

Elision modes are style properties, and group elisions belong to the
frame:

- The drawing specification defines the four properties, their initial
  values (`auto` for the first three, `ellipsis name` for
  `elision-display`) and what each
  container reads (section 2.4): `elision-mode` by a card, an ancestor
  card and a frame, the other three by a card and an ancestor card.
  `auto` draws the stored card elisions where the root's tree holds any
  and the derived gaps otherwise, so a manifest storing elisions draws
  them without a rule.
- A group elision is never counted for `auto` and never switched by a
  card's mode: an ancestor card carries the frame's gaps in every mode. A
  root that is itself a member of a group has only group elisions, so the
  editor offers Custom on none of its cards and says why.
- Hidden is the rule's `display: none`, apart from the mode, so hiding the
  ancestor cards keeps what they draw when they return.
- The editor writes every switch as one `style` of the root's rule or the
  frame's, and the switch from the derived gaps to Custom as one `add` of
  those gaps exactly as drawn; it reads what a mode resolves to, the
  proportion and every gap from layout's record of each container,
  `Drawing.elisions`, never from a drawing tried with a command applied.
- Core reads no cascade: it lists the stored elisions (`elisionsOn`,
  `elisionsUnder`, `groupElisions`) and every timeline a card may derive
  gaps on (`defaultElisionTimelines`), where the addresses of derived gaps
  resolve.

## Consequences

- A derived gap's proportion may be `auto`, the largest at which the gaps
  fit beside the member's line and the card fits into the view centred on
  the frame: the one value of a drawing that reads the
  placement's `view`. Each canvas therefore draws at its own pane, settled
  after its size stops changing; a stated proportion makes the drawing
  independent of the view.
- A rule written by hand, or by the workspace's defaults, sets the modes
  of many roots at once, as any style rule does.
- No new command and no new schema key beyond the four properties; no
  dependency.

Review this decision if an application needs different elisions on two
cards of one root, by 2027-05-23.

Primary sources:
<https://github.com/TimeToAlign/TimeToShare/blob/main/docs/drawing.md>
(sections 2, 2.4, 8.8 and 8.9).
