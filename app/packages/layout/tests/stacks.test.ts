/** The markers band, the conversion maps band and the end marker; every number is derived in tests/README.md. */

import type { Manifest } from "@timetoalign/tilie-core";
import type { Graphical } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  type LineElement,
  manifestLayer,
} from "../src/index.ts";
import {
  bandOrder,
  build,
  child,
  edit,
  element,
  linearMap,
  load,
  metrics,
  set,
  withLocked,
} from "./support.ts";

const drawn = (manifest: Manifest, ...extra: Graphical[]): Drawing =>
  draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, ...extra, manifestLayer(manifest)], metrics);

/** The ordinate of every line and map of a drawing, by address. */
function ordinates(drawing: Drawing): Record<string, number> {
  return Object.fromEntries(
    drawing.elements.flatMap((item) => {
      if (item.type === "timeline" || item.type === "child") return [[item.address, item.y]];
      if (item.type === "map") return [[item.address, item.yc]];
      return [];
    }),
  );
}

/** The wedges, as `[address, yt, yb]`, and the baselines of their labels. */
const wedges = (drawing: Drawing) =>
  drawing.elements.flatMap((item) => {
    if (item.type === "wedge") return [[item.address, item.yt, item.yb]];
    if (item.type === "label" && /\/(start|end)\/label$/.test(item.address)) {
      return [[item.address, item.baseline]];
    }
    return [];
  });

describe("a child's conversion maps band", () => {
  const commands = [child("r", "c", 4, 4), linearMap("c", "m1"), linearMap("c", "m2")];

  it("lies above the child's own line by the default band order", () => {
    const drawing = drawn(build("r", 8, ...commands));
    expect(ordinates(drawing)).toEqual({ "r/m1": 22, "r/m2": 17, r: 41.5, c: 27.5 });
    expect(drawing.height).toBe(86.4765625);
    expect(element(drawing, "r/m1")).toMatchObject({
      xs: 230.0478515625,
      xe: 430.0478515625,
    });
  });

  it("lies below it by the child's own entry, or by its parent's, which it follows", () => {
    const below = { r: 41.5, c: 23, "r/m1": 28.5, "r/m2": 33.5 };
    const own = drawn(
      build(
        "r",
        8,
        ...commands,
        set("c", {
          order: bandOrder(
            "c",
            ["children"],
            ["conversion_maps", "markers", "regions", "flow_control"],
          ),
        }),
      ),
    );
    expect(ordinates(own)).toEqual(below);
    const parent = drawn(
      build(
        "r",
        8,
        ...commands,
        set("r", {
          order: bandOrder(
            "r",
            ["children"],
            ["conversion_maps", "markers", "regions", "flow_control"],
          ),
        }),
      ),
    );
    expect(ordinates(parent)).toEqual(below);
    expect(own.height).toBe(86.4765625);
  });

  it("lies above the child's line, towards the root, when the child lies below the root", () => {
    const drawing = drawn(
      build(
        "r",
        8,
        ...commands,
        set("r", {
          order: bandOrder(
            "r",
            ["conversion_maps"],
            ["markers", "children", "regions", "flow_control"],
          ),
        }),
      ),
    );
    expect(ordinates(drawing)).toEqual({
      "r/m1": 59.37890625,
      "r/m2": 54.37890625,
      r: 22.40234375,
      c: 64.87890625,
    });
    expect(drawing.height).toBe(89.87890625);
  });
});

describe("the markers band alone", () => {
  it("lies against the root's line below it by default", () => {
    const drawing = drawn(load("bare"));
    expect(element(drawing, "bare")).toMatchObject({ y: 22.40234375 });
    expect(wedges(drawing)).toEqual([
      ["bare/start", 23.90234375, 36.90234375],
      ["bare/end", 23.90234375, 36.90234375],
      ["bare/start/label", 47.25634765625],
      ["bare/end/label", 47.25634765625],
    ]);
    expect(drawing.height).toBe(67.37890625);
  });

  it("lies against it above when the band order puts it there", () => {
    const drawing = drawn(
      edit(
        "bare",
        set("bare", {
          order: bandOrder(
            "bare",
            ["children", "conversion_maps", "markers"],
            ["regions", "flow_control"],
          ),
        }),
      ),
    );
    expect(element(drawing, "bare")).toMatchObject({ y: 42.9765625 });
    expect(wedges(drawing)).toEqual([
      ["bare/start", 41.4765625, 28.4765625],
      ["bare/end", 41.4765625, 28.4765625],
      ["bare/start/label", 24.35400390625],
      ["bare/end/label", 24.35400390625],
    ]);
    expect(drawing.height).toBe(67.37890625);
  });
});

describe("the conversion maps band", () => {
  const name = "conversion_maps__maps_quarters";

  it("lies against the root's line above it alone, a stack of 12 maps", () => {
    const drawing = drawn(load(name));
    expect(element(drawing, "maps:quarters")).toMatchObject({ y: 77.5 });
    expect(element(drawing, "maps:quarters/cmap_1")).toMatchObject({ yc: 72 });
    expect(element(drawing, "maps:quarters/tmap_4")).toMatchObject({ yc: 17 });
    expect(drawing.height).toBe(122.4765625);
  });

  it("and the markers band lie at two levels B apart on one side", () => {
    const drawing = drawn(
      edit(
        name,
        set("maps:quarters", {
          order: bandOrder(
            "maps:quarters",
            ["children"],
            ["conversion_maps", "markers", "regions", "flow_control"],
          ),
        }),
      ),
    );
    expect(element(drawing, "maps:quarters")).toMatchObject({ y: 22.40234375 });
    expect(element(drawing, "maps:quarters/cmap_1")).toMatchObject({ yc: 27.90234375 });
    expect(element(drawing, "maps:quarters/tmap_4")).toMatchObject({ yc: 82.90234375 });
    expect(element(drawing, "maps:quarters/start")).toMatchObject({
      yt: 89.40234375,
      yb: 102.40234375,
    });
    expect(drawing.height).toBe(132.87890625);
  });

  it("lies beyond the markers band, leaving the line no stack, when ordered after it", () => {
    const drawing = drawn(
      edit(
        "map",
        set("melody", {
          order: bandOrder(
            "melody",
            ["children"],
            ["markers", "conversion_maps", "regions", "flow_control"],
          ),
        }),
      ),
    );
    expect(ordinates(drawing)).toEqual({
      "melody/tempo": 73.4765625,
      "melody/ticks": 28.5,
      melody: 37,
      phrase: 23,
    });
    expect(element(drawing, "melody/start")).toMatchObject({ yt: 38.5, yb: 51.5 });
    expect(drawing.height).toBe(92.4765625);
  });
});

describe("the end marker", () => {
  const manifest = build("r", 8, child("r", "c", 4, 4));
  const drawLocked = (locked: Record<string, boolean>) =>
    draw(withLocked(manifest, locked), DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
  const lines = (drawing: Drawing) =>
    drawing.elements
      .filter((item): item is LineElement => item.type === "timeline" || item.type === "child")
      .map(({ address, xe, y, end }) => ({ address, xe, y, end }));

  it("follows locked on the root, and ends a child with the diamond whatever its locked", () => {
    const unlockedRoot = drawLocked({});
    expect(lines(unlockedRoot)).toEqual([
      { address: "r", xe: 430.0478515625, y: 37, end: "arrowhead" },
      { address: "c", xe: 430.0478515625, y: 23, end: "diamond" },
    ]);
    expect(unlockedRoot.width).toBe(457.0478515625);
    const lockedRoot = drawLocked({ r: true });
    expect(lines(lockedRoot).map((line) => line.end)).toEqual(["circle", "diamond"]);
    expect(lockedRoot.width).toBe(454.4638671875);
    const unlockedChild = drawLocked({ r: true, c: false });
    expect(lines(unlockedChild)).toEqual(lines(lockedRoot));
    expect(unlockedChild.width).toBe(454.4638671875);
  });
});
