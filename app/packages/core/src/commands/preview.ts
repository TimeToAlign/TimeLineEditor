/** What a gesture shows before its command is released. */

import type { CommandError } from "../errors.ts";
import { isCommandError } from "../errors.ts";
import type { IdMinter } from "../workspace/ids.ts";
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
 * creates past the command's `ids` are minted by `minter`, a fresh one by
 * default; given the store's copy (`Store.minter`), they are the IDs the
 * store's dispatch of the command stores.
 */
export function preview(
  view: View,
  command: Command,
  minter: IdMinter = createIdMinter(),
): View | CommandError {
  const applied = applyChanges(view, command, false, minter);
  return isCommandError(applied) ? applied : applied.view;
}
