/** What a gesture shows before its command is released. */

import type { CommandError } from "../errors.ts";
import { isCommandError } from "../errors.ts";
import { createIdMinter } from "../workspace/ids.ts";
import type { View } from "../workspace/view.ts";
import { applyChanges } from "./apply.ts";
import type { Command } from "./types.ts";

/**
 * The reducer without the schema check and the invariants: what a gesture
 * shows before release. The command is applied as `applyParsed` applies it,
 * every manifest it changes completed and put in canonical order and its
 * block's places fitted, so a preview never differs from what the command
 * stores; a value only the schema or an invariant would refuse is shown, and
 * a `set` that changes nothing gives the view back. The IDs of what it
 * creates past the command's `ids` are minted by a fresh minter, so they are
 * not those the store mints when the command is dispatched.
 */
export function preview(view: View, command: Command): View | CommandError {
  const applied = applyChanges(view, command, false, createIdMinter());
  return isCommandError(applied) ? applied : applied.view;
}
