import {
  dumps,
  unknownKeys as fileUnknownKeys,
  loads,
  SCHEMA_VERSION,
} from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { isLoadError } from "../src/errors.ts";
import { addressKey } from "../src/manifest/address.ts";
import {
  idFormPath,
  loadManifest,
  normalizeManifest,
  saveManifest,
  unknownKeys,
  withHeldIds,
} from "../src/manifest/io.ts";
import { readWorkspace, writeWorkspace } from "../src/workspace/file.ts";
import {
  A,
  at,
  changed,
  fixtureText,
  load,
  loadText,
  refusal,
  storeOf,
  viewOf,
} from "./support.ts";

/** `bare.yaml`'s value as its file writes it, every ID `#id`. */
const bareFile = (): Record<string, unknown> =>
  loads(fixtureText("bare.yaml")) as Record<string, unknown>;

/** `bare.yaml`'s file value with `change` applied to it, as text. */
function bareWith(change: (value: Record<string, unknown>) => void): string {
  const value = bareFile();
  change(value);
  return dumps(value);
}

/** The value's root, `timelines[0]`, as a plain object to change. */
function rootOf(value: Record<string, unknown>): Record<string, unknown> {
  const [root] = value.timelines as Record<string, unknown>[];
  if (root === undefined) throw new Error("the fixture has a root");
  return root;
}

/** The value's `graphical` object, to change. */
function graphicalOf(value: Record<string, unknown>): Record<string, unknown> {
  return value.graphical as Record<string, unknown>;
}

const BANDS = ["children", "conversion_maps", "line", "markers", "regions", "flow_control"];

describe("IDs in a file and in memory", () => {
  it("1. reads every ID of a file bare", () => {
    const manifest = load("groups/group_styled.yaml");
    expect(manifest.timelines.map(({ id }) => id)).toEqual(["page", "performance", "score"]);
    expect(manifest.groups).toEqual([
      { id: "group_1", members: ["page", "performance", "score"], meta: {}, name: "Edition" },
    ]);
    expect(Object.keys(manifest.graphical?.order ?? {})).toEqual(["group_1"]);
    expect(manifest.graphical?.order?.group_1).toEqual(["score", "page", "performance"]);
    expect(manifest.graphical?.rules?.[1]?.select.addresses).toEqual([
      { id: "group_1", part: ["name"] },
    ]);
    expect(manifest.graphical?.timestamps?.map(({ id, timeline }) => [id, timeline])).toEqual([
      ["timestamp_1", "page"],
      ["timestamp_2", "page"],
      ["timestamp_3", "performance"],
      ["timestamp_4", "performance"],
      ["timestamp_5", "score"],
      ["timestamp_6", "score"],
    ]);
    const [, , score] = manifest.timelines;
    expect(score?.flow_control.map(({ id }) => id)).toEqual(["jump_from_1"]);
    expect(score?.regions.map(({ id }) => id)).toEqual(["region_1"]);
    expect(score?.conversion_maps.map(({ id }) => id)).toEqual(["cmap_1"]);
  });

  it("2. addresses the bare IDs in commands", () => {
    const view = viewOf([A, "groups/group_styled.yaml"]);
    const renamed = changed(view, {
      type: "set",
      changes: [{ target: at("score"), values: { name: "Full score" } }],
    });
    expect(renamed.blocks[A]?.manifest.timelines[2]?.name).toBe("Full score");
    const hashed = at("#score");
    expect(
      refusal(
        apply(view, { type: "set", changes: [{ target: hashed, values: { name: "Score" } }] }),
      ),
    ).toEqual({ code: "unknown_target", path: [addressKey(hashed)] });
  });

  it("3. refuses a file writing an ID bare, at its path in the file", () => {
    const bareRoot = loadManifest(bareWith((value) => (rootOf(value).id = "bare")));
    expect(
      isLoadError(bareRoot) ? bareRoot.problems.map(({ code, path }) => [code, path]) : [],
    ).toEqual([["schema_violation", ["timelines", 0, "id"]]]);
    const bareKey = loadManifest(bareWith((value) => (graphicalOf(value).order = { bare: BANDS })));
    expect(
      isLoadError(bareKey) ? bareKey.problems.map(({ code, path }) => [code, path]) : [],
    ).toEqual([["schema_violation", ["graphical", "order"]]]);
  });

  it("4. checks what core holds in its file form, its problems at held paths", () => {
    const held = {
      timetoshare: SCHEMA_VERSION,
      timelines: [{ id: "a", unit: "quarters", length: [4, 1] }],
      graphical: { order: { a: ["x", ...BANDS.slice(1)] } },
    };
    const read = normalizeManifest(held);
    expect(isLoadError(read) ? read.problems.map(({ code, path }) => [code, path]) : []).toEqual([
      ["schema_violation", ["graphical", "order", "a", 0]],
    ]);
    expect(idFormPath(["graphical", "order", "a", 0], true)).toEqual([
      "graphical",
      "order",
      "#a",
      0,
    ]);
    expect(idFormPath(["graphical", "order", "#a", 0], false)).toEqual([
      "graphical",
      "order",
      "a",
      0,
    ]);
    expect(idFormPath(["timelines", 0, "id"], true)).toEqual(["timelines", 0, "id"]);
  });

  it("5. writes an ID starting with # as ##, read back as it was", () => {
    const manifest = normalizeManifest({
      timetoshare: SCHEMA_VERSION,
      timelines: [{ id: "#x", unit: "quarters", length: [4, 1] }],
    });
    if (isLoadError(manifest)) throw new Error(JSON.stringify(manifest.problems));
    const text = saveManifest(manifest);
    expect((loads(text) as { timelines: { id: string }[] }).timelines[0]?.id).toBe("##x");
    expect(loadText(text).timelines[0]?.id).toBe("#x");
  });

  it("6. finds unknown keys in the file form, at held paths", () => {
    const manifest = loadText(bareWith((value) => (rootOf(value)["x-root"] = 1)));
    expect(unknownKeys(manifest)).toEqual([{ path: ["timelines", 0], key: "x-root" }]);
    expect(() => fileUnknownKeys(manifest)).toThrow();
  });

  it("7. keeps bare IDs in the workspace file", () => {
    const store = storeOf(viewOf([A, "bare.yaml"]));
    const text = writeWorkspace(store.snapshot());
    const file = loads(text) as {
      blocks: { [id: string]: { manifest: { timelines: { id: string }[] } } };
    };
    expect(file.blocks[A]?.manifest.timelines[0]?.id).toBe("bare");
    const read = readWorkspace(text);
    expect(isLoadError(read) ? read.problems : read.view.blocks[A]?.manifest).toEqual(
      store.view.blocks[A]?.manifest,
    );
  });

  it("8. makes a value from outside bare, refusing an ID written bare", () => {
    const value = bareFile();
    expect(rootOf(value).id).toBe("#bare");
    const held = withHeldIds(value);
    expect(isLoadError(held) ? held : rootOf(held as Record<string, unknown>).id).toBe("bare");
    rootOf(value).id = "bare";
    const refused = withHeldIds(value);
    expect(
      isLoadError(refused) ? refused.problems.map(({ code, path }) => [code, path]) : [],
    ).toEqual([["schema_violation", ["timelines", 0, "id"]]]);
  });
});
