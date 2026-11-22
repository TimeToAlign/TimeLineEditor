/**
 * What the inspector offers for a selected stored elision: nothing, as for an
 * alignment anchor. The expected values are derived in `README.md`
 * ("A selected elision").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Store } from "@timetoalign/tilie-core";
import { createStore, isLoadError, readWorkspace } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { groupsOf } from "../src/inspector/groups.ts";
import { describesNothing, shownOf } from "../src/inspector/metadata/frame.ts";
import { lockOf, nameOf } from "../src/inspector/properties.ts";

const M = "bmixed0000";

/** The end-to-end `bundles` workspace with `elision_1` added to the timeline `score`. */
function storeWithElision(): Store {
  const text = readFileSync(
    path.join(import.meta.dirname, "..", "..", "..", "e2e", "fixtures", "bundles.tle.json"),
    "utf8",
  );
  const read = readWorkspace(text);
  if (isLoadError(read)) throw new Error("bundles.tle.json is refused");
  const store = createStore(read);
  const error = store.dispatch({
    type: "add",
    into: { block: M, id: "score" },
    elision: { start: [1, 1], end: [2, 1] },
  });
  if (error !== null) throw new Error(error.message);
  return store;
}

describe("a selected stored elision", () => {
  const { view } = storeWithElision();
  const subjects = resolveSelection(
    view,
    selectionOf([{ block: M, id: "elision_1" }]),
    null,
    fontMetrics,
  );

  it("resolves to the kind elision", () => {
    expect(subjects.map((subject) => subject.resolved.kind)).toEqual(["elision"]);
  });

  it("has no statements: the tab says so in its words", () => {
    expect(shownOf(view, subjects, null)).toEqual({
      kind: "none",
      hint: describesNothing("elision 'elision_1' in bundle 'Mixed'"),
    });
  });

  it("has no name field, no lock and no groups", () => {
    expect(nameOf(view, subjects, null)).toBeNull();
    expect(lockOf(subjects)).toBeNull();
    expect(groupsOf(view, subjects, null)).toBeNull();
  });
});
