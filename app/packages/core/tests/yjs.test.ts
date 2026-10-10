import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { Command, Document } from "../src/index.ts";
import { apply, isCommandError, isLoadError, loadDocument, saveDocument } from "../src/index.ts";
import { applyCommand, createUndoManager, createYDoc, toDocument } from "../src/yjs/index.ts";
import { commandFor, sequenceArbitrary } from "./generate.ts";
import { goldenFixtures, load } from "./support.ts";

const names = goldenFixtures.map((fixture) => fixture.name);

describe("createYDoc and toDocument", () => {
  it.each(names)("hold %s unchanged", (name) => {
    const document = load(name);
    expect(toDocument(createYDoc(document))).toEqual(document);
  });

  it.each(goldenFixtures.map((fixture) => [fixture.name, fixture.text]))(
    "save %s byte for byte",
    (_, text) => {
      const document = loadDocument(text);
      if (isLoadError(document)) throw new Error(JSON.stringify(document.problems));
      expect(saveDocument(toDocument(createYDoc(document)))).toBe(text);
    },
  );
});

describe("applyCommand agrees with the reducer", () => {
  it.each(names)("from %s", (name) => {
    const start = load(name);
    fc.assert(
      fc.property(sequenceArbitrary, (seeds) => {
        const ydoc = createYDoc(start);
        let document: Document = start;
        for (const seed of seeds) {
          const command = commandFor(document, seed) as Command;
          const expected = apply(document, command);
          const refusal = applyCommand(ydoc, command);
          expect(refusal).toEqual(isCommandError(expected) ? expected : undefined);
          if (!isCommandError(expected)) document = expected;
          const materialized = toDocument(ydoc);
          expect(materialized).toEqual(document);
          expect(saveDocument(materialized)).toBe(saveDocument(document));
        }
      }),
      { numRuns: 15 },
    );
  });
});

describe("undo and redo", () => {
  it.each(names)("restore every intermediate document of %s", (name) => {
    const start = load(name);
    fc.assert(
      fc.property(sequenceArbitrary, (seeds) => {
        const ydoc = createYDoc(start);
        const undo = createUndoManager(ydoc);
        const states: Document[] = [start];
        for (const seed of seeds) {
          const current = states[states.length - 1] as Document;
          applyCommand(ydoc, commandFor(current, seed) as Command);
          const next = toDocument(ydoc);
          if (!isDeepStrictEqual(next, current)) states.push(next);
        }
        const steps = states.length - 1;
        expect(undo.undoStack.length).toBe(steps);
        for (let k = 1; k <= steps; k += 1) {
          undo.undo();
          const restored = toDocument(ydoc);
          expect(restored).toEqual(states[steps - k]);
          expect(saveDocument(restored)).toBe(saveDocument(states[steps - k] as Document));
        }
        for (let k = 1; k <= steps; k += 1) {
          undo.redo();
          const restored = toDocument(ydoc);
          expect(restored).toEqual(states[k]);
          expect(saveDocument(restored)).toBe(saveDocument(states[k] as Document));
        }
      }),
      { numRuns: 15 },
    );
  });
});

describe("undo and redo of flow control inside a created timeline", () => {
  it("redoing the removal of one of three breaks removes only that break", () => {
    const quarters = (value: number) => ({
      unit: "quarters",
      number_type: "fraction",
      value: [value, 1],
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
    const ydoc = createYDoc(load("empty.json"));
    const undo = createUndoManager(ydoc);
    const commands = [
      {
        type: "createTimeline",
        id: "a",
        class: "ContinuousLogicalTimeline",
        unit: "quarters",
        number_type: "fraction",
        length: quarters(8),
      },
      ...[1, 2, 3].map((value) => ({ type: "addBreak", timeline: "a", break: entry(value) })),
      { type: "removeBreak", timeline: "a", break: entry(2) },
    ];
    for (const command of commands) expect(applyCommand(ydoc, command as Command)).toBe(undefined);
    const breaks = () =>
      toDocument(ydoc).manifest.timelines.a?.flow_control.breaks.map(
        (item) => (item.coordinate.value as readonly number[])[0],
      );
    expect(breaks()).toEqual([1, 3]);
    for (let step = 0; step < commands.length; step += 1) undo.undo();
    expect(breaks()).toBe(undefined);
    const forward = commands.map(() => {
      undo.redo();
      return breaks();
    });
    expect(forward).toEqual([[], [1], [1, 2], [1, 2, 3], [1, 3]]);
  });
});

describe("replicas converge", () => {
  it.each(names)("from %s", (name) => {
    const start = load(name);
    fc.assert(
      fc.property(sequenceArbitrary, sequenceArbitrary, (left, right) => {
        const one = createYDoc(start);
        const two = new Y.Doc();
        Y.applyUpdate(two, Y.encodeStateAsUpdate(one));
        for (const [ydoc, seeds] of [
          [one, left],
          [two, right],
        ] as const) {
          for (const seed of seeds)
            applyCommand(ydoc, commandFor(toDocument(ydoc), seed) as Command);
        }
        Y.applyUpdate(one, Y.encodeStateAsUpdate(two));
        Y.applyUpdate(two, Y.encodeStateAsUpdate(one));
        expect(toDocument(one)).toEqual(toDocument(two));
      }),
      { numRuns: 15 },
    );
  });
});
