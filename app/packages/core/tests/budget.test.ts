import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Store } from "../src/index.ts";
import {
  createStore,
  createView,
  isLoadError,
  readWorkspace,
  writeWorkspace,
} from "../src/index.ts";
import { allFixtures, loadText, testClock } from "./support.ts";

/** A store of `blocks` blocks (the fixtures of one root in turn) whose journal holds `entries` entries. */
function generated(blocks: number, entries: number): Store {
  const store = createStore(
    { view: createView(), journal: [], sessions: {} },
    { clock: testClock() },
  );
  const manifests = allFixtures
    .filter((fixture) => !fixture.name.includes("/"))
    .map((fixture) => loadText(fixture.text, fixture.name));
  const id = (n: number) => n.toString(36).padStart(10, "0");
  for (let n = 0; n < blocks; n += 1) {
    const manifest = manifests[n % manifests.length];
    const block = { id: id(n), manifest, x: (n % 20) * 480, y: Math.floor(n / 20) * 160 };
    expect(store.dispatch({ type: "add", into: "workspace", block })).toBeNull();
  }
  for (let n = blocks; n < entries; n += 1) {
    const move = { target: id(n % blocks), values: { x: n * 8, y: n * 4 } };
    expect(store.dispatch({ type: "set", changes: [move] })).toBeNull();
  }
  return store;
}

/**
 * The shortest duration of `run` in milliseconds over 5 runs after one
 * warm-up run: the cost of the code, not of whatever else the machine runs.
 */
function fastest(run: () => void): number {
  run();
  const times: number[] = [];
  for (let n = 0; n < 5; n += 1) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return Math.min(...times);
}

function measure(blocks: number, entries: number) {
  const store = generated(blocks, entries);
  const workspace = store.snapshot();
  const text = writeWorkspace(workspace);
  let moves = 0;
  return {
    megabytes: new TextEncoder().encode(text).length / 1e6,
    read: fastest(() => {
      if (isLoadError(readWorkspace(text))) throw new Error("the generated workspace is refused");
    }),
    write: fastest(() => writeWorkspace(workspace)),
    dispatch: fastest(() => {
      moves += 1;
      store.dispatch({
        type: "set",
        changes: [{ target: "0000000000", values: { x: moves, y: 0 } }],
      });
    }),
  };
}

describe("budgets", () => {
  it("opens and saves 300 blocks with 1,000 entries within 250 ms, a command within 1 ms", () => {
    const { read, write, dispatch } = measure(300, 1000);
    expect(read, `readWorkspace took ${read} ms`).toBeLessThanOrEqual(250);
    expect(write, `writeWorkspace took ${write} ms`).toBeLessThanOrEqual(250);
    expect(dispatch, `dispatch took ${dispatch} ms`).toBeLessThanOrEqual(1);
  });

  const output = process.env.TILIE_MEASURE;
  it.runIf(output !== undefined)(
    "measures 300 and 10,000 blocks into a file",
    () => {
      const figures = { 300: measure(300, 1000), 10000: measure(10000, 10000) };
      writeFileSync(output as string, `${JSON.stringify(figures, null, 2)}\n`);
    },
    1_200_000,
  );
});
