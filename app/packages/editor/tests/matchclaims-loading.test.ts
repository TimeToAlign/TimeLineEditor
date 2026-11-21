/** Loading MatchClaim tables; the expected values are derived in `README.md` ("MatchClaims and the Matchstamp tab", item 9). */

import type { ClaimEvents, MatchClaimTable } from "@timetoalign/tilie-client";
import { ServerError } from "@timetoalign/tilie-client";
import {
  DEFAULT_USER,
  emptyWorkspace,
  importedManifest,
  isLoadError,
  loadManifest,
  saveManifest,
} from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isMatchClaimTable,
  MANIFEST_FILE,
  MATCH_CLAIM_TABLE,
  openFiles,
  WORKSPACE_FILE,
  withMatchClaimTable,
} from "../src/files.ts";
import { servedSource } from "../src/fixtures.ts";
import type {
  AskTables,
  ManifestSource,
  MatchClaimServer,
  TableChoice,
  TableRequest,
} from "../src/matchClaims.svelte.ts";
import {
  eventsFailure,
  loadFailure,
  MatchClaimTables,
  namedTable,
} from "../src/matchClaims.svelte.ts";
import { WorkspaceSession } from "../src/workspaceSession.svelte.ts";
import { matchTable, TABLE_MANIFEST_TEXT, tableManifest } from "./matches.ts";
import { fixtureText, workspaceOf } from "./support.ts";

const NOT_LOADED =
  "names the MatchClaim table match_claims.parquet, which is not loaded: Show matches (M) loads it.";
const NO_SERVER = "Matches need a server: MatchClaim tables are read through tilie-server.";

const canvas = {
  visible: () => ({ x: 0, y: 0, zoom: 1, width: 0, height: 0 }),
  focus: () => undefined,
};

/**
 * A server answering every table with `table`, recording each request's
 * manifest text and file, and each events request; `events` answers those.
 */
function serving(
  table: MatchClaimTable = matchTable(),
  events: (claims: readonly string[]) => Promise<readonly ClaimEvents[]> = async () => [],
) {
  const requests: [string, Blob][] = [];
  const asked: [string, Blob, string[]][] = [];
  const server: MatchClaimServer = {
    matchClaims: async (manifest, file) => {
      requests.push([manifest, file]);
      return table;
    },
    matchClaimProvenance: async () => {
      throw new Error("loading asks no provenance");
    },
    believeMatchClaim: async () => {
      throw new Error("loading records no belief");
    },
    matchClaimEvents: async (manifest, file, claims) => {
      asked.push([manifest, file, [...claims]]);
      return events(claims);
    },
  };
  return { server, requests, asked };
}

/** Answer the pending fallback file input with `files`. */
function pickFiles(files: readonly File[]): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  if (input === null) throw new Error("no file input is waiting");
  Object.defineProperty(input, "files", { value: files });
  input.dispatchEvent(new Event("change"));
  return input;
}

function session(server: MatchClaimServer | null, warned: string[] = []) {
  return new WorkspaceSession({
    warn: (text) => warned.push(text),
    author: () => DEFAULT_USER.name,
    matchClaims: server,
  });
}

/** The table fixture's manifest with a name, so a notice names it. */
const NAMED_MANIFEST = TABLE_MANIFEST_TEXT.replace(/^timelines:/m, "name: Tables\ntimelines:");
const PARQUET = new Uint8Array([0x50, 0x41, 0x52, 0x31]);

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("the pickers", () => {
  it("offer the MatchClaim table beside a manifest or a workspace, several at once", async () => {
    expect(withMatchClaimTable(MANIFEST_FILE)).toEqual({
      description: "TimeToShare manifest and MatchClaim table",
      accept: {
        "application/yaml": [".yaml", ".yml"],
        "application/json": [".json"],
        "application/vnd.apache.parquet": [".parquet"],
      },
    });
    expect(withMatchClaimTable(WORKSPACE_FILE).accept).toEqual({
      "application/json": [".tle.json"],
      "application/vnd.apache.parquet": [".parquet"],
    });
    expect(MATCH_CLAIM_TABLE.accept).toEqual({ "application/vnd.apache.parquet": [".parquet"] });
    expect([isMatchClaimTable("match_claims.parquet"), isMatchClaimTable("a.PARQUET")]).toEqual([
      true,
      true,
    ]);
    expect(isMatchClaimTable("score.yaml")).toBe(false);

    const opening = openFiles(withMatchClaimTable(MANIFEST_FILE), true);
    const input = pickFiles([new File(["a"], "a.yaml"), new File([PARQUET], "b.parquet")]);
    expect([input.multiple, input.accept]).toEqual([true, ".yaml,.yml,.json,.parquet"]);
    expect((await opening).map((opened) => [opened.name, opened.handle])).toEqual([
      ["a.yaml", null],
      ["b.parquet", null],
    ]);
  });
});

describe("loading through the session", () => {
  it("reads a table picked with one manifest as that block's, the manifest as its file writes it", async () => {
    const { server, requests } = serving();
    const warned: string[] = [];
    const opened = session(server, warned);
    const importing = opened.importManifest(canvas, fontMetrics);
    await vi.waitFor(() => expect(document.querySelector("input[type=file]")).not.toBe(null));
    const file = new File([PARQUET], "match_claims.parquet");
    pickFiles([new File([NAMED_MANIFEST], "tables.yaml"), file]);
    await importing;
    const [block] = Object.keys(opened.store.view.blocks);
    if (block === undefined) throw new Error("nothing imported");
    expect(opened.tables.of(block)?.name).toBe("match_claims.parquet");
    expect(requests.length).toBe(1);
    expect(requests[0]?.[1]).toBe(file);
    expect(requests[0]?.[0]).toContain('"#resource_1"');
    expect(warned).toEqual([]);
    expect(opened.text()).not.toContain("claim_1");
  });

  it("gives a table to the block whose manifest names it, and says which tables are not loaded", async () => {
    const { server } = serving();
    const warned: string[] = [];
    const opened = session(server, warned);
    const importing = opened.importManifest(canvas, fontMetrics);
    await vi.waitFor(() => expect(document.querySelector("input[type=file]")).not.toBe(null));
    pickFiles([
      new File([fixtureText("bare")], "bare.yaml"),
      new File([NAMED_MANIFEST], "tables.yaml"),
      new File([PARQUET], "match_claims.parquet"),
    ]);
    await importing;
    const blocks = Object.values(opened.store.view.blocks);
    const bare = blocks.find((block) => block.manifest.name !== "Tables")?.id;
    const tables = blocks.find((block) => block.manifest.name === "Tables")?.id;
    if (bare === undefined || tables === undefined) throw new Error("not imported");
    expect([opened.tables.of(bare), opened.tables.of(tables)?.name]).toEqual([
      null,
      "match_claims.parquet",
    ]);
    expect(warned).toEqual([]);

    await opened.readTables([], [tables]);
    expect(warned).toEqual([]);
    opened.tables.clear();
    await opened.readTables([], [bare, tables]);
    expect(warned).toEqual([`Tables ${NOT_LOADED}`]);
  });

  it("says without a server that matches need one, and drops every table on another workspace", async () => {
    const warned: string[] = [];
    const offline = session(null, warned);
    const importing = offline.importManifest(canvas, fontMetrics);
    await vi.waitFor(() => expect(document.querySelector("input[type=file]")).not.toBe(null));
    pickFiles([new File([NAMED_MANIFEST], "tables.yaml")]);
    await importing;
    expect(warned).toEqual([
      `Tables names the MatchClaim table match_claims.parquet, which is not loaded. ${NO_SERVER}`,
    ]);

    const { server } = serving();
    const online = session(server);
    online.tables.hold("0000000000", {
      name: "match_claims.parquet",
      table: matchTable(),
      file: new Blob([PARQUET]),
      changed: false,
    });
    online.replace(emptyWorkspace(), "w.tle.json", null, true);
    expect(online.tables.blocks).toEqual([]);
  });
});

describe("opening", () => {
  it("opens the workspace picked with a table, the table its only block's", async () => {
    const { server, requests } = serving();
    const opened = session(server);
    const text = workspaceOf(tableManifest());
    const file = new File([PARQUET], "match_claims.parquet");
    expect(
      await opened.openPicked([
        { name: "w.tle.json", file: new File([text], "w.tle.json"), handle: null },
        { name: file.name, file, handle: null },
      ]),
    ).toBe(null);
    expect(opened.fileName).toBe("w.tle.json");
    expect(opened.tables.of("0000000000")?.name).toBe("match_claims.parquet");
    expect(requests.map(([, blob]) => blob)).toEqual([file]);
    expect(opened.text()).toBe(text);
  });
});

describe("refusals", () => {
  it("words each failure of the server", async () => {
    const refused = new ServerError("status", 422, "row 2 refused", undefined, {
      path: [],
      message: "row 2 refused",
      problems: [
        { code: "claim_events", row: 2, column: ["a"], message: "the row names no event" },
        { code: "schema", row: null, column: [], message: "a column is missing" },
      ],
    });
    expect(loadFailure("t.parquet", refused)).toBe(
      "t.parquet could not be loaded: row 2: the row names no event; a column is missing",
    );
    expect(loadFailure("t.parquet", new ServerError("unreachable", null, "Failed to fetch"))).toBe(
      "t.parquet could not be loaded: the server did not answer (Failed to fetch).",
    );
    expect(loadFailure("t.parquet", new ServerError("status", 501, "501 Not Implemented"))).toBe(
      "t.parquet could not be loaded: this server cannot read MatchClaim tables.",
    );
    expect(loadFailure("t.parquet", new ServerError("status", 500, "500 Internal"))).toBe(
      "t.parquet could not be loaded: 500 Internal",
    );
    const tables = new MatchClaimTables(null);
    expect(await tables.load("b", tableManifest(), new Blob([]), "t")).toBe(NO_SERVER);
  });
});

describe("every Parquet file picked beside a manifest", () => {
  it("is a MatchClaim table, the one its manifest names for the Projections table too", async () => {
    const { server, requests } = serving();
    const opened = session(server);
    const importing = opened.importManifest(canvas, fontMetrics);
    await vi.waitFor(() => expect(document.querySelector("input[type=file]")).not.toBe(null));
    const projections = new File([PARQUET], "projections.parquet");
    pickFiles([new File([NAMED_MANIFEST], "tables.yaml"), projections]);
    await importing;
    const [block] = Object.keys(opened.store.view.blocks);
    if (block === undefined) throw new Error("nothing imported");
    expect(requests.map(([, file]) => file)).toEqual([projections]);
    expect(opened.tables.of(block)?.name).toBe("projections.parquet");
  });
});

describe("the manifest naming the tables", () => {
  it("keeps every resource it names, unchanged, through import and loading", async () => {
    const { server } = serving();
    const opened = session(server);
    const importing = opened.importManifest(canvas, fontMetrics);
    await vi.waitFor(() => expect(document.querySelector("input[type=file]")).not.toBe(null));
    pickFiles([
      new File([TABLE_MANIFEST_TEXT], "manifest.yaml"),
      new File([PARQUET], "match_claims.parquet"),
    ]);
    await importing;
    const [block] = Object.values(opened.store.view.blocks);
    if (block === undefined) throw new Error("nothing imported");
    expect(opened.tables.of(block.id)?.name).toBe("match_claims.parquet");
    const read = tableManifest();
    expect(block.manifest.resources).toEqual(read.resources);
    expect(block.manifest.resources?.map(({ type, url }) => [type, url])).toEqual([
      ["MatchClaim", "match_claims.parquet"],
      ["Projection", "projections.parquet"],
    ]);
    expect(saveManifest(block.manifest)).toBe(saveManifest(importedManifest(read)));
  });
});

const MATCH_CLAIMS = new Blob([PARQUET, "m"]);
const PROJECTIONS = new Blob([PARQUET, "p"]);

/** A source reaching the files of `files` by location, recording every location read; any other is not reached. */
function source(files: Record<string, Blob>, read: string[] = []): ManifestSource {
  return {
    read: async (url) => {
      read.push(url);
      return files[url] ?? null;
    },
  };
}

/** The user's answers: `choice` for every question, each question recorded. */
function answering(choice: TableChoice | null) {
  const questions: TableRequest[] = [];
  const ask: AskTables = async (request) => {
    questions.push(request);
    return choice;
  };
  return { ask, questions };
}

const NAMED = loadNamedManifest();

function loadNamedManifest() {
  const manifest = tableManifest();
  return { ...manifest, name: "Tables" };
}

describe("the table a manifest names", () => {
  it("is its first MatchClaim resource, none where it names none", () => {
    expect(namedTable(tableManifest())).toBe("match_claims.parquet");
    const bare = loadManifest(fixtureText("bare"));
    if (isLoadError(bare)) throw new Error("bare is refused");
    expect(namedTable(bare)).toBe(null);
  });

  it("is the one file read from a source reaching every file, without a question", async () => {
    const { server, requests } = serving();
    const { ask, questions } = answering(null);
    const tables = new MatchClaimTables(server, ask);
    const read: string[] = [];
    tables.locate(
      "b",
      source({ "match_claims.parquet": MATCH_CLAIMS, "projections.parquet": PROJECTIONS }, read),
    );
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: ["Loaded the MatchClaims of match_claims.parquet."],
      warned: [],
    });
    expect(read).toEqual(["match_claims.parquet"]);
    expect(questions).toEqual([]);
    expect(requests.map(([, file]) => file)).toEqual([MATCH_CLAIMS]);
    expect(requests[0]?.[0]).toContain('"#resource_1"');
    expect(tables.of("b")?.name).toBe("match_claims.parquet");
  });

  it("is asked for once where the source does not reach it, a file taken", async () => {
    const { server, requests } = serving();
    const file = new File([PARQUET], "mine.parquet");
    const { ask, questions } = answering({ file });
    const tables = new MatchClaimTables(server, ask);
    tables.locate("b", source({ "projections.parquet": PROJECTIONS }));
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: ["Loaded the MatchClaims of mine.parquet."],
      warned: [],
    });
    expect(questions).toEqual([{ manifest: "Tables", table: { url: "match_claims.parquet" } }]);
    expect(requests.map(([, sent]) => sent)).toEqual([file]);
  });

  it("is fetched from a URL chosen", async () => {
    const { server, requests } = serving();
    const url = "https://example.org/p/m.parquet";
    const fetched = vi.fn(async (_input: URL) => new Response("served claims"));
    vi.stubGlobal("fetch", fetched);
    const tables = new MatchClaimTables(server, answering({ url }).ask);
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: ["Loaded the MatchClaims of m.parquet."],
      warned: [],
    });
    expect(fetched.mock.calls.map(([input]) => String(input))).toEqual([url]);
    expect(await requests[0]?.[1].text()).toBe("served claims");
    expect(tables.of("b")?.name).toBe("m.parquet");
  });

  it("is not loaded from a URL that cannot be read, saying why", async () => {
    const { server, requests } = serving();
    const url = "https://example.org/p/m.parquet";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404, statusText: "Not Found" })),
    );
    const tables = new MatchClaimTables(server, answering({ url }).ask);
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: [],
      warned: [`The MatchClaim table was not loaded: ${url} could not be read: 404 Not Found`],
    });
    expect([requests, tables.of("b")]).toEqual([[], null]);

    const again = new MatchClaimTables(server, answering({ url: "http://" }).ask);
    expect((await again.loadNamed("b", NAMED)).warned).toEqual([
      "The MatchClaim table was not loaded: 'http://' is no URL",
    ]);
  });

  it("is not loaded, and nothing said, when the user cancels", async () => {
    const { server, requests } = serving();
    const tables = new MatchClaimTables(server, answering(null).ask);
    expect(await tables.loadNamed("b", NAMED)).toEqual({ informed: [], warned: [] });
    expect([requests, tables.of("b")]).toEqual([[], null]);
  });

  it("is asked for where a failing source did not give it, saying why", async () => {
    const { server } = serving();
    const { ask, questions } = answering(null);
    const tables = new MatchClaimTables(server, ask);
    tables.locate("b", {
      read: async () => {
        throw new Error("offline");
      },
    });
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: [],
      warned: ["match_claims.parquet could not be read from where the manifest came from: offline"],
    });
    expect(questions).toEqual([{ manifest: "Tables", table: { url: "match_claims.parquet" } }]);
  });

  it("is asked for by nothing for a block holding its table, a manifest naming none, or without a server", async () => {
    const { server } = serving();
    const { ask, questions } = answering(null);
    const held = new MatchClaimTables(server, ask);
    held.hold("b", { name: "t", table: matchTable(), file: MATCH_CLAIMS, changed: false });
    const none = { informed: [], warned: [] };
    expect(await held.loadNamed("b", NAMED)).toEqual(none);
    const bare = loadManifest(fixtureText("bare"));
    if (isLoadError(bare)) throw new Error("bare is refused");
    expect(await held.loadNamed("c", bare)).toEqual(none);
    expect(await new MatchClaimTables(null, ask).loadNamed("b", NAMED)).toEqual(none);
    expect(questions).toEqual([]);
  });

  it("is asked for by the manual route, always", async () => {
    const { server } = serving();
    const { ask, questions } = answering(null);
    const tables = new MatchClaimTables(server, ask);
    tables.hold("b", { name: "t", table: matchTable(), file: MATCH_CLAIMS, changed: false });
    await tables.choose("b", NAMED);
    const bare = loadManifest(fixtureText("bare"));
    if (isLoadError(bare)) throw new Error("bare is refused");
    await tables.choose("c", bare);
    expect(questions).toEqual([
      { manifest: "Tables", table: { url: "match_claims.parquet" } },
      { manifest: "The manifest", table: { url: null } },
    ]);
    expect(await new MatchClaimTables(null, ask).choose("b", NAMED)).toEqual({
      informed: [],
      warned: [NO_SERVER],
    });
  });

  it("is loaded for every block by the session, its messages posted", async () => {
    const { server } = serving();
    const warned: string[] = [];
    const informed: string[] = [];
    const { ask } = answering({ file: new File([PARQUET], "m.parquet") });
    const opened = new WorkspaceSession({
      warn: (text) => warned.push(text),
      inform: (text) => informed.push(text),
      author: () => DEFAULT_USER.name,
      matchClaims: server,
      askTables: ask,
    });
    expect(opened.open(workspaceOf(tableManifest()))).toBe(null);
    await opened.loadNamedTables();
    expect(opened.tables.of("0000000000")?.name).toBe("m.parquet");
    expect([informed, warned]).toEqual([["Loaded the MatchClaims of m.parquet."], []]);
  });

  it("is loaded block after block in the canvas's order of blocks, wherever they lie", async () => {
    const { server } = serving();
    const { ask, questions } = answering(null);
    const opened = new WorkspaceSession({
      warn: () => undefined,
      author: () => DEFAULT_USER.name,
      matchClaims: server,
      askTables: ask,
    });
    const placed: [string, string, number, number, string][] = [
      ["000000000a", "A", 0, 200, "a2"],
      ["000000000b", "B", 300, 0, "a0"],
      ["000000000c", "C", 0, 0, "a1"],
    ];
    for (const [id, name, x, y, index] of placed) {
      const manifest = { ...tableManifest(), name };
      expect(
        opened.store.dispatch({ type: "add", into: {}, block: { id, manifest, x, y, index } }),
      ).toBeNull();
    }
    await opened.loadNamedTables();
    expect(questions.map(({ manifest }) => manifest)).toEqual(["B", "C", "A"]);
  });

  it("is served beside the Fixture menu's table fixture, the Projections table not", async () => {
    const served = {
      "/x/@timetoalign/timetoshare/fixtures/tables/0.2.0/match_claims.parquet": async () =>
        "/assets/m.parquet",
    };
    const fetched = vi.fn(async (input: string) => new Response(input));
    vi.stubGlobal("fetch", fetched);
    const read = servedSource(served);
    expect(await (await read.read("match_claims.parquet"))?.text()).toBe("/assets/m.parquet");
    expect(await read.read("projections.parquet")).toBe(null);
    expect(await read.read("other.parquet")).toBe(null);
    expect(fetched.mock.calls.map(([input]) => input)).toEqual(["/assets/m.parquet"]);
  });
});

describe("events on demand", () => {
  const CLAIM_1: ClaimEvents = {
    id: "claim_1",
    timeline_a_id: "clt_1",
    event_a_id: "note_1",
    event_a_name: "C4",
    timeline_b_id: "dpt_1",
    event_b_id: "projection_1",
    event_b_name: null,
    certainty: 1,
    is_synchronous: true,
  };

  it("are asked once per table and claims", async () => {
    const { server, asked } = serving(matchTable(), async () => [CLAIM_1]);
    const tables = new MatchClaimTables(server);
    tables.hold("b", { name: "t", table: matchTable(), file: MATCH_CLAIMS, changed: false });
    const first = tables.events("b", NAMED, ["claim_1"]);
    expect(await first).toEqual([CLAIM_1]);
    expect(tables.events("b", NAMED, ["claim_1"])).toBe(first);
    await tables.events("b", NAMED, ["claim_2"]);
    expect(asked.map(([, file, claims]) => [file, claims])).toEqual([
      [MATCH_CLAIMS, ["claim_1"]],
      [MATCH_CLAIMS, ["claim_2"]],
    ]);
    expect(asked[0]?.[0]).toContain('"#resource_1"');
    expect(tables.events("c", NAMED, ["claim_1"])).toBe(null);
    expect(new MatchClaimTables(null).events("b", NAMED, [])).toBe(null);
  });

  it("let a refused request go, so the next asks again", async () => {
    let refuse = true;
    const refused = new ServerError("status", 422, "no", undefined, {
      path: ["claims", 0],
      message: "the MatchClaim table has no MatchClaim 'claim_99'",
      problems: [],
    });
    const { server, asked } = serving(matchTable(), async () => {
      if (refuse) throw refused;
      return [];
    });
    const tables = new MatchClaimTables(server);
    tables.hold("b", { name: "t", table: matchTable(), file: MATCH_CLAIMS, changed: false });
    await expect(tables.events("b", NAMED, ["claim_99"])).rejects.toBe(refused);
    refuse = false;
    expect(await tables.events("b", NAMED, ["claim_99"])).toEqual([]);
    expect(asked.length).toBe(2);
    expect(eventsFailure(refused)).toBe("The MatchClaims' events could not be read: no");
    expect(eventsFailure(new ServerError("status", 501, "501 Not Implemented"))).toBe(
      "The MatchClaims' events could not be read: this server cannot read MatchClaim tables.",
    );
  });
});
