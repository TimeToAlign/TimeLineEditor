import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { isCommandError, isLoadError } from "../src/errors.ts";
import { loadManifest, saveManifest } from "../src/manifest/io.ts";
import { readWorkspace, writeWorkspace } from "../src/workspace/file.ts";
import type { ListedEntry } from "../src/workspace/sessions.ts";
import { isSessionEntry } from "../src/workspace/sessions.ts";
import type { Store, Workspace } from "../src/workspace/store.ts";
import { createStore, replay } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import { checkWorkspace, createView } from "../src/workspace/view.ts";
import type { Seed, Step } from "./generate.ts";
import { commandFor, commandIn, editorFor, sequenceArbitrary, stepsArbitrary } from "./generate.ts";
import { A, addBlock, allFixtures, B, changed, loadText, testClock } from "./support.ts";

const BLOCKS = [A, B];

/** Every manifest the sequences start from: the package's fixtures. */
const SOURCES: readonly (readonly [string, string])[] = allFixtures.map(
  (fixture) => [fixture.name, fixture.text] as const,
);

/** The `add` of block `A` holding the manifest of `text`. */
const addText = (text: string) => ({
  type: "add",
  into: "workspace",
  block: { id: A, manifest: loadText(text), x: 0, y: 0 },
});

function started(text: string): Store {
  const store = createStore(
    { view: createView(), journal: [], sessions: {} },
    { clock: testClock() },
  );
  for (const command of [addText(text), addBlock(B, "bare.json")]) {
    expect(store.dispatch(command)).toBeNull();
  }
  return store;
}

const time = (call: number) => new Date(Date.UTC(2026, 9, 11, 14, 3, 12 + call, 418)).toISOString();

describe("generated command sequences", () => {
  it.each(SOURCES)("keep every invariant from %s", (_, source) => {
    fc.assert(
      fc.property(sequenceArbitrary, (seeds) => {
        const store = started(source);
        const views: View[] = [store.view];
        for (const seed of seeds) {
          const before = store.view;
          const refused = store.dispatch(commandFor(before, BLOCKS, seed));
          if (refused !== null) {
            expect(store.view).toBe(before);
            continue;
          }
          const view = store.view;
          expect(checkWorkspace(view)).toEqual([]);
          for (const block of Object.values(view.blocks)) {
            const text = saveManifest(block.manifest);
            const loaded = loadManifest(text);
            expect(loaded).toEqual(block.manifest);
            if (!isLoadError(loaded)) expect(saveManifest(loaded)).toBe(text);
          }
          views.push(view);
        }
        const { journal } = store;
        expect(journal.map(({ author, time: at }) => [author, at])).toEqual(
          journal.map((_, index) => ["Gerhardt", time(index)]),
        );
        const replayed = replay(journal, {}).at(-1);
        if (replayed === undefined) throw new Error("a replay holds the empty view at least");
        expect(replayed.settings).toEqual(store.view.settings);
        expect(replayed.blocks).toEqual(store.view.blocks);
        const text = writeWorkspace({ view: store.view, journal, sessions: {} });
        const read = readWorkspace(text);
        expect(read).toEqual({ view: store.view, journal, sessions: {} });
        if (!isLoadError(read)) expect(writeWorkspace(read)).toBe(text);
        const last = views.length - 1;
        for (let k = last - 1; k >= 0; k -= 1) {
          store.undo();
          expect(store.view).toBe(views[k]);
        }
        for (let k = 1; k <= last; k += 1) {
          store.redo();
          expect(store.view).toBe(views[k]);
        }
      }),
      { numRuns: 10 },
    );
  });
});

/** Open the editor of a generated target, or reopen the latest session of the innermost level; whether it opened. */
function open(store: Store, reopen: boolean, seed: Seed): boolean {
  const latest = store.entries.findLast(isSessionEntry);
  const target =
    reopen && latest !== undefined
      ? (store.sessions[latest.session]?.target as string)
      : editorFor(store.view, BLOCKS, store.editing.at(-1)?.target ?? null, seed);
  return store.open(target) === null;
}

/** Dispatch a generated command in the innermost open editor; whether it was accepted. */
const command = (store: Store, seed: Seed): boolean =>
  store.dispatch(commandIn(store.view, BLOCKS, store.editing.at(-1)?.target ?? null, seed)) ===
  null;

/** What the store holds at an opening, which Cancel gives back. */
interface Opening {
  readonly view: View;
  readonly journal: Store["journal"];
  readonly sessions: Store["sessions"];
  readonly listed: Store["listed"];
}

/**
 * Run one step of an editing sequence; whether it changed the store. A
 * session opens an editor, makes one or two commands in it and closes it
 * with Done; an unfold reopens the latest session of the innermost level,
 * undoes until nothing is left to undo or one step, and closes it with
 * Done. A step that changes nothing leaves the view and the editing path
 * the same objects. `openings` holds what the store held at each open
 * editor's opening, outermost first: an open pushes it, Done pops it, and
 * Cancel pops it and finds the store exactly as it was.
 */
function run(store: Store, { operation, seed }: Step, openings: Opening[]): boolean {
  const before = store.view;
  const editing = store.editing;
  let changed: boolean;
  if (operation === "command") changed = command(store, seed);
  else if (operation === "open" || operation === "reopen") {
    const { journal, sessions, listed } = store;
    changed = open(store, operation === "reopen", seed);
    if (changed) openings.push({ view: before, journal, sessions, listed });
  } else if (operation === "session") {
    changed = open(store, false, seed);
    if (changed) {
      const [first = 0, second = 0] = seed.picks;
      command(store, { kind: seed.kind, picks: seed.picks.map((pick) => pick + first) });
      if (second % 2 === 0) {
        command(store, { kind: seed.kind, picks: seed.picks.map((pick) => pick + second) });
      }
      store.done();
    }
  } else if (operation === "unfold") {
    changed = open(store, true, seed);
    if (changed) {
      if ((seed.picks[0] ?? 0) % 2 === 0) while (store.canUndo) store.undo();
      else store.undo();
      store.done();
    }
  } else {
    changed =
      operation === "undo"
        ? store.canUndo
        : operation === "redo"
          ? store.canRedo
          : editing.length > 0;
    store[operation]();
    if (changed && (operation === "done" || operation === "cancel")) {
      const opening = openings.pop();
      if (opening === undefined) throw new Error("a closed editor was opened");
      if (operation === "cancel") {
        expect(store.view).toBe(opening.view);
        expect(store.journal).toEqual(opening.journal);
        expect(store.sessions).toEqual(opening.sessions);
        expect(store.listed).toEqual(opening.listed);
      }
    }
  }
  if (!changed) {
    expect(store.view).toBe(before);
    expect(store.editing).toBe(editing);
  }
  return changed;
}

/**
 * No session entry in `listed`, at any depth, holds two adjacent commands of
 * which one is applied and the other undone: a closed session's run is
 * applied or undone whole. The level's own entries are not checked.
 */
function keepsRuns(listed: readonly ListedEntry[]): void {
  for (const item of listed) {
    const { children } = item;
    for (const [index, child] of children.entries()) {
      const next = children[index + 1];
      if (next === undefined || isSessionEntry(child.entry) || isSessionEntry(next.entry)) continue;
      expect([child.applied, next.applied]).not.toEqual([1, 0]);
    }
    keepsRuns(children);
  }
}

/** The journal of `store`, every open editor folded, replays to its view. */
function replaysToView(store: Store): Workspace {
  const snapshot = store.snapshot();
  expect(replay(snapshot.journal, snapshot.sessions).at(-1)).toEqual(snapshot.view);
  return snapshot;
}

describe("generated editing sequences", () => {
  it.each(SOURCES)("keep the journal replaying to the view from %s", (_, source) => {
    fc.assert(
      fc.property(stepsArbitrary, (steps) => {
        const store = started(source);
        const openings: Opening[] = [];
        for (const step of steps) {
          if (!run(store, step, openings)) continue;
          keepsRuns(store.listed);
          const snapshot = replaysToView(store);
          expect(readWorkspace(writeWorkspace(snapshot))).toEqual(snapshot);
          // What redo would bring back replays too: redo it all step by step,
          // then undo as many steps, which redo mirrors.
          const left = store.view;
          let steps = 0;
          for (; store.canRedo; steps += 1) store.redo();
          if (steps === 0) continue;
          replaysToView(store);
          for (let count = 0; count < steps; count += 1) store.undo();
          expect(store.view).toBe(left);
        }
      }),
      { numRuns: 10 },
    );
  });
});

/** The catalogue's sample takes 9.8 to 10.7 s on a loaded machine (tests/README.md, Properties 7). */
const CATALOGUE_TIMEOUT = 32_000;

describe("the generator reaches the refusal catalogue", () => {
  it("over every manifest", { timeout: CATALOGUE_TIMEOUT }, () => {
    const seen = new Set<string>();
    for (const [, source] of SOURCES) {
      const start = changed(changed(createView(), addText(source)), addBlock(B, "bare.json"));
      for (const seeds of fc.sample(sequenceArbitrary, { numRuns: 150, seed: 20261011 })) {
        let view = start;
        for (const seed of seeds) {
          const result = apply(view, commandFor(view, BLOCKS, seed));
          if (isCommandError(result)) seen.add(result.code);
          else view = result;
        }
      }
    }
    expect([...seen].sort()).toEqual(
      [
        "already_member",
        "child_exceeds_parent",
        "cycle",
        "duplicate_id",
        "duplicate_index",
        "id_not_settable",
        "invalid_address",
        "invalid_coordinate",
        "invalid_index",
        "invalid_order",
        "invalid_value",
        "length_below_content",
        "locked",
        "negative_child_offset",
        "nested_member",
        "non_finite_number",
        "non_positive_number",
        "not_an_item",
        "not_removable",
        "number_type_not_allowed",
        "region_end_before_start",
        "schema_violation",
        "segment_end_fixed",
        "segment_never_locked",
        "segment_not_removable",
        "segment_structure",
        "unit_mismatch",
        "unknown_property",
        "unknown_target",
        "unlocking_not_supported",
        "wrong_target_kind",
      ].sort(),
    );
  });
});
