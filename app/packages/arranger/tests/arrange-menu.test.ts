/**
 * The Arrange menu's model (README, "The Arrange menu's model"): the state
 * every control on an arrangement shows and the one command each choice
 * sends.
 */

import type { Command, View } from "@timetoalign/tilie-core";
import { WORKSPACE } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import type { ArrangeMenuProps } from "../src/arrangeMenu.ts";
import { arrangeMenuOf } from "../src/arrangeMenu.ts";
import type { Editing } from "../src/editing.ts";
import { A, B, C, changed, viewOf } from "./support.ts";

const ARRANGED_ROOTS = "bundles/bundle_arranged_roots";
const CONFLICT = "bundles/bundle_arranged_conflict";

/** The menu of `view` under `editing`, and the commands its choices handed over, in order. */
function menuOf(
  view: View,
  editing: Editing | null,
  disabled = false,
): { menu: ArrangeMenuProps; sent: Command[] } {
  const sent: Command[] = [];
  const menu = arrangeMenuOf(view, editing, disabled, (command) => sent.push(command));
  if (menu === null) throw new Error("no Arrange menu");
  return { menu, sent };
}

/** What a state reads, the actions left out. */
const stateOf = ({ level, chosen, columns, refused, disabled }: ArrangeMenuProps) => ({
  level,
  chosen,
  columns,
  refused,
  disabled,
});

const canvasSet = (arrangement: object | null) => ({
  type: "set",
  changes: [{ target: WORKSPACE, values: { arrangement } }],
});

const FIVE = () =>
  viewOf(
    { id: A, fixture: "bare" },
    { id: B, fixture: "bare" },
    { id: C, fixture: "bare" },
    { id: "0000000003", fixture: "bare" },
    { id: "0000000004", fixture: "bare" },
  );

describe("the arranger's blocks", () => {
  it("reads Free and hands one set per choice", () => {
    const view = FIVE();
    const { menu, sent } = menuOf(view, null, true);
    expect(stateOf(menu)).toEqual({
      level: "arranger",
      chosen: "free",
      columns: 3,
      refused: null,
      disabled: true,
    });
    menu.onchoose("vertical");
    menu.onchoose("matrix");
    menu.onchoose("free");
    expect(sent).toEqual([
      canvasSet({ direction: "vertical" }),
      canvasSet({ direction: "matrix", columns: 3 }),
    ]);
    expect(changed(view, sent[0] ?? null).arrangement).toEqual({ direction: "vertical" });
  });

  it("reads a stated matrix and changes its columns", () => {
    const view = changed(FIVE(), canvasSet({ direction: "matrix", columns: 2 }));
    const { menu, sent } = menuOf(view, null);
    expect(stateOf(menu)).toEqual({
      level: "arranger",
      chosen: "matrix",
      columns: 2,
      refused: null,
      disabled: false,
    });
    menu.oncolumns(3);
    menu.onchoose("matrix");
    menu.onchoose("free");
    expect(sent).toEqual([canvasSet({ direction: "matrix", columns: 3 }), canvasSet(null)]);
  });
});

describe("a bundle editor's items", () => {
  it("reads the reason Horizontal is refused and hands the block's set", () => {
    const view = viewOf({ id: A, fixture: CONFLICT });
    const { menu, sent } = menuOf(view, { target: { block: A }, kind: "bundle" });
    expect(stateOf(menu)).toEqual({
      level: "bundle",
      chosen: "free",
      columns: 1,
      refused: '"Theme A" and "Theme B" overlap on "Score" (8–16 ♩)',
      disabled: false,
    });
    menu.onchoose("free");
    menu.onchoose("vertical");
    const arrangement = { direction: "vertical", order: ["group_1", "group_2"] };
    expect(sent).toEqual([
      { type: "set", changes: [{ target: { block: A }, values: { arrangement } }] },
    ]);
    expect(changed(view, sent[0] ?? null).blocks[A]?.arrangement).toEqual(arrangement);
  });

  it("reads no reason where the items may stand side by side", () => {
    const view = viewOf({ id: A, fixture: ARRANGED_ROOTS });
    expect(menuOf(view, { target: { block: A }, kind: "bundle" }).menu.refused).toBeNull();
  });
});

describe("group and timeline editors", () => {
  it("arrange nothing", () => {
    const view = viewOf({ id: A, fixture: CONFLICT });
    const none = (editing: Editing) => arrangeMenuOf(view, editing, false, () => {});
    expect([
      none({ target: { block: A, id: "group_1" }, kind: "group" }),
      none({ target: { block: A, id: "theme_a" }, kind: "timeline" }),
    ]).toEqual([null, null]);
  });
});
