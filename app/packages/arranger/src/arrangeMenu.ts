/**
 * What the Arrange menu shows and does at a level: the one reading of the
 * stated arrangement and the one place a choice becomes a command, shared
 * by every control on it (the canvas's menu and the inspector's level tab),
 * so that both show the same state and send the same `set`.
 */

import type { CanvasDirection, Command, View } from "@timetoalign/tilie-core";
import { columnsOf } from "@timetoalign/tilie-core";
import { isArrangementConflict, rowOf } from "@timetoalign/tilie-core/drawing";
import type { Editing } from "./editing.ts";
import { addressParts } from "./editing.ts";
import { canvasArrangementCommand, itemArrangementCommand, shownItemOrder } from "./reorder.ts";

/** A choice of the menu: no arrangement, or a direction. */
export type ArrangeChoice = "free" | CanvasDirection;

/** The Arrange menu of one level: its state and its two actions. */
export interface ArrangeMenuProps {
  /** Whose contents are arranged: the arranger's blocks, or a bundle editor's items. */
  readonly level: "arranger" | "bundle";
  /** The arrangement stated now. */
  readonly chosen: ArrangeChoice;
  /** A matrix's number of columns, shown while Matrix is chosen. */
  readonly columns: number;
  /** Why the items cannot stand side by side; `null` where they can. */
  readonly refused: string | null;
  /** While disabled no choice is taken: a locked or read-only canvas. */
  readonly disabled: boolean;
  readonly onchoose: (choice: ArrangeChoice) => void;
  readonly oncolumns: (columns: number) => void;
}

/**
 * The Arrange menu of the level `editing` shows (`null` the arranger): the
 * arranger's blocks, or the items of the block a bundle editor edits,
 * Horizontal refused with core's reason where its items cannot stand side
 * by side; `null` in a group or timeline editor, which arranges nothing. A
 * choice hands `dispatch` one `set` (`canvasArrangementCommand`,
 * `itemArrangementCommand`), none where the choice is the stated one: a
 * block's items keep the order they are shown in, and a matrix states its
 * columns, `columnsOf` the blocks when first chosen.
 */
export function arrangeMenuOf(
  view: View,
  editing: Editing | null,
  disabled: boolean,
  dispatch: (command: Command) => void,
): ArrangeMenuProps | null {
  if (editing === null) {
    const stated = view.arrangement;
    const count = Object.keys(view.blocks).length;
    const columns =
      stated === undefined ? columnsOf({ direction: "matrix" }, count) : columnsOf(stated, count);
    const arrange = (arrangement: Parameters<typeof canvasArrangementCommand>[1]): void => {
      const command = canvasArrangementCommand(view, arrangement);
      if (command !== null) dispatch(command);
    };
    return {
      level: "arranger",
      chosen: stated?.direction ?? "free",
      columns,
      refused: null,
      disabled,
      onchoose: (choice) =>
        arrange(
          choice === "free"
            ? null
            : { direction: choice, ...(choice === "matrix" ? { columns } : {}) },
        ),
      oncolumns: (next) => arrange({ direction: "matrix", columns: next }),
    };
  }
  if (editing.kind !== "bundle") return null;
  const block = view.blocks[addressParts(editing.target).block];
  if (block === undefined) return null;
  const order = shownItemOrder(block);
  const row = rowOf(block.manifest, block.arrangement?.order ?? order);
  return {
    level: "bundle",
    chosen: block.arrangement?.direction ?? "free",
    columns: 1,
    refused: isArrangementConflict(row) ? row.reason : null,
    disabled,
    onchoose: (choice) => {
      const arrangement =
        choice === "vertical" || choice === "horizontal"
          ? { direction: choice, order: [...order] }
          : null;
      const command = itemArrangementCommand(block, arrangement);
      if (command !== null) dispatch(command);
    },
    oncolumns: () => {},
  };
}
