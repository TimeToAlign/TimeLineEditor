/**
 * The pure reducer of the four commands. A command resolves each address to
 * a target (`targets.ts`), and the target's kind decides what happens: what
 * a `set` may give it (`set.ts`), what an `add` puts into it (`add.ts`),
 * whether a `remove` takes it (`remove.ts`); a `style` embeds a rule
 * (`style.ts`). A command is atomic: the first refusal refuses it whole.
 * Every manifest it changed is then settled (`settle.ts`). The reducer mints
 * no ID: it takes the ID of every element it creates from the command's
 * `ids`, then from the minter its caller gives, if any.
 */

import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import { addressKey } from "../manifest/address.ts";
import type { IdMinter } from "../workspace/ids.ts";
import { idSource, MissingIdError } from "../workspace/ids.ts";
import type { View } from "../workspace/view.ts";
import { applyAdd } from "./add.ts";
import type { ChangeSet } from "./mutations.ts";
import { emptyChanges, sameJson } from "./mutations.ts";
import { parseCommand } from "./parse.ts";
import { applyRemove } from "./remove.ts";
import { changeProblem, setProperty } from "./set.ts";
import { settle } from "./settle.ts";
import { applyStyle } from "./style.ts";
import type { Command, SetCommand } from "./types.ts";

export { embedRule } from "./style.ts";

/** A command applied: the view it leaves and what it changed, the IDs it took in `changes.ids`. */
export interface Applied {
  readonly view: View;
  readonly changes: ChangeSet;
}

/**
 * Set each change's values in order, then check the target the change
 * leaves (`changeProblem`).
 */
function applySet(view: View, command: SetCommand, changes: ChangeSet): View | CommandError {
  let current = view;
  for (const change of command.changes) {
    for (const [property, value] of Object.entries(change.values)) {
      const next = setProperty(current, change.target, property, value, changes);
      if (isCommandError(next)) return next;
      current = next;
    }
    const refused = changeProblem(current, change);
    if (refused !== undefined) return refused;
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
    addressKey(change?.target ?? {}),
    property,
  ]);
}

/**
 * Apply a command `parseCommand` accepted and settle what it changed. With
 * `checked`, the settled manifests are checked against the schema and the
 * invariants and a `set` that changes nothing is refused; without, as a
 * gesture's preview applies it, neither. Every element it creates takes the
 * next of the command's `ids`, then, past them, the next ID `minter` mints;
 * without a minter a command creating more elements than its `ids` lists is
 * refused (`invalid_command` at `["ids"]`), and, checked, so is one whose
 * `ids` lists more IDs than it creates (at `["ids", <first one left>]`).
 */
export function applyChanges(
  view: View,
  command: Command,
  checked = true,
  minter: IdMinter | null = null,
): Applied | CommandError {
  const given = command.ids ?? [];
  const changes = emptyChanges(idSource(given, minter));
  try {
    const result = reduced(view, command, checked, changes);
    if (isCommandError(result)) return result;
    const { left } = changes.ids;
    if (checked && left > 0) {
      return problem(
        ErrorCode.invalidCommand,
        `the command takes ${given.length - left} of the ${given.length} IDs it lists`,
        ["ids", given.length - left],
      );
    }
    return { view: result, changes };
  } catch (error) {
    if (!(error instanceof MissingIdError)) throw error;
    return problem(
      ErrorCode.invalidCommand,
      `the command creates more elements than the ${error.given} IDs it lists`,
      ["ids"],
    );
  }
}

/** `command` applied and settled, the IDs it creates taken from `changes.ids`. */
function reduced(
  view: View,
  command: Command,
  checked: boolean,
  changes: ChangeSet,
): View | CommandError {
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
  return settled;
}

/**
 * Apply a command `parseCommand` accepted, the IDs it creates taken from its
 * `ids`, then from `minter`.
 */
export function applyParsed(
  view: View,
  command: Command,
  minter: IdMinter | null = null,
): View | CommandError {
  const applied = applyChanges(view, command, true, minter);
  return isCommandError(applied) ? applied : applied.view;
}

/**
 * Apply one command to a view: the new view, or why the command was
 * refused. The IDs of what it creates are its `ids`; with `minter`, those
 * past them are minted by it, as the store mints them for a command it
 * dispatches. Without a minter, a command creating an element its `ids`
 * gives no ID for is refused, as a journal entry lacking one is.
 */
export function apply(
  view: View,
  command: unknown,
  minter: IdMinter | null = null,
): View | CommandError {
  const parsed = parseCommand(command);
  if (isCommandError(parsed)) return parsed;
  return applyParsed(view, parsed, minter);
}
