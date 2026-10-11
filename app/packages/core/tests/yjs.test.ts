import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { Manifest, ManifestCommand } from "../src/index.ts";
import { applyToManifest, isCommandError, saveManifest } from "../src/index.ts";
import { manifestMap, readManifest, syncManifest } from "../src/yjs/index.ts";
import { commandFor, sequenceArbitrary } from "./generate.ts";
import { load, manifestFixtures } from "./support.ts";

const BLOCK = "0000000000";
const ORIGIN = Symbol("test edit");
const names = manifestFixtures.map((fixture) => fixture.name);

function command(manifest: Manifest, seed: Parameters<typeof commandFor>[1]): ManifestCommand {
  return { block: BLOCK, ...commandFor(manifest, seed) } as ManifestCommand;
}

function create(manifest: Manifest): { ydoc: Y.Doc; root: Y.Map<unknown>; map: Y.Map<unknown> } {
  const ydoc = new Y.Doc();
  const root = ydoc.getMap<unknown>("root");
  const map = manifestMap(manifest);
  ydoc.transact(() => root.set("manifest", map));
  return { ydoc, root, map };
}

describe("manifestMap and readManifest", () => {
  it.each(names)("hold %s unchanged", (name) => {
    const manifest = load(name);
    expect(readManifest(create(manifest).map)).toEqual(manifest);
  });

  it.each(manifestFixtures.map((fixture) => [fixture.name, fixture.text]))(
    "save %s byte for byte",
    (name, text) => {
      expect(saveManifest(readManifest(create(load(name)).map))).toBe(text);
    },
  );
});

describe("syncManifest agrees with the reducer", () => {
  it.each(names)("from %s", (name) => {
    const start = load(name);
    fc.assert(
      fc.property(sequenceArbitrary, (seeds) => {
        const { ydoc, map } = create(start);
        let manifest = start;
        for (const seed of seeds) {
          const expected = applyToManifest(manifest, command(manifest, seed));
          if (!isCommandError(expected)) {
            ydoc.transact(() => syncManifest(map, expected), ORIGIN);
            manifest = expected;
          }
          const read = readManifest(map);
          expect(read).toEqual(manifest);
          expect(saveManifest(read)).toBe(saveManifest(manifest));
        }
      }),
      { numRuns: 15 },
    );
  });

  it("keeps unchanged nested maps by identity", () => {
    const manifest = load("nested.json");
    const { ydoc, map } = create(manifest);
    const timeline = map.get("timeline") as Y.Map<unknown>;
    const children = timeline.get("children") as Y.Map<unknown>;
    const changed = applyToManifest(manifest, {
      type: "setName",
      block: BLOCK,
      id: manifest.timeline.id,
      name: "changed",
    });
    if (isCommandError(changed)) throw new Error(changed.message);
    ydoc.transact(() => syncManifest(map, changed), ORIGIN);
    expect(map.get("timeline")).toBe(timeline);
    expect(timeline.get("children")).toBe(children);
  });
});

describe("caller-owned undo and redo", () => {
  it.each(names)("restore every intermediate manifest of %s", (name) => {
    const start = load(name);
    fc.assert(
      fc.property(sequenceArbitrary, (seeds) => {
        const { ydoc, root, map } = create(start);
        const undo = new Y.UndoManager(root, {
          trackedOrigins: new Set([ORIGIN]),
          captureTimeout: 0,
        });
        const states: Manifest[] = [start];
        for (const seed of seeds) {
          const current = states[states.length - 1] as Manifest;
          const next = applyToManifest(current, command(current, seed));
          if (isCommandError(next) || isDeepStrictEqual(next, current)) continue;
          ydoc.transact(() => syncManifest(map, next), ORIGIN);
          states.push(next);
        }
        const steps = states.length - 1;
        expect(undo.undoStack.length).toBe(steps);
        for (let k = 1; k <= steps; k += 1) {
          undo.undo();
          const restored = readManifest(map);
          expect(restored).toEqual(states[steps - k]);
          expect(saveManifest(restored)).toBe(saveManifest(states[steps - k] as Manifest));
        }
        for (let k = 1; k <= steps; k += 1) {
          undo.redo();
          const restored = readManifest(map);
          expect(restored).toEqual(states[k]);
          expect(saveManifest(restored)).toBe(saveManifest(states[k] as Manifest));
        }
      }),
      { numRuns: 15 },
    );
  });

  it("redoes removal of only the selected break", () => {
    const quarters = (value: number) => ({
      unit: "quarters" as const,
      number_type: "fraction" as const,
      value: [value, 1] as const,
    });
    const entry = (value: number) => ({
      coordinate: quarters(value),
      control_type: "section_break",
      condition: "always",
      repeat_count: 1,
      label: null,
      name: null,
      meta: {},
    });
    const ydoc = new Y.Doc();
    const root = ydoc.getMap<unknown>("root");
    const undo = new Y.UndoManager(root, {
      trackedOrigins: new Set([ORIGIN]),
      captureTimeout: 0,
    });
    const initial = load("bare.json");
    const map = manifestMap(initial);
    ydoc.transact(() => root.set("manifest", map), ORIGIN);
    let manifest = initial;
    const commands: ManifestCommand[] = [
      ...[1, 2, 3].map((value) => ({
        type: "addBreak" as const,
        block: BLOCK,
        timeline: initial.timeline.id,
        break: entry(value),
      })),
      {
        type: "removeBreak",
        block: BLOCK,
        timeline: initial.timeline.id,
        break: entry(2),
      },
    ];
    for (const item of commands) {
      const changed = applyToManifest(manifest, item);
      if (isCommandError(changed)) throw new Error(changed.message);
      ydoc.transact(() => syncManifest(map, changed), ORIGIN);
      manifest = changed;
    }
    const breaks = () => {
      const held = root.get("manifest") as Y.Map<unknown> | undefined;
      return held === undefined
        ? undefined
        : readManifest(held).timeline.flow_control.breaks.map(
            (item) => (item.coordinate.value as readonly number[])[0],
          );
    };
    expect(breaks()).toEqual([1, 3]);
    for (let step = 0; step < 5; step += 1) undo.undo();
    expect(breaks()).toBe(undefined);
    expect(
      [0, 1, 2, 3, 4].map(() => {
        undo.redo();
        return breaks();
      }),
    ).toEqual([[], [1], [1, 2], [1, 2, 3], [1, 3]]);
  });
});

describe("replicas converge", () => {
  it.each(names)("from %s", (name) => {
    const start = load(name);
    fc.assert(
      fc.property(sequenceArbitrary, sequenceArbitrary, (left, right) => {
        const one = create(start).ydoc;
        const two = new Y.Doc();
        Y.applyUpdate(two, Y.encodeStateAsUpdate(one));
        for (const [ydoc, seeds] of [
          [one, left],
          [two, right],
        ] as const) {
          const root = ydoc.getMap<unknown>("root");
          const map = root.get("manifest") as Y.Map<unknown>;
          for (const seed of seeds) {
            const current = readManifest(map);
            const changed = applyToManifest(current, command(current, seed));
            if (!isCommandError(changed)) ydoc.transact(() => syncManifest(map, changed), ORIGIN);
          }
        }
        Y.applyUpdate(one, Y.encodeStateAsUpdate(two));
        Y.applyUpdate(two, Y.encodeStateAsUpdate(one));
        const read = (ydoc: Y.Doc) =>
          readManifest(ydoc.getMap<unknown>("root").get("manifest") as Y.Map<unknown>);
        expect(read(one)).toEqual(read(two));
      }),
      { numRuns: 15 },
    );
  });
});
