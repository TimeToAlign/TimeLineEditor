/**
 * Core's verdicts on the Properties tab's membership commands are read once
 * for each block, minter state and command; derived in `README.md` ("Group
 * memberships", item 5).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type * as Core from "@timetoalign/tilie-core";
import type { ElementAddress, Store, View } from "@timetoalign/tilie-core";
import {
  apply,
  createIdMinter,
  createStore,
  isCommandError,
  isLoadError,
  readWorkspace,
} from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { groupsOf, newGroupOf } from "../src/inspector/groups.ts";

vi.mock("@timetoalign/tilie-core", async (importOriginal) => {
  const core = await importOriginal<typeof Core>();
  return { ...core, apply: vi.fn(core.apply) };
});

const M = "bmixed0000";
const OTHER = "bshared000";

function storeOf(): Store {
  const text = readFileSync(
    path.join(import.meta.dirname, "..", "..", "..", "e2e", "fixtures", "bundles.tle.json"),
    "utf8",
  );
  const read = readWorkspace(text);
  if (isLoadError(read)) throw new Error("bundles.tle.json is refused");
  return createStore(read);
}

const subjectsOf = (view: View, ...elements: ElementAddress[]) =>
  resolveSelection(
    view,
    selectionOf(elements.map((element) => ({ block: M, ...element }))),
    null,
    fontMetrics,
  );

const calls = () => vi.mocked(apply).mock.calls.length;

/** The message of core's own `apply` of `command` on `view` with a minter of `seed`. */
function direct(view: View, command: Core.Command, seed: bigint): string | null {
  const result = apply(view, command, createIdMinter({ seed }));
  return isCommandError(result) ? result.message : null;
}

describe("core's verdicts on memberships", () => {
  beforeEach(() => {
    vi.mocked(apply).mockClear();
  });

  it("are applied once for each block, minter state and command", () => {
    const store = storeOf();
    const seven = createIdMinter({ seed: 7n });
    const card = { id: "score", part: ["card"] } as const;

    const first = groupsOf(store.view, subjectsOf(store.view, card), null, seven);
    expect(calls()).toBe(2);
    expect(groupsOf(store.view, subjectsOf(store.view, card), null, seven)).toEqual(first);
    expect(calls()).toBe(2);

    const held = store.view.blocks[M];
    expect(
      store.dispatch({ type: "set", changes: [{ target: { block: OTHER }, values: { x: 8 } }] }),
    ).toBeNull();
    const moved = store.view;
    expect(moved.blocks[M]).toBe(held);
    const before = calls();
    expect(groupsOf(moved, subjectsOf(moved, card), null, seven)).toEqual(first);
    expect(calls()).toBe(before);

    const pair = subjectsOf(moved, { id: "recording" }, { id: "excerpt" });
    const refused = newGroupOf(moved, pair, null, seven);
    expect(calls()).toBe(before + 1);
    expect(newGroupOf(moved, pair, null, seven)).toEqual(refused);
    expect(calls()).toBe(before + 1);
    const at7 = createIdMinter({ seed: 7n }).mint("group");
    expect(refused?.refusal).toBe(
      `'excerpt' and 'recording', a member of group '${at7}', would hold one another`,
    );

    const eight = newGroupOf(moved, pair, null, createIdMinter({ seed: 8n }));
    expect(calls()).toBe(before + 2);
    const at8 = createIdMinter({ seed: 8n }).mint("group");
    expect(at8).not.toBe(at7);
    expect(eight?.refusal).toBe(
      `'excerpt' and 'recording', a member of group '${at8}', would hold one another`,
    );

    for (const row of first?.rows ?? []) {
      expect(row.refusal).toBe(direct(store.view, row.command, 7n));
    }
    if (refused === null) throw new Error("a new group is offered");
    expect(refused.refusal).toBe(direct(moved, refused.command, 7n));

    expect(
      store.dispatch({ type: "set", changes: [{ target: { block: M }, values: { x: 16 } }] }),
    ).toBeNull();
    const again = calls();
    const shifted = store.view;
    expect(groupsOf(shifted, subjectsOf(shifted, card), null, seven)).toEqual(first);
    expect(calls()).toBe(again + 2);
  });
});
