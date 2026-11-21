import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isLoadError } from "../src/errors.ts";
import type { ConversionMap } from "../src/manifest/types.ts";
import { compileMap } from "../src/maps/compile.ts";
import { Rational } from "../src/number/rational.ts";
import { readWorkspace, writeWorkspace } from "../src/workspace/file.ts";
import type { Store } from "../src/workspace/store.ts";
import { createStore } from "../src/workspace/store.ts";
import { createView } from "../src/workspace/view.ts";
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
    expect(store.dispatch({ type: "add", into: {}, block })).toBeNull();
  }
  for (let n = blocks; n < entries; n += 1) {
    const move = { target: { block: id(n % blocks) }, values: { x: n * 8, y: n * 4 } };
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
        changes: [{ target: { block: "0000000000" }, values: { x: moves, y: 0 } }],
      });
    }),
  };
}

describe("budgets", () => {
  it("opens 300 blocks with 1,000 entries within 300 ms, saves them within 250 ms, a command within 1 ms", () => {
    const { read, write, dispatch } = measure(300, 1000);
    // Opening validates every block's manifest through TimeToShare. Its 0.2.0 manifests gained
    // `resources`, named MatchStamps, provenance beliefs and a context of 35 terms, which every
    // manifest carries and every check reads: about 260 ms where 235 ms were measured before,
    // so the budget is that figure with the anchor index's margin of about 15 %.
    expect.soft(read, `readWorkspace took ${read} ms`).toBeLessThanOrEqual(300);
    expect.soft(write, `writeWorkspace took ${write} ms`).toBeLessThanOrEqual(250);
    expect.soft(dispatch, `dispatch took ${dispatch} ms`).toBeLessThanOrEqual(1);
  });

  it("measures opening and verifying 300 blocks with 1,000 entries", { timeout: 60_000 }, () => {
    const text = writeWorkspace(generated(300, 1000).snapshot());
    const open = fastest(() => {
      const read = readWorkspace(text);
      if (isLoadError(read)) throw new Error("the generated workspace is refused");
      createStore(read);
    });
    // Measured and reported, not yet held to a budget.
    console.info(`readWorkspace and createStore took ${open} ms`);
  });

  it("evaluates a PiecewiseMap of 10^5 breaks 1,000 times within 50 ms", () => {
    const breaks = 100_000;
    const map: ConversionMap = {
      type: "PiecewiseMap",
      id: "pieces",
      name: null,
      source_unit: "quarters",
      target_unit: "seconds",
      breaks: [0, 1, ...Array.from({ length: breaks - 2 }, (_, n) => n + 2)],
      maps: Array.from({ length: breaks - 1 }, (_, n) => ({
        type: "LinearMap",
        id: `piece_${n}`,
        name: null,
        source_unit: "quarters",
        target_unit: "seconds",
        scalar: [n + 1, 7],
        offset: [-n, 3],
      })),
    };
    const evaluator = compileMap(map, {});
    const positions = Array.from({ length: 1000 }, (_, n) =>
      Rational.fromParts(BigInt(n * 299_969 + 1), 3000n),
    );
    const evaluations = fastest(() => {
      for (const position of positions) {
        if (evaluator.evaluate(position) === undefined) throw new Error("outside the map");
      }
    });
    expect(evaluations, `1,000 evaluations took ${evaluations} ms`).toBeLessThanOrEqual(50);
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
