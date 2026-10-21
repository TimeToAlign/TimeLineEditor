---
status: accepted
date: 2026-10-11
---

# The workspace store and its command journal

## Context

The workspace is an immutable plain value, the view, changed only by the four
commands `add`, `set`, `remove` and `style` through the pure `apply(view,
command)`. The editor needs undo and redo, needs to know who changed what and
when, and needs a file that people and agents can read, diff and edit with
ordinary tools. No dependency is involved: this decision records how `core`
holds history and writes the file, so that later changes know what they
must keep.

## Considered options

- **A journal in the file.** Every accepted command is kept as an entry
  `{command, author, time}` in the workspace file beside the snapshot
  `{meta, settings, blocks}`. The journal is the undo stack.
- **Undo in memory only.** The file holds the snapshot; undo history is lost
  when the editor closes and authorship is not recorded.
- **Inverse commands.** Each command computes its inverse for undo. Every
  command kind then needs a second, separately tested reducer, and the
  inverse of a whole-manifest `set` is a whole manifest anyway.

## Decision

Keep the journal in the file. `createStore(workspace, {author, clock})`
stamps each accepted command with its author (`"Gerhardt"` until
`setAuthor`) and `clock().toISOString()`, ISO 8601 UTC with milliseconds, and
appends the command as `parseCommand` normalized it. `undo` moves the last
entry to an in-memory redo stack and restores the previous view; a new
command clears the redo stack. The views of the session are kept, sharing
every unchanged block, so undo and redo within a session return the very
same objects. Undo past the session's first entry replays the journal once
from the empty workspace (`createView()`, default settings) and keeps every
view of that replay.

**The journal is the authority**: replaying the whole journal from the empty
workspace reproduces the snapshot's `settings` and `blocks` exactly. It holds
because `apply` is pure and deterministic and every id a command needs is
minted by the caller and carried in the command; the property tests prove it
over every manifest fixture with generated command sequences. Amended
2026-10-19: `createStore` verifies it for every workspace it is given. It
replays the journal to its end, compares the result's `settings` and blocks
with the snapshot, and throws `JournalMismatchError {entry, path}` naming the
first differing path when they differ, so a file whose journal was edited by
hand to disagree with its snapshot is refused (`journal_mismatch`) as any
unreadable file is, rather than opened with a history that undo would not
follow. `readWorkspace` keeps its cost and does not replay: reading and
verifying are two steps, both run when a file is opened.

`writeWorkspace` is TimeToShare's `dumps` of `{meta, settings, blocks,
journal, sessions}`; `readWorkspace` reads with TimeToShare's lossless `parseJson`
(its `parse` validates one manifest and does not apply to the workspace),
refuses another `format` or `version`, any unknown or missing member and any
invalid manifest, and reads every block's manifest through core's one
manifest reader, `normalizeManifest`. Writing what was read gives the same bytes.

**Superseded in part (2026-10-18).** Undo and redo now move by steps. A
change is one command at any depth, owned by the innermost editor session
whose own entries hold it. A change the level in view owns itself, a
command of the open editor's session or, with no editor open, of the main
journal, is one step; a maximal run of consecutive changes owned by one
closed session is one step, so undo reaches into a closed session run by
run. Redo re-applies the earliest undone step, so it mirrors undo step for
step. The store keeps a count of applied changes per level instead of a
redo stack, a new command discards the undone changes, and an undo past
the views the store holds applies the changes from the latest view it
holds, or from the empty workspace at the start of a loaded journal. The
replay invariant holds as stated.

## Consequences

Undo reaches back across sessions, and the file says who changed what and
when. The file grows with its history: every `add` of a block carries the
whole manifest, so a workspace's text is roughly its snapshot twice.
Compaction (dropping or squashing old entries) is a later decision.

Budgets measured on an Intel Core i7-8750H, Node 22.23.2, each the median of
9 runs after a warm-up, with the core test suite running alone
(`TILIE_MEASURE=<file>`, `tests/budget.test.ts`): a workspace of the 23 manifest
fixtures in turn, with a journal of the block additions followed by moves.

| Workspace | Text | `readWorkspace` | `writeWorkspace` | one `dispatch` |
| --- | ---: | ---: | ---: | ---: |
| 300 blocks, 1,000 entries | 2.6 MB | 175 ms | 94 ms | 0.28 ms |
| 10,000 blocks, 10,000 entries | 81.1 MB | 4,394 ms | 2,834 ms | 8.3 ms |

The budgets were first set at 50 ms to open (validation included) and to
save 300 blocks with 1,000 entries, and 1 ms for a command. The command
budget holds. Opening and saving did not: of the opening time,
TimeToShare's `parseJson` takes about 88 ms on the 2.6 MB text and the
manifests' validation about 30 ms; of the saving time, `dumps` takes about
60 ms. A command copies the map of blocks once, so its time grows with the
number of blocks: 8.3 ms at 10,000.

Given these measurements, the budgets were revised on 2026-10-11 rather than
the file format or the reader changed: opening and saving 300 blocks with
1,000 entries each take at most 250 ms; a command at most 1 ms. No speedup
work is planned; `tests/budget.test.ts` holds these limits, and a figure
beyond them fails the test. The test times each operation as the minimum of
5 runs after a warm-up, so it measures the code rather than the load of the
machine: inside the parallel suite a median reached 273 ms for opening while
the same code takes 175 ms alone, and even the minimum exceeded the limit
when other work loaded the machine. The budget test therefore runs on its
own: the default `pnpm test` excludes it, and `pnpm test:budget` runs it
alone, without file parallelism.

Opening and verifying the 300-block workspace with 1,000 entries,
`readWorkspace` followed by `createStore`, measured 497 to 501 ms on
2026-10-19 (the same machine, minimum of 5 runs after a warm-up, while other
work loaded it); the budget test prints this figure and sets no limit on it,
since the replay is the price of trusting the journal.

Exit cost: the journal is one array in the file and one module in `core`;
dropping it leaves the snapshot readable as it is.

## Review date

2027-04-10, or when a workspace file's size makes compaction necessary.
