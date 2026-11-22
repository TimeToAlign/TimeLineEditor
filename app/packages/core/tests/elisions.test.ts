import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { isCommandError } from "../src/errors.ts";
import { removedBy } from "../src/manifest/remove.ts";
import type { Manifest } from "../src/manifest/types.ts";
import { manifestIds } from "../src/workspace/address.ts";
import { sideEffect } from "../src/workspace/guard.ts";
import { nextId } from "../src/workspace/ids.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
import { A, at, block, changed, fileText, key, loadText, manifestValue } from "./support.ts";

/** An elision as `graphical.elisions` states it. */
interface Stated {
  readonly id: string;
  readonly timeline: string;
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
}

const elision = (
  id: string,
  timeline: string,
  start: readonly [number, number],
  end: readonly [number, number],
): Stated => ({ id, timeline, start, end });

/** An elision as core reads it: complete, its `display` the default. */
const complete = (stated: Stated) => ({ ...stated, display: ["strip", "name", "coordinate"] });

/** The fixture `name` given `elisions` before it is read. */
function withElisions(name: string, ...elisions: Stated[]): Manifest {
  const value = manifestValue(name);
  const graphical = (value.graphical ?? {}) as Record<string, unknown>;
  return loadText(fileText({ ...value, graphical: { ...graphical, elisions } }), name);
}

/** A view whose block `A` holds `manifest`. */
const viewWith = (manifest: Manifest): View =>
  changed(createView(), { type: "add", into: {}, block: { id: A, manifest, x: 0, y: 0 } });

const set = (id: string, values: object) => ({
  type: "set",
  changes: [{ target: at(id), values }],
});

const elisionsOf = (view: View) => block(view).manifest.graphical?.elisions;

/** A refusal's code, path and message, failing loudly where the command was taken. */
function refused(result: unknown) {
  if (!isCommandError(result)) throw new Error("expected a refusal");
  return { code: result.code, path: result.path, message: result.message };
}

describe("elisions in ordinary edits", () => {
  it("are skipped by every ID minted and refused as a given one", () => {
    const first = elision("elision_1", "bare", [1, 1], [2, 1]);
    const named = elision("timestamp_3", "bare", [3, 1], [4, 1]);
    const manifest = withElisions("bare.yaml", first, named);
    const ids = manifestIds(manifest);
    expect([ids.has("elision_1"), ids.has("timestamp_3")]).toEqual([true, true]);
    expect(nextId("elision", ids)).toBe("elision_2");
    const view = viewWith(manifest);
    const added = changed(view, {
      type: "add",
      into: at("bare"),
      timestamp: { name: "Bar 2", coordinate: [2, 1] },
    });
    const timestamps = block(added).manifest.graphical?.timestamps ?? [];
    expect(timestamps.map((timestamp) => timestamp.id)).toEqual([
      "timestamp_1",
      "timestamp_4",
      "timestamp_2",
    ]);
    expect(elisionsOf(added)).toEqual([complete(first), complete(named)]);
    const region = { id: "elision_1", start: [0, 1], end: [1, 1] };
    expect(refused(apply(view, { type: "add", into: at("bare"), region }))).toEqual({
      code: "duplicate_id",
      path: [key(at("bare")), "region", "id"],
      message: "'elision_1' is already an ID of the manifest",
    });
  });

  describe("on nested timelines", () => {
    const onRoot = elision("elision_1", "clt_1", [13, 1], [15, 1]);
    const onChild = elision("elision_2", "clt_3", [1, 1], [2, 1]);
    const onGrandchild = elision("elision_3", "clt_2", [1, 2], [1, 1]);
    const manifest = withElisions("nested.yaml", onRoot, onChild, onGrandchild);
    const view = viewWith(manifest);

    it("go with the timeline they lie on, and with its removed descendants", () => {
      expect([...removedBy(manifest, ["clt_3"])].sort()).toEqual([
        "clt_2",
        "clt_3",
        "elision_2",
        "elision_3",
      ]);
      const removed = changed(view, { type: "remove", targets: [at("clt_3")] });
      expect(elisionsOf(removed)).toEqual([complete(onRoot)]);
    });

    it("lie inside the timeline editor of the timeline holding them", () => {
      const removed = changed(view, { type: "remove", targets: [at("clt_2")] });
      expect(elisionsOf(removed)).toEqual([complete(onRoot), complete(onChild)]);
      expect(sideEffect(view, removed, at("clt_3"))).toBeNull();
    });

    it("refuse a length below an elision's end, as a named timestamp not at the end does", () => {
      expect(refused(apply(view, set("clt_1", { length: [29, 2] })))).toEqual({
        code: "elision_exceeds_length",
        path: [key(at("clt_1")), "length"],
        message: "elision 'elision_1' reaches beyond the end of its timeline 'clt_1'",
      });
      const shortened = changed(view, set("clt_1", { length: [15, 1] }));
      // In canonical order: by timeline, then start, then ID.
      expect(elisionsOf(shortened)).toEqual([
        complete(onRoot),
        complete(onGrandchild),
        complete(onChild),
      ]);
      const length = (block(shortened).manifest.graphical?.timestamps ?? []).find(
        (timestamp) => timestamp.name === "length",
      );
      expect(length?.coordinate).toEqual([15, 1]);
      const unknown = changed(view, set("clt_1", { length: null }));
      expect(block(unknown).manifest.timelines[0]?.length).toBeNull();
      expect(elisionsOf(unknown)).toEqual(elisionsOf(view));
    });

    it("keep their place where a timestamp at the old end follows it", () => {
      const atEnd = elision("elision_1", "clt_1", [13, 1], [16, 1]);
      const ending = viewWith(withElisions("nested.yaml", atEnd));
      expect(refused(apply(ending, set("clt_1", { length: [15, 1] })))).toEqual({
        code: "elision_exceeds_length",
        path: [key(at("clt_1")), "length"],
        message: "elision 'elision_1' reaches beyond the end of its timeline 'clt_1'",
      });
    });
  });
});
