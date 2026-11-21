/** Provenance on demand and the user's belief in the Matchstamp tab; derived in `README.md` ("MatchClaims and the Matchstamp tab", items 10 and 11). */

import { liveStore } from "@timetoalign/tilie-arranger";
import type { ClaimProvenance, MatchClaimTable, StatedBelief } from "@timetoalign/tilie-client";
import { ServerError } from "@timetoalign/tilie-client";
import type { AnchorIndex, Store } from "@timetoalign/tilie-core";
import { coordinateOf, DEFAULT_MATCH_CLAIM_FILTER, saveManifest } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import MatchstampPanel from "../src/inspector/MatchstampPanel.svelte";
import { matchIndexes } from "../src/inspector/matchstamps.ts";
import type { HeldMatch } from "../src/inspector/tabs.ts";
import type { MatchClaimServer } from "../src/matchClaims.svelte.ts";
import { MatchClaimTables } from "../src/matchClaims.svelte.ts";
import { informContext } from "../src/messages.svelte.ts";
import { BELIEFS_BY_ROW, ME, matchTable, OTHER, q, tableManifest } from "./matches.ts";
import { storeOf } from "./support.ts";

const A = "0000000000";
const NAME = "match_claims.parquet";
const SERVICE = "https://example.org/aligner";
const PICKED = new Blob([Uint8Array.of(80, 65, 82, 49, 1, 80, 65, 82, 49)]);
const ANSWERED = new Blob([Uint8Array.of(80, 65, 82, 49, 2, 3, 80, 65, 82, 49)], {
  type: "application/vnd.apache.parquet",
});

/** The provenance the stubbed server holds, by MatchClaim. */
const PROVENANCE: Readonly<Record<string, ClaimProvenance["provenance"]>> = {
  claim_1: { date: "2026-11-20", method: "imported", service: SERVICE },
  claim_2: null,
  claim_4: {
    beliefs: [{ actor: OTHER, belief: "true", date: "2026-11-21", note: "seen in the score" }],
  },
};

/** The table the server answers after the user's `false` in `claim_2`. */
const believedTable = () => matchTable([[], [[ME, "false"]], ...BELIEFS_BY_ROW.slice(2)]);

let mounted: ReturnType<typeof mount> | null = null;

afterEach(() => {
  if (mounted !== null) unmount(mounted);
  mounted = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface Calls {
  readonly provenance: [string, Blob, string[]][];
  readonly beliefs: [string, Blob, StatedBelief][];
  readonly tables: [string, Blob][];
}

/** A server stub recording every call; `provenance` and `believe` answer as given. */
function serving(
  options: {
    provenance?: (claims: readonly string[]) => Promise<readonly ClaimProvenance[]>;
    believe?: () => Promise<Blob>;
    table?: MatchClaimTable;
  } = {},
) {
  const calls: Calls = { provenance: [], beliefs: [], tables: [] };
  const server: MatchClaimServer = {
    matchClaims: async (manifest, file) => {
      calls.tables.push([manifest, file]);
      return options.table ?? believedTable();
    },
    matchClaimProvenance: async (manifest, file, claims) => {
      calls.provenance.push([manifest, file, [...claims]]);
      if (options.provenance !== undefined) return options.provenance(claims);
      return claims.map((id) => ({ id, provenance: PROVENANCE[id] ?? null }));
    },
    believeMatchClaim: async (manifest, file, belief) => {
      calls.beliefs.push([manifest, file, belief]);
      return options.believe === undefined ? ANSWERED : options.believe();
    },
  };
  return { server, calls };
}

/** Block A's table `table`, picked from `PICKED`, read through `server`. */
function tablesOf(server: MatchClaimServer | null, table = matchTable()): MatchClaimTables {
  const tables = new MatchClaimTables(server);
  tables.hold(A, { name: NAME, table, file: PICKED, changed: false });
  return tables;
}

function potential(
  index: AnchorIndex,
  timeline: string,
  value: Parameters<typeof coordinateOf>[2],
) {
  const coordinate = coordinateOf(index, timeline, value);
  return {
    kind: "potential" as const,
    block: A,
    index,
    matchStamp: index.matchStamps.of[coordinate] as number,
  };
}

/** Mount the tab on `store` showing `match`; reported MatchStamps and messages are collected. */
function show(store: Store, match: HeldMatch | null, tables: MatchClaimTables) {
  const reported: (HeldMatch | null)[] = [];
  const informed: string[] = [];
  const warned: string[] = [];
  mounted = mount(MatchstampPanel, {
    target: document.body,
    context: informContext(
      (said) => void informed.push(said),
      (said) => void warned.push(said),
    ),
    props: {
      live: liveStore(store),
      block: store.view.blocks[A] ?? null,
      match,
      tables,
      believer: ME,
      onmatch: (next: HeldMatch | null) => {
        reported.push(next);
      },
    },
  });
  flushSync();
  return { reported, informed, warned };
}

function remount(): void {
  if (mounted !== null) unmount(mounted);
  mounted = null;
  document.body.innerHTML = "";
}

function claimItem(id: string): Element {
  const item = document.querySelector(`li[data-claim='${id}']`);
  if (item === null) throw new Error(`no MatchClaim ${id}`);
  return item;
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? null;

function paradata(id: string): string[][] {
  const terms = [...claimItem(id).querySelectorAll(".paradata dt")];
  return terms.map((term) => [text(term) ?? "", text(term.nextElementSibling) ?? ""]);
}

function beliefButton(id: string, label: string): HTMLButtonElement {
  const found = [...claimItem(id).querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  );
  if (found === undefined) throw new Error(`no button ${label} for ${id}`);
  return found;
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label,
  );
}

const shownOf = (table: MatchClaimTable) =>
  matchIndexes(table, DEFAULT_MATCH_CLAIM_FILTER, ME).shown;

/** Let the pending promises settle, then flush the tab. */
async function settled(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  flushSync();
}

describe("provenance on demand", () => {
  it("asks for the MatchStamp's MatchClaims only and shows their paradata", async () => {
    const store = storeOf(tableManifest());
    let answer: (read: readonly ClaimProvenance[]) => void = () => undefined;
    const { server, calls } = serving({
      provenance: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });
    const tables = tablesOf(server);
    show(store, potential(shownOf(matchTable()), "clt_1", q(0)), tables);

    expect(calls.provenance).toEqual([
      [saveManifest(tableManifest()), PICKED, ["claim_1", "claim_2"]],
    ]);
    expect(text(claimItem("claim_1").querySelector("[role=status]"))).toBe(
      "Reading the provenance…",
    );

    answer([
      { id: "claim_1", provenance: PROVENANCE.claim_1 ?? null },
      { id: "claim_2", provenance: null },
    ]);
    await settled();
    expect(paradata("claim_1")).toEqual([
      ["Date", "2026-11-20"],
      ["Method", "imported"],
      ["Service", SERVICE],
    ]);
    expect(paradata("claim_2")).toEqual([]);
    expect(text(claimItem("claim_2").querySelector(".no-provenance"))).toBe(
      "No provenance entry: the table states none for it.",
    );
  });

  it("gives each belief its date and note", async () => {
    const store = storeOf(tableManifest());
    const { server, calls } = serving();
    show(store, potential(shownOf(matchTable()), "clt_1", q(4)), tablesOf(server));
    await settled();
    expect(calls.provenance.map(([, , claims]) => claims)).toEqual([["claim_4"]]);
    expect(text(claimItem("claim_4").querySelector(".beliefs"))).toBe(
      "tag:example.org,2026:other: true, 2026-11-21 “seen in the score”",
    );
  });

  it("asks once per table and MatchClaims, again after a failure", async () => {
    const store = storeOf(tableManifest());
    let refuse = true;
    const { server, calls } = serving({
      provenance: async (claims) => {
        if (refuse) throw new ServerError("status", 500, "500 Internal Server Error");
        return claims.map((id) => ({ id, provenance: PROVENANCE[id] ?? null }));
      },
    });
    const tables = tablesOf(server);
    const match = potential(shownOf(matchTable()), "clt_1", q(0));
    show(store, match, tables);
    await settled();
    expect(text(claimItem("claim_1").querySelector(".problem"))).toBe(
      "The provenance could not be read: 500 Internal Server Error",
    );

    refuse = false;
    remount();
    show(store, match, tables);
    await settled();
    expect(paradata("claim_1")).toEqual([
      ["Date", "2026-11-20"],
      ["Method", "imported"],
      ["Service", SERVICE],
    ]);
    remount();
    show(store, match, tables);
    await settled();
    expect(calls.provenance.length).toBe(2);
  });

  it("asks nothing without a server", () => {
    const store = storeOf(tableManifest());
    show(store, potential(shownOf(matchTable()), "clt_1", q(0)), tablesOf(null));
    expect(document.querySelectorAll(".paradata, .no-provenance").length).toBe(0);
    const statuses = [...document.querySelectorAll("[role=status]")].map((item) => text(item));
    expect(statuses).not.toContain("Reading the provenance…");
  });
});

describe("a belief", () => {
  it("records it through the server, holds the new table and follows the MatchStamp", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 22, 12));
    const store = storeOf(tableManifest());
    const journal = store.journal.length;
    const { server, calls } = serving();
    const tables = tablesOf(server);
    const { reported, informed } = show(
      store,
      potential(shownOf(matchTable()), "clt_1", q(0)),
      tables,
    );
    expect(beliefButton("claim_2", "False").disabled).toBe(false);

    beliefButton("claim_2", "False").click();
    await vi.waitFor(() => expect(reported.length).toBe(1));
    flushSync();

    const manifest = saveManifest(tableManifest());
    expect(calls.beliefs).toEqual([
      [manifest, PICKED, { claim: "claim_2", actor: ME, belief: "false", date: "2026-11-22" }],
    ]);
    expect(calls.tables).toEqual([[manifest, ANSWERED]]);
    const held = tables.of(A);
    expect([held?.name, held?.file, held?.changed]).toEqual([NAME, ANSWERED, true]);
    expect(store.journal.length).toBe(journal);
    expect(document.querySelector("[data-testid=matchclaims-status]")?.textContent).toBe(
      "match_claims.parquet: 5 MatchClaims, changed",
    );
    expect(button("Save MatchClaims…")).not.toBe(undefined);

    const index = shownOf(held?.table as MatchClaimTable);
    expect(reported).toEqual([potential(index, "clt_1", q(0))]);
    expect((reported[0] as { index: AnchorIndex }).index).toBe(index);
    expect(index.matchStamps.of[coordinateOf(index, "dpt_1", 0n)]).toBe(
      (reported[0] as { matchStamp: number }).matchStamp,
    );
    expect(coordinateOf(index, "cpt_1", 0)).toBe(-1);
    expect(informed).toEqual([
      "Recorded your belief false in claim_2; Save MatchClaims… keeps it.",
    ]);
  });

  it("sends nothing for the user's own belief", () => {
    const store = storeOf(tableManifest());
    const { server, calls } = serving();
    show(store, potential(shownOf(matchTable()), "cpt_1", 8), tablesOf(server));
    beliefButton("claim_5", "True").click();
    flushSync();
    expect(calls.beliefs).toEqual([]);
  });

  it("warns with the refusal and keeps the table", async () => {
    const store = storeOf(tableManifest());
    const problem = {
      code: "invalid_provenance",
      row: 1,
      column: ["provenance"],
      message: "the provenance is refused",
    };
    const { server, calls } = serving({
      believe: async () => {
        throw new ServerError("status", 422, problem.message, undefined, {
          path: [],
          message: problem.message,
          problems: [problem],
        });
      },
    });
    const tables = tablesOf(server);
    const before = tables.of(A);
    const { warned } = show(store, potential(shownOf(matchTable()), "clt_1", q(0)), tables);
    beliefButton("claim_2", "False").click();
    await vi.waitFor(() => expect(warned.length).toBe(1));
    expect(warned).toEqual([
      "Your belief in claim_2 was not recorded: row 1: the provenance is refused",
    ]);
    expect(calls.tables).toEqual([]);
    expect(tables.of(A)).toBe(before);
  });

  it("saves the changed table as a download, then it is no longer changed", async () => {
    const store = storeOf(tableManifest());
    const { server } = serving();
    const tables = tablesOf(server);
    const held = tables.of(A);
    if (held === null) throw new Error("no table");
    tables.hold(A, { ...held, file: ANSWERED, changed: true });
    const downloads: [string, Blob][] = [];
    const blobs = new Map<string, Blob>();
    URL.createObjectURL = (blob: Blob) => {
      const url = `blob:test/${blobs.size}`;
      blobs.set(url, blob);
      return url;
    };
    URL.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      const blob = blobs.get(this.getAttribute("href") ?? "");
      if (blob !== undefined) downloads.push([this.download, blob]);
    });
    const { informed } = show(store, null, tables);

    button("Save MatchClaims…")?.click();
    await vi.waitFor(() => expect(informed.length).toBe(1));
    flushSync();
    expect(downloads.map(([name, blob]) => [name, blob.type])).toEqual([
      [NAME, "application/vnd.apache.parquet"],
    ]);
    const [[, saved] = ["", new Blob([])]] = downloads;
    expect(Array.from(new Uint8Array(await saved.arrayBuffer()))).toEqual(
      Array.from(new Uint8Array(await ANSWERED.arrayBuffer())),
    );
    expect(tables.of(A)?.changed).toBe(false);
    expect(button("Save MatchClaims…")).toBe(undefined);
    expect(document.querySelector("[data-testid=matchclaims-status]")?.textContent).toBe(
      "match_claims.parquet: 5 MatchClaims",
    );
    expect(informed).toEqual(["Saved the MatchClaims as match_claims.parquet."]);
  });
});
