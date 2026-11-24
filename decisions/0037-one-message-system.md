---
status: accepted
date: 2026-11-24
---

# One message system with three levels

## Context

The editor told the user things in two places with two looks. The canvas
had a status line at its bottom left, red text without a box, holding the
last refusal of a gesture, a key or a pick, cleared by the next command it
stored; beside it a grey box at its top centre said what Show matches
lacked ("No MatchClaim table loaded.", or a reason the host gave, such as
"Matches need a running tilie-server."). The editor had a message bar at
the top centre of the canvas: amber warnings kept until dismissed, blue
information dismissed after three seconds. The bar lay above the grey
box, so turning Show matches on without a server put its reason behind
any warning already shown, in a style no message had.

The requirements:

1. **One place, one look per level**: whatever tells the user something
   that happened appears in one list, and the user can tell its weight
   from its look and its words, never from where it appears.
2. **Nothing hides anything**: no message is drawn over another, whatever
   their levels and their order.
3. **Passing things pass**: a refusal of a gesture or a key and a note
   that something went well leave by themselves; what needs the user's
   attention stays until the user dismisses it.
4. **Never in the way**: a message takes no focus and blocks no editing.
5. **The package ladder holds**: the arranger's canvas knows nothing of the
   editor; it already reports through callbacks.

## Considered options

- **Keep the canvas status line, styled like the bar**: two places still,
  and a status line holds one text, so a second refusal replaces the
  first unseen (1).
- **Move the message store into a lower package** so the canvas posts
  directly: the arranger would hold editor state and choose levels for
  its host, against the ladder's rule that reusable domain behaviour and
  application state stay apart (5).
- **The canvas reports refusals through a callback; the editor holds the
  one store and the one bar**: the canvas says what it refused, the editor
  decides how it is shown.

What a message is, and what is not:

- A **message** reports something that happened: a refusal, a failure,
  a completed operation the user may otherwise not notice.
- **Inline validation** describes the field or the panel it sits beside
  (the refusals under a field of a dialog, the file dialog's notes, the
  problem lists of the inspector's panels, the Manifest tab's problems):
  it belongs to what is shown and stays there.
- **A standing state** says how something is set (a pressed toolbar
  button, a panel's status line such as a MatchClaim table's). A live
  region announcing a state change to screen readers alone (the canvas's
  pinned coordinate, the font's loading) is neither shown nor a message.
- The grey box of Show matches mixed the two: it said why nothing was
  drawn. Its standing half is the pressed button; its reason is a message.

## Decision

The editor has one message system:

- **Three levels.** *Information* reports what passes: a refusal of a
  gesture, a key or a pick on the canvas, a value copied, a size replaced
  by its minimum, a table loaded, matches that cannot be shown.
  A *warning* reports something the user must know although nothing
  failed: a file not opened because of what was picked, an address not
  read, autosave active elsewhere, a filter not changed. An *error*
  reports an operation that failed: a workspace, manifest, example or
  table that could not be opened, imported, loaded, restored or saved, a
  belief the server did not record, an autosave that does not work.
- **One place.** The message bar over the canvas lists every message,
  oldest first, each in its own card, one under another; a card never
  overlaps another, and a card leaving moves the later ones up. Every
  card names its level in words ("Info", "Warning", "Error") before its
  text and carries its level's colours: blue, amber, red.
- **How long.** Information leaves by itself after `INFO_DURATION_MS`
  (three seconds), the one constant, in the editor's message module.
  Information equal in text to information still shown replaces it, so a
  key refused again shows once, for three seconds from the last refusal.
  Warnings and errors stay until the user dismisses them; every card has
  a Dismiss button. No message is withdrawn by the code, since no cause of
  a warning or an error goes away by itself.
- **Accessibility.** Screen readers announce a live region reliably only
  when the region was in the document before its content changed. So the
  bar holds two regions from its first drawing on, visually hidden: one
  `role="status"` (polite) for information and one `role="alert"`
  (assertive) for warnings and errors. Each holds one line per message
  shown of its levels, the level's word and the text, so a message posted
  adds its line to a region already there, and one leaving removes only
  its own line. The cards carry no live role, so nothing is announced
  twice. No message moves the focus.
- **From the canvas.** The arranger's `Canvas` takes `onrefuse(text)` and
  calls it with every refusal: a command its store refused, an editor it
  could not open, a key, a drop or a pick refused. It draws no text of its
  own about them. The editor posts each as information.
- **From the editor's parts.** The editor provides one function, `post(level,
  text, problems?)`, through the component context; panels take it with
  `postOf()`, and the workspace session and the autosave take it as an
  option.
- **Show matches.** Turning it on asks the editor to load the tables the
  manifests name; where it then holds none, the editor says so as
  information, "No MatchClaim table loaded.", and, while no server can
  read a table, "Matches need a running tilie-server." in its place. While
  a server given has not answered its health check, nothing is said until
  it answers.

## Consequences

- The canvas's status line, its grey Show matches box and the canvas's
  `matchesStatus` prop are deleted; an application embedding the arranger
  alone shows its refusals where it chooses.
- A refusal no longer waits for the next stored command to disappear: it
  leaves after three seconds whatever follows.
- How to start a server is said where a control is disabled for lack of
  one, no longer by turning Show matches on: information leaves too soon
  for the command it names.
- No dependency.

Review this decision when a message needs an action of its own (an Undo,
a Retry), by 2027-05-24.

Primary sources:
<https://www.w3.org/TR/wai-aria-1.2/#status>,
<https://www.w3.org/TR/wai-aria-1.2/#alert>.
