import type { Block, View } from "@timetoalign/tilie-core";
import {
  apply,
  createStore,
  createView,
  elementOf,
  isCommandError,
  manifestElements,
  manifestIds,
  parseBand,
} from "@timetoalign/tilie-core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ResizeMode, ZOrderAction } from "../src/index.ts";
import {
  affectedBy,
  drawingOf,
  handlesFor,
  itemHandlesFor,
  itemResizeCommand,
  itemResizeValues,
  moveCommand,
  nudgeCommand,
  project,
  removeCommand,
  resize,
  resizeCommand,
  resizedItemOf,
  zOrderCommand,
} from "../src/index.ts";
import {
  A,
  blockIn,
  CHILD_MEMBER,
  changed,
  load,
  metrics,
  mixedPlain,
  numbersView,
  placed,
} from "./support.ts";

/** `bundle_mixed` holds frames, members' cards (a root's and a child's) and an ungrouped card. */
const FIXTURES = [
  "bare",
  "nested",
  "flow_control",
  "with_region",
  "map",
  "bundles/bundle_mixed",
] as const;
/** The manifests of the removal property: `numbers` is a manifest with one group and a region. */
const REMOVAL_FIXTURES = [...FIXTURES, CHILD_MEMBER, "numbers"] as const;
const MODES: readonly ResizeMode[] = ["scale", "box", "stretch"];
const ACTIONS: readonly ZOrderAction[] = ["front", "back", "forward", "backward"];
const PLACEMENT = ["x", "y", "index", "scale", "length", "spacing", "width", "height"] as const;

const coordinate = fc.double({ min: -2000, max: 2000, noNaN: true });
const delta = fc.double({ min: -1000, max: 1000, noNaN: true });

/**
 * Drawing properties take up to 13.2 s under load
 * (tests/README.md, "The drawing properties' timeout").
 */
const DRAWING_TIMEOUT = 40_000;

const gesture = fc.oneof(
  fc.record({ kind: fc.constant("move" as const), pick: fc.nat(), x: coordinate, y: coordinate }),
  fc.record({
    kind: fc.constant("nudge" as const),
    pick: fc.nat(),
    dx: fc.integer({ min: -8, max: 8 }),
    dy: fc.integer({ min: -8, max: 8 }),
  }),
  fc.record({
    kind: fc.constant("zOrder" as const),
    picks: fc.array(fc.nat(), { maxLength: 3 }),
    action: fc.constantFrom(...ACTIONS),
  }),
  fc.record({
    kind: fc.constant("resize" as const),
    pick: fc.nat(),
    mode: fc.constantFrom(...MODES),
    handle: fc.nat(),
    dx: delta,
    dy: delta,
  }),
  fc.record({
    kind: fc.constant("itemResize" as const),
    pick: fc.nat(),
    box: fc.nat(),
    mode: fc.constantFrom(...MODES),
    handle: fc.nat(),
    dx: delta,
    dy: delta,
  }),
  fc.record({
    kind: fc.constant("request" as const),
    pick: fc.nat(),
    box: fc.nat(),
    width: fc.option(fc.integer({ min: 2048, max: 2000 * 2048 }), { nil: undefined }),
    height: fc.option(fc.integer({ min: 2048, max: 2000 * 2048 }), { nil: undefined }),
  }),
  fc.record({ kind: fc.constant("remove" as const), picks: fc.array(fc.nat(), { maxLength: 3 }) }),
);
type Gesture = typeof gesture extends fc.Arbitrary<infer T> ? T : never;

const blocks = fc.array(
  fc.record({ fixture: fc.constantFrom(...FIXTURES), x: coordinate, y: coordinate }),
  { minLength: 1, maxLength: 5 },
);

function initial(specs: readonly { fixture: string; x: number; y: number }[]): View {
  return specs.reduce(
    (view, { fixture, x, y }, index) =>
      changed(view, {
        type: "add",
        into: "workspace",
        block: { id: `000000000${index}`, manifest: load(fixture), x, y },
      }),
    createView(),
  );
}

/**
 * Every address a click can select in `view`: block ids, then the addresses
 * of their drawn elements and parts (a marker is not drawn).
 */
function addresses(view: View): string[] {
  const ids = Object.keys(view.blocks).sort();
  const drawn = (id: string) =>
    drawingOf(view.blocks[id] as Block, view.settings, metrics).elements.flatMap((element) =>
      element.address === null ? [] : [`${id}/${element.address}`],
    );
  return [...ids, ...ids.flatMap(drawn)];
}

/** The command a gesture gives on `view`, or `null` when it gives none. */
function commandOf(view: View, item: Gesture): object | null {
  const ids = Object.keys(view.blocks).sort();
  if (ids.length === 0) return null;
  const one = (pick: number) => ids[pick % ids.length] as string;
  switch (item.kind) {
    case "move":
      return moveCommand(view, [{ id: one(item.pick), x: item.x, y: item.y }], metrics);
    case "nudge":
      return nudgeCommand(view, [one(item.pick)], item.dx, item.dy, metrics);
    case "zOrder":
      return zOrderCommand(view, item.picks.map(one), item.action);
    case "resize": {
      const block = view.blocks[one(item.pick)];
      if (block === undefined) return null;
      const handles = handlesFor(item.mode);
      const handle = handles[item.handle % handles.length] as (typeof handles)[number];
      const { values } = resize(block, view.settings, metrics, item.mode, handle, item);
      return resizeCommand(block, values);
    }
    case "itemResize": {
      const block = view.blocks[one(item.pick)];
      if (block === undefined) return null;
      const drawing = drawingOf(block, view.settings, metrics);
      const boxes = [...drawing.items, ...drawing.cards].map((drawn) => drawn.address);
      if (boxes.length === 0) return null;
      const resized = resizedItemOf(drawing, boxes[item.box % boxes.length] as string);
      if (resized === undefined) return null;
      const handles = itemHandlesFor(item.mode, resized.kind, "arranger");
      const handle = handles[item.handle % handles.length] as (typeof handles)[number];
      const values = itemResizeValues(
        block,
        view.settings,
        metrics,
        "arranger",
        resized,
        item.mode,
        handle,
        item,
      );
      return itemResizeCommand(view, block.id, values, "arranger", metrics);
    }
    case "request": {
      const block = view.blocks[one(item.pick)];
      if (block === undefined) return null;
      const drawing = drawingOf(block, view.settings, metrics);
      const keys = [...drawing.items, ...drawing.cards].map((drawn) => drawn.key);
      if (keys.length === 0 || (item.width === undefined && item.height === undefined)) return null;
      const place = {
        ...(item.width === undefined ? {} : { width: item.width / 2048 }),
        ...(item.height === undefined ? {} : { height: item.height / 2048 }),
      };
      const key = keys[item.box % keys.length] as string;
      const stated = block.places[key];
      // A request its place states already changes nothing, so it gives no command.
      const same = ([member, value]: [string, number]) =>
        stated?.[member as "width" | "height"] === value;
      if (Object.entries(place).every(same)) return null;
      return { type: "set", changes: [{ target: `${block.id}/${key}`, values: { place } }] };
    }
    case "remove": {
      const all = addresses(view);
      const command = removeCommand(
        view,
        new Set(item.picks.map((pick) => all[pick % all.length] as string)),
      );
      return "refused" in command ? null : command;
    }
  }
}

describe("gesture commands", () => {
  it("are accepted by apply", { timeout: DRAWING_TIMEOUT }, () => {
    fc.assert(
      fc.property(blocks, fc.array(gesture, { maxLength: 8 }), (specs, gestures) => {
        let view = initial(specs);
        for (const item of gestures) {
          const command = commandOf(view, item);
          if (command === null) continue;
          const next = apply(view, command);
          expect(isCommandError(next) ? next : null).toBeNull();
          view = next as View;
        }
      }),
      { numRuns: 60 },
    );
  });

  it("are undone exactly through the store", { timeout: DRAWING_TIMEOUT }, () => {
    fc.assert(
      fc.property(blocks, fc.array(gesture, { maxLength: 8 }), (specs, gestures) => {
        const store = createStore({ view: initial(specs), journal: [], sessions: {} });
        const before: View[] = [];
        for (const item of gestures) {
          const command = commandOf(store.view, item);
          if (command === null) continue;
          before.push(store.view);
          expect(store.dispatch(command)).toBeNull();
        }
        for (const expected of before.reverse()) {
          store.undo();
          const view = store.view;
          expect(Object.keys(view.blocks).sort()).toEqual(Object.keys(expected.blocks).sort());
          for (const [id, block] of Object.entries(expected.blocks)) {
            for (const member of PLACEMENT) expect(view.blocks[id]?.[member]).toBe(block[member]);
            expect(view.blocks[id]?.places).toStrictEqual(block.places);
          }
        }
      }),
      { numRuns: 40 },
    );
  });
});

describe("a member's Stretch", () => {
  it("sets only its group's length and width and its members' card widths", {
    timeout: DRAWING_TIMEOUT,
  }, () => {
    const view = mixedPlain();
    const { cards } = drawingOf(blockIn(view, A), view.settings, metrics);
    const width = fc.option(fc.integer({ min: 2048, max: 2000 * 2048 }), { nil: null });
    fc.assert(
      fc.property(
        fc.constantFrom(...cards),
        width,
        fc.constantFrom(...cards),
        width,
        fc.constantFrom(...(["arranger", "bundle", "timeline"] as const)),
        delta,
        (card, frameSteps, sized, cardSteps, level, dx) => {
          let framed = view;
          if (frameSteps !== null) {
            framed = placed(framed, A, card.group, { width: frameSteps / 2048 });
          }
          if (cardSteps !== null)
            framed = placed(framed, A, sized.key, { width: cardSteps / 2048 });
          const resized = { kind: "member", key: card.key, item: card.group } as const;
          const block = blockIn(framed, A);
          const members = new Set(cards.filter((c) => c.group === card.group).map((c) => c.key));
          const values = itemResizeValues(
            block,
            framed.settings,
            metrics,
            level,
            resized,
            "stretch",
            "right",
            { dx, dy: 0 },
          );
          for (const [key, place] of values) {
            if (key === card.group) {
              expect(
                Object.keys(place).every((member) => ["length", "width"].includes(member)),
              ).toBe(true);
              expect(place.length).toBeTypeOf("number");
            } else {
              expect(members.has(key)).toBe(true);
              expect(Object.keys(place)).toEqual(["width"]);
            }
            if (block.places[key]?.width === undefined) expect(place.width).toBeUndefined();
          }
          const store = createStore({ view: framed, journal: [], sessions: {} });
          const editor = { arranger: null, bundle: A, timeline: `${A}/${card.key}` }[level];
          if (editor !== null) expect(store.open(editor)).toBeNull();
          const command = itemResizeCommand(framed, A, values, level, metrics);
          if (command !== null) expect(store.dispatch(command)).toBeNull();
        },
      ),
      { numRuns: 60 },
    );
  });
});

/** The fixtures of the round trip: widths and heights without flat pieces. */
const ROUND_TRIP_FIXTURES = ["bare", "nested", "bundles/bundle_mixed"] as const;

/** A stretched box of `fixture` at (40, 80), its requests, and how to stretch and read it. */
/** The view after a gesture's command, or `view` itself when the gesture gives none. */
const gestured = (view: View, command: object | null): View =>
  command === null ? view : changed(view, command);

function stretchCase(
  fixture: (typeof ROUND_TRIP_FIXTURES)[number],
  pick: number,
  vertical: boolean,
  widthRatio: number | null,
  heightRatio: number | null,
) {
  const start = initial([{ fixture, x: 40, y: 80 }]);
  const drawing = drawingOf(blockIn(start, A), start.settings, metrics);
  // The block itself (null), an item, or a member's card.
  const boxes = [null, ...drawing.items, ...drawing.cards];
  const box = boxes[pick % boxes.length] ?? null;
  const handle = vertical ? "bottom" : "right";
  /** The request at `ratio` times `content`, on the lattice, or none. */
  const request = (ratio: number | null, content: number) =>
    ratio === null ? null : Math.ceil(ratio * content * 2048) / 2048;
  const size = box === null ? drawing : "place" in box ? box.place : box.size;
  const width = request(widthRatio, size.width);
  const height = request(heightRatio, size.height);
  const target = box === null ? A : `${A}/${box.key}`;
  const values = box === null ? { width, height } : { place: { width, height } };
  // Without a request the box is the view as added, which states none.
  const view =
    width === null && height === null
      ? start
      : changed(start, { type: "set", changes: [{ target, values }] });
  const resized = box === null ? undefined : resizedItemOf(drawing, box.address);
  /** The stretched value, and the dragged box's extent on the stretched axis. */
  const state = (of: View) => {
    const block = blockIn(of, A);
    const drawn = drawingOf(block, of.settings, metrics);
    if (box === null) {
      return {
        value: vertical ? block.spacing : block.length,
        edge: vertical ? drawn.height : drawn.width,
      };
    }
    const card = drawn.cards.find((it) => it.key === box.key);
    const item = drawn.items.find((it) => it.key === (card?.group ?? box.key));
    if (item === undefined) throw new Error(`no item for ${box.key}`);
    const extent = card === undefined ? item.place : card.size;
    return {
      value: vertical ? (block.places[box.key]?.spacing ?? 1) : item.place.length,
      edge: vertical ? extent.height : extent.width,
    };
  };
  const stretch = (of: View, by: number) => {
    const block = blockIn(of, A);
    const at = vertical ? { dx: 0, dy: by } : { dx: by, dy: 0 };
    if (resized === undefined) {
      const { values } = resize(block, of.settings, metrics, "stretch", handle, at);
      return gestured(of, resizeCommand(block, values));
    }
    const places = itemResizeValues(
      block,
      of.settings,
      metrics,
      "arranger",
      resized,
      "stretch",
      handle,
      at,
    );
    return gestured(of, itemResizeCommand(of, A, places, "arranger", metrics));
  };
  /** A travel in [−200, 400] along time, [−8, 200] vertically, from `t` in [0, 1]. */
  const travel = (t: number) => (vertical ? -8 + t * 208 : -200 + t * 600);
  return { view, state, stretch, travel };
}

const ratio = fc.option(fc.double({ min: 1, max: 3, noNaN: true }), { nil: null });
const unit = fc.double({ min: 0, max: 1, noNaN: true });

describe("a stretch", () => {
  it("never finds a longer length or spacing for a shorter pointer", {
    timeout: DRAWING_TIMEOUT,
  }, () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROUND_TRIP_FIXTURES),
        fc.nat(),
        fc.boolean(),
        ratio,
        ratio,
        unit,
        unit,
        (fixture, pick, vertical, widthRatio, heightRatio, first, second) => {
          const { view, state, stretch, travel } = stretchCase(
            fixture,
            pick,
            vertical,
            widthRatio,
            heightRatio,
          );
          const d1 = travel(Math.min(first, second));
          const d2 = travel(Math.max(first, second));
          expect(state(stretch(view, d1)).value).toBeLessThanOrEqual(
            state(stretch(view, d2)).value,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("back to where it began never moves further away", { timeout: DRAWING_TIMEOUT }, () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROUND_TRIP_FIXTURES),
        fc.nat(),
        fc.boolean(),
        ratio,
        ratio,
        unit,
        (fixture, pick, vertical, widthRatio, heightRatio, t) => {
          const { view, state, stretch, travel } = stretchCase(
            fixture,
            pick,
            vertical,
            widthRatio,
            heightRatio,
          );
          const d = travel(t);
          const before = state(view);
          const once = stretch(view, d);
          const back = state(stretch(once, before.edge - state(once).edge)).value;
          if (d > 0) expect(back).toBeLessThanOrEqual(state(once).value);
          if (d < 0) expect(back).toBeGreaterThanOrEqual(state(once).value);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("back to where it began restores the length or spacing of a box without a request", {
    timeout: DRAWING_TIMEOUT,
  }, () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROUND_TRIP_FIXTURES),
        fc.nat(),
        fc.boolean(),
        unit,
        (fixture, pick, vertical, t) => {
          const { view, state, stretch, travel } = stretchCase(fixture, pick, vertical, null, null);
          const before = state(view);
          const once = stretch(view, travel(t));
          expect(state(stretch(once, before.edge - state(once).edge)).value).toBe(before.value);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("projection", () => {
  it("returns the identical nodes for an unchanged view", { timeout: DRAWING_TIMEOUT }, () => {
    fc.assert(
      fc.property(
        blocks,
        fc.array(gesture, { maxLength: 6 }),
        fc.array(fc.nat(), { maxLength: 4 }),
        (specs, gestures, picks) => {
          let view = initial(specs);
          for (const item of gestures) {
            const command = commandOf(view, item);
            if (command !== null) view = changed(view, command);
          }
          const all = addresses(view);
          const selection = new Set(
            all.length === 0 ? [] : picks.map((pick) => all[pick % all.length] as string),
          );
          const first = project(view, selection, [], metrics, null);
          const second = project(view, selection, first, metrics, null);
          expect(second).toHaveLength(Object.keys(view.blocks).length);
          for (const [index, node] of second.entries()) {
            expect(node).toBe(first[index]);
            expect(node.width).toBe(node.data.drawing.width * node.data.block.scale);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe("affectedBy", () => {
  it("names exactly what a remove deletes besides the selection", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REMOVAL_FIXTURES),
        fc.array(fc.nat(), { minLength: 1, maxLength: 4 }),
        (fixture, picks) => {
          const view = fixture === "numbers" ? numbersView() : initial([{ fixture, x: 0, y: 0 }]);
          const manifest = blockIn(view, A).manifest;
          const elements = manifestElements(manifest).flatMap((key) =>
            key.address === null ? [] : [key.address],
          );
          const local = new Set(picks.map((pick) => elements[pick % elements.length] as string));
          const owners = [...local]
            .filter((address) => parseBand(address) === null)
            .map((address) => elementOf(manifest, address));
          const command = removeCommand(view, new Set([...local].map((path) => `${A}/${path}`)));
          if (owners.length === 0) {
            expect(command).toEqual({
              refused: "A band is not deleted; select its elements to delete them.",
            });
            return;
          }
          const direct = apply(view, { type: "remove", targets: owners.map((o) => `${A}/${o}`) });
          expect("refused" in command).toBe(isCommandError(direct));
          if ("refused" in command) return;
          const before = manifestIds(manifest);
          const after = manifestIds(blockIn(changed(view, command), A).manifest);
          const expected = new Set(
            [...owners, ...affectedBy(manifest, local)].filter((item) => before.has(item)),
          );
          expect(new Set([...before].filter((item) => !after.has(item)))).toEqual(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});
