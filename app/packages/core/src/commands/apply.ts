/**
 * The pure reducer of the four commands. A command resolves each address to
 * a target (`targets.ts`), and the target's kind decides what happens: what
 * a `set` may give it (`set.ts`), what an `add` puts into it (`add.ts`),
 * whether a `remove` takes it (`remove.ts`); a `style` embeds a statement
 * (`style.ts`). A command is atomic: the first refusal refuses it whole.
 * Every manifest it changed is then settled (`settle.ts`).
 */

import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { View } from "../workspace/view.ts";
import { applyAdd } from "./add.ts";
import type { ChangeSet } from "./mutations.ts";
import { emptyChanges, sameJson } from "./mutations.ts";
import { parseCommand } from "./parse.ts";
import { applyRemove } from "./remove.ts";
import { setProperty } from "./set.ts";
import { settle } from "./settle.ts";
import { applyStyle } from "./style.ts";
import type { Command, SetCommand } from "./types.ts";

export { embedStatement } from "./style.ts";

/** A command applied: the view it leaves and what it changed. */
export interface Applied {
  readonly view: View;
  readonly changes: ChangeSet;
}

function applySet(view: View, command: SetCommand, changes: ChangeSet): View | CommandError {
  let current = view;
  for (const { target, values } of command.changes) {
    for (const [property, value] of Object.entries(values)) {
      const next = setProperty(current, target, property, value, changes);
      if (isCommandError(next)) return next;
      current = next;
    }
  }
  return current;
}

/**
 * Whether the values a `set` wrote undo one another, judged on what it
 * touched only: one change is a change (a setter records only a value that
 * differs from the one stored); a value whose last write differs from what
 * was stored is a change; a block a change reached past its path in is
 * compared whole.
 */
function undone(before: View, after: View, changes: ChangeSet): boolean {
  if (changes.paths.length < 2) return false;
  for (const { block, stored, value } of changes.written.values()) {
    if (block !== null && changes.reaching.has(block)) continue;
    if (!sameJson(stored, value)) return false;
  }
  return [...changes.reaching].every((id) => sameJson(before.blocks[id], after.blocks[id]));
}

/**
 * The refusal of a `set` that leaves the view as it was, at its first
 * value: the store journals every command it accepts, and Cancel would
 * count the entry as a change. A `set` of which only some values change
 * nothing changes something, and is accepted.
 */
function changesNothing(command: SetCommand): CommandError {
  const [change] = command.changes;
  const [property = ""] = Object.keys(change?.values ?? {});
  return problem(ErrorCode.invalidValue, "the command changes nothing", [
    change?.target ?? "",
    property,
  ]);
}

/**
 * Apply a command `parseCommand` accepted and settle what it changed. With
 * `checked`, the settled manifests are checked against the schema and the
 * invariants and a `set` that changes nothing is refused; without, as a
 * gesture's preview applies it, neither.
 */
export function applyChanges(view: View, command: Command, checked = true): Applied | CommandError {
  const changes = emptyChanges();
  let result: View | CommandError;
  switch (command.type) {
    case "add":
      result = applyAdd(view, command, changes);
      break;
    case "set":
      result = applySet(view, command, changes);
      break;
    case "remove":
      result = applyRemove(view, command.targets, changes);
      break;
    case "style":
      result = applyStyle(view, command, changes);
      break;
  }
  if (isCommandError(result)) return result;
  const settled = settle(view, result, changes, checked);
  if (isCommandError(settled)) return settled;
  if (checked && command.type === "set") {
    if (changes.paths.length === 0 || undone(view, settled, changes))
      return changesNothing(command);
  }
  return { view: settled, changes };
}

/** Apply a command `parseCommand` accepted. */
export function applyParsed(view: View, command: Command): View | CommandError {
  const applied = applyChanges(view, command);
  return isCommandError(applied) ? applied : applied.view;
}

/** Apply one command to a view: the new view, or why the command was refused. */
export function apply(view: View, command: unknown): View | CommandError {
  const parsed = parseCommand(command);
  if (isCommandError(parsed)) return parsed;
  return applyParsed(view, parsed);
}
