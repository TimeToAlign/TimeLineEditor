/**
 * Minted IDs: the minter, held equal to timetoalign's by TimeToShare's
 * vectors, and the IDs a command carries; the cases are derived in
 * `README.md` ("Minted IDs").
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { parseCommand } from "../src/commands/parse.ts";
import { preview } from "../src/commands/preview.ts";
import type { Command } from "../src/commands/types.ts";
import { isCommandError } from "../src/errors.ts";
import { anchorIndexOf } from "../src/matches/anchors.ts";
import { matchClaimColumns } from "../src/matches/columns.ts";
import { Rational } from "../src/number/rational.ts";
import { manifestIds } from "../src/workspace/address.ts";
import { createIdMinter, ID_LENGTH, mix64 } from "../src/workspace/ids.ts";
import type { CommandEntry } from "../src/workspace/sessions.ts";
import { createStore } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import { A, block, deepFreeze, storeOf, viewOf } from "./support.ts";

/** TimeToShare's minted-ID vectors: every big number a decimal string. */
interface Vectors {
  readonly mix64: readonly { readonly input: string; readonly output: string }[];
  readonly minters: readonly {
    readonly seed: string;
    readonly length: number;
    readonly prefixes: readonly string[];
    readonly ids: readonly string[];
  }[];
  readonly later_ids: readonly {
    readonly seed: string;
    readonly length: number;
    readonly prefix: string;
    readonly counter: number;
    readonly id: string;
  }[];
}

const vectors = JSON.parse(
  readFileSync(
    createRequire(import.meta.url).resolve("@timetoalign/timetoshare/fixtures/ids/minted_ids.json"),
    "utf8",
  ),
) as Vectors;

/** The suffixes of the first four IDs a minter of seed 7 and length 13 mints. */
const SEVEN = ["1hvif5xc2r1fv", "0g2wfq87pa7jx", "12u94xeswial0", "154xnogdizwvv"];

const at = (id: string) => ({ block: A, id });
const view = deepFreeze(viewOf([A, "timestamps.yaml"]));
const CODA = { name: "Coda", coordinate: [15, 2] };
const coda = (ids?: readonly string[]): object => ({
  type: "add",
  into: at("clt_1"),
  timestamp: CODA,
  ...(ids === undefined ? {} : { ids }),
});

/** The IDs of the named timestamps of block `A`. */
const timestampIds = (state: View) =>
  (block(state).manifest.graphical?.timestamps ?? []).map((item) => item.id);

/** A refusal's code, message and path. */
function refused(result: unknown) {
  if (!isCommandError(result)) throw new Error("expected a refusal");
  return { code: result.code, message: result.message, path: result.path };
}

function accepted(result: View | { readonly code: string; readonly message: string }): View {
  if ("code" in result) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

describe("the minter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives every output of the shared vectors' mix64", () => {
    expect(vectors.mix64).toHaveLength(7);
    for (const { input, output } of vectors.mix64) {
      expect(mix64(BigInt(input)).toString()).toBe(output);
    }
  });

  it("mints every ID of the shared vectors, one counter for every prefix", () => {
    expect(vectors.minters).toHaveLength(18);
    for (const { seed, length, prefixes, ids } of vectors.minters) {
      const minter = createIdMinter({ seed: BigInt(seed), length });
      expect(prefixes.map((prefix) => minter.mint(prefix))).toEqual(ids);
    }
    expect(vectors.later_ids).toHaveLength(3);
    for (const { seed, length, prefix, counter, id } of vectors.later_ids) {
      const minter = createIdMinter({ seed: BigInt(seed), length });
      for (let k = 1; k < counter; k += 1) minter.mint(prefix);
      expect(minter.mint(prefix)).toBe(id);
    }
  });

  it("takes its seed modulo 2^64 and its length from 1 to 13, 13 by default", () => {
    const minter = createIdMinter({ seed: 7n });
    expect([minter.seed, minter.length, ID_LENGTH]).toEqual([7n, 13, 13]);
    expect(["timestamp", "clt", "group"].map((prefix) => minter.mint(prefix))).toEqual([
      `timestamp_${SEVEN[0]}`,
      `clt_${SEVEN[1]}`,
      `group_${SEVEN[2]}`,
    ]);
    const wrapped = createIdMinter({ seed: -1n });
    expect(wrapped.seed).toBe(18446744073709551615n);
    expect(wrapped.mint("note")).toBe(createIdMinter({ seed: 2n ** 64n - 1n }).mint("note"));
    expect(createIdMinter({ seed: 7n, length: 1 }).mint("x")).toBe(`x_${SEVEN[0]?.at(-1)}`);
    for (const length of [0, 14, 2.5]) {
      expect(() => createIdMinter({ length })).toThrow(RangeError);
    }
  });

  it("draws 64 random bits, big-endian, where no seed is given", () => {
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation((bytes) => {
      if (!(bytes instanceof Uint8Array)) throw new Error("bytes");
      bytes.set([1, 2, 3, 4, 5, 6, 7, 8]);
      return bytes;
    });
    expect(createIdMinter().seed).toBe(0x0102030405060708n);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("the IDs a command carries", () => {
  it("are read as a list of IDs on every command, an empty list dropped", () => {
    const read = (ids: unknown) => parseCommand({ ...coda(), ids });
    expect(read(["coda"])).toEqual({ ...coda(), ids: ["coda"] });
    expect(read([])).toEqual(coda());
    const remove = { type: "remove", targets: [at("timestamp_1")], ids: ["x"] };
    const style = { type: "style", select: { element: "timeline" }, set: {}, ids: ["x"] };
    for (const command of [remove, style]) {
      const parsed = parseCommand(command);
      expect(isCommandError(parsed) ? parsed : parsed.ids).toEqual(["x"]);
    }
    const cases: [unknown, string, (string | number)[]][] = [
      ["coda", "ids is a list of IDs", ["ids"]],
      [["coda", ""], "an ID is a non-empty string without control characters", ["ids", 1]],
      [["a\u0001b"], "an ID is a non-empty string without control characters", ["ids", 0]],
      [[3], "an ID is a non-empty string without control characters", ["ids", 0]],
      [["coda", "end", "coda"], "ids lists 'coda' twice", ["ids", 2]],
    ];
    for (const [ids, message, path] of cases) {
      expect(refused(read(ids))).toEqual({ code: "invalid_command", message, path });
    }
  });

  it("give what a command creates its IDs, and nothing else does without a minter", () => {
    expect(timestampIds(accepted(apply(view, coda(["coda"]))))).toEqual([
      "timestamp_1",
      "timestamp_2",
      "coda",
      "timestamp_3",
    ]);
    expect(refused(apply(view, coda()))).toEqual({
      code: "invalid_command",
      message: "the command creates more elements than the 0 IDs it lists",
      path: ["ids"],
    });
    expect(refused(apply(view, coda(["coda", "extra"])))).toEqual({
      code: "invalid_command",
      message: "the command creates 1 of the 2 IDs it lists",
      path: ["ids", 1],
    });
  });

  it("are followed by those a minter gives, where the caller gives one", () => {
    const minted = accepted(apply(view, coda(), createIdMinter({ seed: 7n })));
    expect(timestampIds(minted)[2]).toBe(`timestamp_${SEVEN[0]}`);
    const given = accepted(apply(view, coda(["coda"]), createIdMinter({ seed: 7n })));
    expect(timestampIds(given)[2]).toBe("coda");
    const group = { type: "add", into: { block: A }, group: { members: ["clt_1"] } };
    const grouped = accepted(apply(view, group, createIdMinter({ seed: 7n })));
    expect(block(grouped).manifest.groups.map((item) => item.id)).toEqual([`group_${SEVEN[0]}`]);
    const named = accepted(apply(view, { ...group, group: { id: "g", members: [] } }));
    expect(block(named).manifest.groups.map((item) => item.id)).toEqual(["g"]);
  });

  it("are minted afresh by a preview, as the store would mint them", () => {
    const shown = preview(view, coda() as Command);
    const ids = isCommandError(shown) ? [] : timestampIds(shown);
    expect(ids).toHaveLength(4);
    const fresh = ids[2] ?? "";
    expect(manifestIds(block(view).manifest).has(fresh)).toBe(false);
    expect(block(isCommandError(shown) ? view : shown).manifest.graphical?.timestamps?.[2]).toEqual(
      {
        id: fresh,
        timeline: "clt_1",
        coordinate: [15, 2],
        name: "Coda",
        display: ["wedge", "name", "cross_section"],
        matchstamp: false,
        groupstamp: false,
      },
    );
  });
});

describe("the store", () => {
  /** The command of the journal's last entry. */
  const last = (journal: readonly unknown[]) => (journal.at(-1) as CommandEntry).command;

  it("journals every ID it took, given first, so a replay mints nothing", () => {
    const store = storeOf(view, { minter: createIdMinter({ seed: 7n }) });
    expect(store.dispatch(coda())).toBeNull();
    expect(last(store.journal)).toEqual({ ...coda(), ids: [`timestamp_${SEVEN[0]}`] });
    expect(timestampIds(store.view)[2]).toBe(`timestamp_${SEVEN[0]}`);
    const named = {
      type: "add",
      into: { block: A },
      matchstamp: {
        name: "Arrival",
        anchors: [
          [
            { timeline: "clt_1", coordinate: [1, 1] },
            { timeline: "clt_2", coordinate: [1, 1] },
          ],
        ],
        match_claims: ["claim_1"],
      },
      ids: ["arrival"],
    };
    expect(store.dispatch(named)).toBeNull();
    // The MatchStamp's ID given; its two match timestamps' and its anchor's minted, in that order.
    expect(last(store.journal).ids).toEqual([
      "arrival",
      `timestamp_${SEVEN[1]}`,
      `timestamp_${SEVEN[2]}`,
      `anchor_${SEVEN[3]}`,
    ]);
    expect(
      store.dispatch({ type: "set", changes: [{ target: at("clt_1"), values: { name: "C" } }] }),
    ).toBeNull();
    expect(last(store.journal)).not.toHaveProperty("ids");
    const workspace = store.snapshot();
    const again = createStore(workspace, { minter: createIdMinter({ seed: 8n }) });
    expect(again.view).toBe(workspace.view);
    expect(again.journal).toEqual(workspace.journal);
  });

  it("keeps the IDs a command gives, minting none", () => {
    const store = storeOf(view, { minter: createIdMinter({ seed: 7n }) });
    expect(store.dispatch(coda(["coda"]))).toBeNull();
    expect(last(store.journal)).toEqual({ ...coda(), ids: ["coda"] });
    expect(store.dispatch(coda(["coda-2", "extra"]))).toEqual({
      code: "invalid_command",
      message: "the command creates 1 of the 2 IDs it lists",
      path: ["ids", 1],
    });
  });
});

describe("a removed timeline the MatchClaim table names", () => {
  it("leaves the rows naming no timeline, and no new timeline takes its ID", () => {
    const columns = matchClaimColumns(
      [
        { id: "clt_2", numberType: "fraction" },
        { id: "clt_3", numberType: "fraction" },
      ],
      [{ id: "claim_1", timelines: [0, 1], start: [Rational.of(1n), Rational.of(2n)] }],
    );
    const store = storeOf(viewOf([A, "nested.yaml"]), { minter: createIdMinter({ seed: 7n }) });
    expect(store.dispatch({ type: "remove", targets: [at("clt_3")] })).toBeNull();
    const line = {
      type: "set",
      changes: [{ target: at("clt_1"), values: { is_segment_line: true } }],
    };
    expect(store.dispatch(line)).toBeNull();
    const { manifest } = block(store.view);
    expect(manifest.timelines[0]?.children.map((child) => child.id)).toEqual([`clt_${SEVEN[0]}`]);
    const ids = manifestIds(manifest);
    expect(columns.timelines.map(({ id }) => [id, ids.has(id)])).toEqual([
      ["clt_2", false],
      ["clt_3", false],
    ]);
    expect(columns.claimIds).toEqual(["claim_1"]);
    expect(anchorIndexOf(columns).coordinates.count).toBe(2);
  });
});
