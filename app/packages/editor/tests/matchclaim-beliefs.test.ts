/** Events and provenance on demand, the user's belief and the unsaved table in the Matchstamp tab; derived in `README.md` ("MatchClaims and the Matchstamp tab", items 5a, 10 to 12). */

import { liveStore } from "@timetoalign/tilie-arranger";
import type {
  ClaimEvents,
  ClaimProvenance,
  MatchClaimTable,
  StatedBelief,
} from "@timetoalign/tilie-client";
import { ServerError } from "@timetoalign/tilie-client";
import type { AnchorIndex, Store } from "@timetoalign/tilie-core";
import {
  coordinateOf,
  DEFAULT_MATCH_CLAIM_FILTER,
  DEFAULT_USER,
  saveManifest,
} from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import MatchstampPanel from "../src/inspector/MatchstampPanel.svelte";
import { matchIndexes } from "../src/inspector/matchstamps.ts";
import type { HeldMatch } from "../src/inspector/tabs.ts";
import type { AskTables, MatchClaimServer, TableRequest } from "../src/matchClaims.svelte.ts";
import { MatchClaimTables } from "../src/matchClaims.svelte.ts";
import type { MessageLevel } from "../src/messages.svelte.ts";
import { WorkspaceSession } from "../src/workspaceSession.svelte.ts";
import { stubEditor } from "./dom.ts";
import {
  answeredPlaces,
  BELIEFS_BY_ROW,
  indexesOver,
  ME,
  matchTable,
  OTHER,
  q,
  tableManifest,
} from "./matches.ts";
import {
  answer,
  interceptDownloads,
  openDialog,
  posting,
  providing,
  storeOf,
  workspaceOf,
} from "./support.ts";

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

/** One side of a MatchClaim's events, as the server answers them. */
function sides(
  id: string,
  a: Partial<ClaimEvents> & Pick<ClaimEvents, "event_a_id">,
  b: Partial<ClaimEvents> & Pick<ClaimEvents, "event_b_id">,
  certainty: number | null,
): ClaimEvents {
  return {
    id,
    timeline_a_id: "clt_1",
    event_a_name: null,
    timeline_b_id: "dpt_1",
    event_b_name: null,
    certainty,
    is_synchronous: true,
    ...a,
    ...b,
  };
}

/** The events the stubbed server holds, by MatchClaim. */
const EVENTS: Readonly<Record<string, ClaimEvents>> = {
  claim_1: sides(
    "claim_1",
    { event_a_id: "note_1", event_a_name: "C4" },
    { event_b_id: "onset_1" },
    0.75,
  ),
  claim_2: sides(
    "claim_2",
    { event_a_id: "note_1", event_a_name: "C4" },
    { timeline_b_id: "cpt_1", event_b_id: "CHUNK_SENTINEL", event_b_name: "downbeat 3" },
    null,
  ),
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
  vi.unstubAllGlobals();
});

interface Calls {
  readonly events: [string, Blob, string[]][];
  readonly provenance: [string, Blob, string[]][];
  readonly beliefs: [string, Blob, StatedBelief][];
  readonly tables: [string, Blob][];
}

/** A server stub recording every call; `provenance` and `believe` answer as given. */
function serving(
  options: {
    provenance?: (claims: readonly string[]) => Promise<readonly ClaimProvenance[]>;
    believe?: () => Promise<Blob>;
    events?: (claims: readonly string[]) => Promise<readonly ClaimEvents[]>;
    table?: MatchClaimTable;
  } = {},
) {
  const calls: Calls = { events: [], provenance: [], beliefs: [], tables: [] };
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
    matchClaimEvents: async (manifest, file, claims) => {
      calls.events.push([manifest, file, [...claims]]);
      if (options.events !== undefined) return options.events(claims);
      return claims.flatMap((id) => {
        const found = EVENTS[id];
        return found === undefined ? [] : [found];
      });
    },
  };
  return { server, calls };
}

/**
 * Block A's table `table`, picked from `PICKED`, read through `server`,
 * which answered its health check (its files holding `held`); the user
 * asked for tables through `ask`, never asked without it.
 */
function tablesOf(
  server: MatchClaimServer | null,
  table = matchTable(),
  ask: AskTables | null = null,
  held: Readonly<Record<string, Blob>> = {},
): MatchClaimTables {
  const tables = new MatchClaimTables(server, {
    ask,
    computes: () => true,
    places: () => answeredPlaces(held),
  });
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
  const failed: string[] = [];
  const live = liveStore(store);
  mounted = mount(providing(MatchstampPanel), {
    target: document.body,
    context: posting(informed, warned, failed),
    props: {
      live,
      block: store.view.blocks[A] ?? null,
      match,
      tables,
      indexesOf: indexesOver(live, tables),
      onmatch: (next: HeldMatch | null) => {
        reported.push(next);
      },
    },
  });
  flushSync();
  return { reported, informed, warned, failed };
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

/** The MatchClaims' one status line, under their heading. */
const status = () => document.querySelector("section.claims > p[role=status]");

/** Open the provenance of MatchClaim `id` behind its Provenance button, unless it is open. */
function openProvenance(id: string): void {
  const toggle = claimItem(id).querySelector<HTMLButtonElement>(
    `button[aria-label='Provenance of ${id}']`,
  );
  if (toggle === null) throw new Error(`no Provenance button for ${id}`);
  if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
  flushSync();
}

/** Expand MatchClaim `id` by its disclosure button. */
function expand(id: string): void {
  claimItem(id).querySelector<HTMLButtonElement>("button[aria-expanded]")?.click();
  flushSync();
}

/** The rows of MatchClaim `id`'s events, each its heading and its text. */
function eventRows(id: string): string[][] {
  const terms = [...claimItem(id).querySelectorAll("[data-testid=matchclaim-events] dt")];
  return terms.map((term) => [text(term) ?? "", text(term.nextElementSibling) ?? ""]);
}

function paradata(id: string): string[][] {
  openProvenance(id);
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
  matchIndexes(table, DEFAULT_MATCH_CLAIM_FILTER, ME, tableManifest()["@context"]).shown;

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
    expect(claimItem("claim_1").querySelectorAll("[role=status]").length).toBe(0);
    expect(text(status())).toBe("");
    expand("claim_1");
    await settled();
    expect(text(status())).toBe("Reading the provenance…");
    openProvenance("claim_1");
    const opened = claimItem("claim_1").querySelector<HTMLButtonElement>(
      "button[aria-label='Provenance of claim_1']",
    );
    expect(text(claimItem("claim_1").querySelector("[data-testid=provenance] p.hint"))).toBe(
      "Reading the provenance…",
    );

    answer([
      { id: "claim_1", provenance: PROVENANCE.claim_1 ?? null },
      { id: "claim_2", provenance: null },
    ]);
    await settled();
    expect(text(status())).toBe("");
    // The entry is rendered once: the region opened while reading stays open.
    expect(claimItem("claim_1").querySelector("button[aria-label='Provenance of claim_1']")).toBe(
      opened,
    );
    expect(opened?.getAttribute("aria-expanded")).toBe("true");
    expect(paradata("claim_1")).toEqual([
      ["method", "imported"],
      ["service", SERVICE],
      ["date", "2026-11-20"],
    ]);
    expect(paradata("claim_2")).toEqual([]);
    expect(claimItem("claim_1").querySelectorAll(".paradata").length).toBe(1);
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
      "tag:example.org,2026:other believes it true (2026-11-21): seen in the score",
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
    expand("claim_1");
    await settled();
    expect(text(status()?.querySelector(".problem"))).toBe(
      "The provenance could not be read: 500 Internal Server Error",
    );

    refuse = false;
    remount();
    show(store, match, tables);
    await settled();
    expect(paradata("claim_1")).toEqual([
      ["method", "imported"],
      ["service", SERVICE],
      ["date", "2026-11-20"],
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

describe("events on demand", () => {
  it("asks once a MatchClaim is expanded, for every MatchClaim held, and shows both sides", async () => {
    const store = storeOf(tableManifest());
    let answer: (read: readonly ClaimEvents[]) => void = () => undefined;
    const { server, calls } = serving({
      events: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });
    show(store, potential(shownOf(matchTable()), "clt_1", q(0)), tablesOf(server));
    await settled();
    expect(calls.events).toEqual([]);

    expand("claim_1");
    expect(calls.events).toEqual([[saveManifest(tableManifest()), PICKED, ["claim_1", "claim_2"]]]);
    expect(text(status())).toBe("Reading the events…");
    answer([EVENTS.claim_1, EVENTS.claim_2].filter((item) => item !== undefined));
    await settled();
    expect(text(status())).toBe("");
    expect(eventRows("claim_1")).toEqual([
      ["clt_1", "note_1 “C4”"],
      ["dpt_1", "onset_1"],
      ["certainty", "0.75"],
    ]);
    expect(
      [...claimItem("claim_1").querySelectorAll("[data-testid=matchclaim-events] dt")].map((term) =>
        term.getAttribute("title"),
      ),
    ).toEqual(["clt_1", "dpt_1", null]);

    expand("claim_2");
    expect(calls.events.length).toBe(1);
    expect(eventRows("claim_2")).toEqual([
      ["clt_1", "note_1 “C4”"],
      ["cpt_1", "CHUNK “downbeat 3”"],
    ]);
    expect(
      claimItem("claim_2")
        .querySelector("[data-testid=matchclaim-events] dd:nth-of-type(2) .hint")
        ?.getAttribute("title"),
    ).toBe("a position on a timeline that holds no event for it");
  });

  it("says why the events were not read", async () => {
    const store = storeOf(tableManifest());
    const { server } = serving({
      events: async () => {
        throw new ServerError("status", 500, "500 Internal Server Error");
      },
    });
    show(store, potential(shownOf(matchTable()), "clt_1", q(0)), tablesOf(server));
    expand("claim_1");
    await settled();
    expect(text(status()?.querySelector(".problem"))).toBe(
      "The MatchClaims' events could not be read: 500 Internal Server Error",
    );
    expect(eventRows("claim_1")).toEqual([]);
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
    const { failed } = show(store, potential(shownOf(matchTable()), "clt_1", q(0)), tables);
    beliefButton("claim_2", "False").click();
    await vi.waitFor(() => expect(failed.length).toBe(1));
    expect(failed).toEqual([
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

describe("an unsaved table", () => {
  /** The bytes `ANSWERED` holds, read as the intercepted downloads read them. */
  const ANSWERED_TEXT = "PAR1\u0002\u0003PAR1";
  const B = "0000000001";

  /** A session on the table fixture's workspace, saved; block A holds a table, changed by a belief when `changed`. */
  function sessionOf(changed: boolean, posted: [MessageLevel, string][] = []): WorkspaceSession {
    const session = new WorkspaceSession({
      post: (level, said) => void posted.push([level, said]),
      author: () => DEFAULT_USER.name,
      matchClaims: serving().server,
    });
    expect(session.open(workspaceOf(tableManifest()))).toBe(null);
    session.tables.hold(A, { name: NAME, table: matchTable(), file: PICKED, changed: false });
    if (changed)
      session.tables.hold(A, { name: NAME, table: matchTable(), file: ANSWERED, changed });
    return session;
  }

  /** Make the open workspace unsaved: one command. */
  function edit(session: WorkspaceSession): void {
    const refusal = session.store.dispatch({
      type: "set",
      changes: [{ target: { block: A }, values: { x: 40 } }],
    });
    expect(refusal).toBe(null);
  }

  const cancelPicker = () =>
    vi.fn(async () => {
      throw new DOMException("cancelled", "AbortError");
    });

  it("is named in the one question, beside the workspace", () => {
    const session = sessionOf(false);
    expect(session.unsaved()).toBe(null);
    edit(session);
    expect(session.unsaved()).toBe("untitled.tle.json has unsaved changes. Save them?");

    const changed = sessionOf(true);
    expect(changed.unsaved()).toBe(
      "The MatchClaim table match_claims.parquet has unsaved changes. Save them?",
    );
    edit(changed);
    expect(changed.unsaved()).toBe(
      "untitled.tle.json and the MatchClaim table match_claims.parquet have unsaved changes. Save them?",
    );

    const two = sessionOf(false);
    two.tables.hold(B, { name: "b.parquet", table: matchTable(), file: PICKED, changed: true });
    two.tables.hold(A, { name: "a.parquet", table: matchTable(), file: PICKED, changed: true });
    expect(two.unsaved()).toBe(
      "The MatchClaim tables b.parquet and a.parquet have unsaved changes. Save them?",
    );
  });

  it("is saved after the workspace, after which nothing is unsaved", async () => {
    const downloads = interceptDownloads();
    const session = sessionOf(true);
    edit(session);
    const text = session.text();
    expect(await session.saveUnsaved()).toBe(true);
    await vi.waitFor(() => expect(downloads.length).toBe(2));
    expect(downloads).toEqual([
      ["untitled.tle.json", text],
      [NAME, ANSWERED_TEXT],
    ]);
    expect([session.unsaved(), session.tables.of(A)?.changed]).toEqual([null, false]);
  });

  it("is not saved when the workspace's save is cancelled", async () => {
    const picker = cancelPicker();
    vi.stubGlobal("showSaveFilePicker", picker);
    const session = sessionOf(true);
    edit(session);
    expect(await session.saveUnsaved()).toBe(false);
    expect(picker.mock.calls.length).toBe(1);
    expect([session.dirty, session.tables.of(A)?.changed]).toEqual([true, true]);
  });

  it("stays changed when its own save is cancelled or fails", async () => {
    const session = sessionOf(true);
    vi.stubGlobal("showSaveFilePicker", cancelPicker());
    expect(await session.saveUnsaved()).toBe(false);
    expect(session.tables.of(A)?.changed).toBe(true);

    const posted: [MessageLevel, string][] = [];
    const failing = sessionOf(true, posted);
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => {
        throw new Error("the disk is full");
      }),
    );
    expect(await failing.saveUnsaved()).toBe(false);
    expect([posted, failing.tables.of(A)?.changed]).toEqual([
      [["error", "The MatchClaims were not saved: the disk is full"]],
      true,
    ]);
  });

  it("asks before Load MatchClaims… replaces it", async () => {
    stubEditor();
    const ask = vi.fn<AskTables>(async () => null);
    const store = storeOf(tableManifest());
    const tables = tablesOf(serving().server, matchTable(), ask);
    tables.hold(A, { name: NAME, table: matchTable(), file: ANSWERED, changed: true });
    show(store, null, tables);

    button("Load MatchClaims…")?.click();
    await vi.waitFor(() =>
      expect(openDialog()).toEqual({
        question: "The MatchClaim table match_claims.parquet has unsaved changes. Save them?",
        answers: ["Save", "Discard", "Cancel"],
      }),
    );
    expect(document.activeElement?.textContent).toBe("Cancel");
    answer("Cancel");
    await settled();
    expect([ask.mock.calls.length, tables.of(A)?.changed]).toEqual([0, true]);

    button("Load MatchClaims…")?.click();
    await vi.waitFor(() => expect(openDialog()).not.toBe(null));
    answer("Discard");
    await vi.waitFor(() => expect(ask.mock.calls.length).toBe(1));
    expect(tables.of(A)?.file).toBe(ANSWERED);
  });

  it("is not asked about when unchanged", async () => {
    stubEditor();
    const ask = vi.fn<AskTables>(async () => null);
    show(storeOf(tableManifest()), null, tablesOf(serving().server, matchTable(), ask));
    button("Load MatchClaims…")?.click();
    await vi.waitFor(() => expect(ask.mock.calls.length).toBe(1));
    expect(openDialog()).toBe(null);
  });

  it("is loaded by Load MatchClaims… as the user chooses the manifest's MatchClaim table", async () => {
    stubEditor();
    const picker = cancelPicker();
    vi.stubGlobal("showOpenFilePicker", picker);
    const chosen = new Blob([PICKED, "m"]);
    const questions: TableRequest[] = [];
    const answers = [null, { path: "m.parquet" }];
    const ask: AskTables = async (request) => {
      questions.push(request);
      return answers.shift() ?? null;
    };
    const { server, calls } = serving();
    const tables = tablesOf(server, matchTable(), ask, { "m.parquet": chosen });
    const { informed, warned, failed } = show(storeOf(tableManifest()), null, tables);
    const asked = {
      manifest: "The manifest",
      table: { url: "match_claims.parquet" },
      question: { kind: "table", missing: null, locate: expect.any(Function) },
    };

    button("Load MatchClaims…")?.click();
    await vi.waitFor(() => expect(questions).toEqual([asked]));
    await settled();
    expect([informed, warned, failed, calls.tables.length, tables.of(A)?.name]).toEqual([
      [],
      [],
      [],
      0,
      NAME,
    ]);

    button("Load MatchClaims…")?.click();
    await vi.waitFor(() => expect(tables.of(A)?.name).toBe("m.parquet"));
    expect([questions, informed, warned, failed]).toEqual([
      [asked, asked],
      ["Loaded the MatchClaims of m.parquet."],
      [],
      [],
    ]);
    expect(calls.tables.map(([, file]) => file)).toEqual([chosen]);
    expect(picker.mock.calls.length).toBe(0);
  });
});
