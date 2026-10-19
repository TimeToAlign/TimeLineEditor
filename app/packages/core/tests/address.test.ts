import { describe, expect, it } from "vitest";
import type { ElementKey } from "../src/manifest/elements.ts";
import { manifestElements, timelineAncestry } from "../src/manifest/elements.ts";
import type { ResolvedAddress, ResolvedElement } from "../src/workspace/address.ts";
import { indexOf, resolveAddress, resolveElement } from "../src/workspace/address.ts";
import { A, allFixtures, B, block, loadText, refusal, viewOf } from "./support.ts";

const MIXED = "bundles/bundle_mixed.json";
const view = viewOf([A, MIXED], [B, "map.json"]);
const at = (element: string) => `${A}/${element}`;

/** A resolution reduced to what tells its kinds apart: kind, ids and words, owners nested. */
function shape(resolved: ResolvedAddress | ResolvedElement): unknown {
  switch (resolved.kind) {
    case "workspace":
    case "title":
      return [resolved.kind];
    case "block":
      return [resolved.kind, resolved.block.id];
    case "frame":
      return [resolved.kind, resolved.group.id, resolved.container.address];
    case "timeline":
      return [resolved.kind, resolved.at.timeline.id, resolved.container?.address ?? null];
    case "card":
      return [resolved.kind, resolved.at.timeline.id, resolved.container.address];
    case "band":
      return [
        resolved.kind,
        resolved.at.timeline.id,
        resolved.band,
        resolved.container.holder?.address,
      ];
    case "entry":
      return [
        resolved.kind,
        resolved.at.timeline.id,
        resolved.entry,
        resolved.index,
        resolved.element.id,
      ];
    case "part":
      return [resolved.kind, resolved.word, shape(resolved.owner)];
  }
}

const resolved = (address: string) => {
  const found = resolveAddress(view, address);
  if ("code" in found) throw new Error(`${address}: ${found.code}`);
  return shape(found);
};

describe("resolving an address", () => {
  it.each([
    ["workspace", ["workspace"]],
    [A, ["block", A]],
    [at("name"), ["title"]],
    [at("group_1"), ["frame", "group_1", "group_1"]],
    [at("group_1/name"), ["part", "name", ["frame", "group_1", "group_1"]]],
    [at("score"), ["timeline", "score", "score/card"]],
    [at("excerpt"), ["timeline", "excerpt", "excerpt/card"]],
    [at("recording"), ["timeline", "recording", null]],
    [at("score/card"), ["card", "score", "score/card"]],
    [at("recording/card"), ["part", "card", ["timeline", "recording", null]]],
    [at("score/regions_1"), ["band", "score", "regions", "score/card"]],
    [at("excerpt/children_1"), ["band", "excerpt", "children", "excerpt/card"]],
    [at("annotations/region_2"), ["entry", "annotations", "region", 1, "region_2"]],
    [at("recording/cmap_2"), ["entry", "excerpt", "map", 0, "cmap_2"]],
    [at("score/jump_1"), ["entry", "score", "jump", 0, "jump_1"]],
    [
      at("annotations/region_1/label"),
      ["part", "label", ["entry", "annotations", "region", 0, "region_1"]],
    ],
    [at("score/end"), ["part", "end", ["timeline", "score", "score/card"]]],
    [
      at("score/end/label"),
      ["part", "label", ["part", "end", ["timeline", "score", "score/card"]]],
    ],
    [at("excerpt/name"), ["part", "name", ["timeline", "excerpt", "excerpt/card"]]],
  ])("resolves %s", (address, expected) => {
    expect(resolved(address)).toEqual(expected);
  });

  it("names the block by its manifest's own id", () => {
    const named = block(view, A);
    const withId = {
      ...view,
      blocks: { ...view.blocks, [A]: { ...named, manifest: { ...named.manifest, id: "takes" } } },
    };
    const found = resolveAddress(withId, at("takes"));
    expect(found).toEqual({ kind: "block", block: withId.blocks[A] });
    expect(refusal(resolveAddress(view, at("takes")))).toEqual({
      code: "unknown_target",
      path: [at("takes")],
    });
  });

  it("carries the block of its manifest at every level", () => {
    const found = resolveAddress(view, at("score/end/label"));
    expect(found).toMatchObject({ block: block(view, A), owner: { block: block(view, A) } });
  });

  it.each([
    "0000000009",
    at("nothing"),
    at("excerpt/cmap_2"),
    at("recording/regions_1"),
    at("score/regions_2"),
    at("score/card/label"),
    at("group_1/label"),
    at("name/label"),
    at("score/regions_1/label"),
    at("score/start/end"),
    `${B}/name`,
  ])("names nothing at %s", (address) => {
    expect(refusal(resolveAddress(view, address))).toEqual({
      code: "unknown_target",
      path: [address],
    });
  });

  it.each(["short", `${A}/`])("refuses the malformed %s", (address) => {
    expect(refusal(resolveAddress(view, address))).toEqual({
      code: "invalid_address",
      path: [address],
    });
  });
});

/** The kind every drawn element's address resolves to, by its element type. */
function kindOf(key: ElementKey): ResolvedElement["kind"] {
  switch (key.type) {
    case "card":
      return "card";
    case "band":
      return "band";
    case "group":
      return "frame";
    case "map":
    case "region":
    case "break":
    case "jump":
      return "entry";
    case "name":
      return key.address === "name" ? "title" : "part";
    case "label":
    case "wedge":
    case "boundary":
      return "part";
    default:
      return "timeline";
  }
}

describe("every drawn element", () => {
  it.each(allFixtures.map((fixture) => [fixture.name, fixture.text] as const))(
    "of %s resolves to its kind",
    (_, text) => {
      const manifest = loadText(text);
      const drawn = manifestElements(manifest).filter((key) => key.address !== null);
      const found = drawn.map((key) => [
        key.address,
        resolveElement(manifest, key.address ?? "")?.kind,
      ]);
      expect(found).toEqual(drawn.map((key) => [key.address, kindOf(key)]));
    },
  );
});

describe("the index of a manifest", () => {
  const manifest = block(view, A).manifest;

  it("is memoised by identity", () => {
    expect(indexOf(manifest)).toBe(indexOf(manifest));
  });

  it("maps every timeline to itself and every entry to the timeline holding it", () => {
    const { owners, ancestry } = indexOf(manifest);
    expect(owners.get("score")).toBe("score");
    expect(owners.get("excerpt")).toBe("excerpt");
    expect(owners.get("annotations/region_1")).toBe("annotations");
    expect(owners.get("recording/cmap_2")).toBe("excerpt");
    expect(owners.get("group_1")).toBeUndefined();
    expect(owners.size).toBe(6 + 9);
    expect(ancestry).toEqual(timelineAncestry(manifest));
  });

  it("lists the drawing's elements", () => {
    expect(indexOf(manifest).elements).toEqual(manifestElements(manifest));
  });
});
