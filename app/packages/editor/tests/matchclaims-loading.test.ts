/** Loading MatchClaim tables; the expected values are derived in `README.md` ("MatchClaims and the Matchstamp tab", item 9). */

import type { ClaimEvents, MatchClaimTable } from "@timetoalign/tilie-client";
import { ServerError } from "@timetoalign/tilie-client";
import { DEFAULT_USER, emptyWorkspace, isLoadError, loadManifest } from "@timetoalign/tilie-core";
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
  namedTables,
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
  const asked: [string, Blob, Blob | null, string[]][] = [];
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
    matchClaimEvents: async (manifest, file, projections, claims) => {
      asked.push([manifest, file, projections, [...claims]]);
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

describe("a Projections table picked beside its manifest", () => {
  it("becomes the block's Projections table, never sent to the table route", async () => {
    const { server, requests } = serving();
    const opened = session(server);
    const importing = opened.importManifest(canvas, fontMetrics);
    await vi.waitFor(() => expect(document.querySelector("input[type=file]")).not.toBe(null));
    const claims = new File([PARQUET], "match_claims.parquet");
    const projections = new File([PARQUET], "projections.parquet");
    pickFiles([new File([NAMED_MANIFEST], "tables.yaml"), claims, projections]);
    await importing;
    const [block] = Object.keys(opened.store.view.blocks);
    if (block === undefined) throw new Error("nothing imported");
    expect(requests.map(([, file]) => file)).toEqual([claims]);
    expect(opened.tables.projectionsOf(block)).toEqual({
      name: "projections.parquet",
      file: projections,
    });
  });
});

const MATCH_CLAIMS = new Blob([PARQUET, "m"]);
const PROJECTIONS = new Blob([PARQUET, "p"]);

/** A source reaching the files of `files` by location; any other location is not reached. */
function source(files: Record<string, Blob>): ManifestSource {
  return { read: async (url) => files[url] ?? null };
}

/** The user's answers: `choices` for every question, each question recorded. */
function answering(choices: readonly TableChoice[] | null) {
  const questions: TableRequest[] = [];
  const ask: AskTables = async (request) => {
    questions.push(request);
    return choices;
  };
  return { ask, questions };
}

const NAMED = loadNamedManifest();

function loadNamedManifest() {
  const manifest = tableManifest();
  return { ...manifest, name: "Tables" };
}

describe("the tables a manifest names", () => {
  it("are the MatchClaim table, then the Projections table", () => {
    expect(namedTables(tableManifest())).toEqual([
      { type: "MatchClaim", url: "match_claims.parquet" },
      { type: "Projection", url: "projections.parquet" },
    ]);
  });

  it("are taken from a source reaching both, without a question", async () => {
    const { server, requests } = serving();
    const { ask, questions } = answering(null);
    const tables = new MatchClaimTables(server, ask);
    tables.locate(
      "b",
      source({ "match_claims.parquet": MATCH_CLAIMS, "projections.parquet": PROJECTIONS }),
    );
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: [
        "Loaded the MatchClaims of match_claims.parquet.",
        "Loaded the Projections of projections.parquet.",
      ],
      warned: [],
    });
    expect(questions).toEqual([]);
    expect(requests.map(([, file]) => file)).toEqual([MATCH_CLAIMS]);
    expect(requests[0]?.[0]).toContain('"#resource_1"');
    expect(tables.of("b")?.name).toBe("match_claims.parquet");
    expect(tables.projectionsOf("b")).toEqual({ name: "projections.parquet", file: PROJECTIONS });
  });

  it("ask once for what the source does not reach", async () => {
    const { server } = serving();
    const file = new File([PARQUET], "mine.parquet");
    const { ask, questions } = answering([{ type: "Projection", file }]);
    const tables = new MatchClaimTables(server, ask);
    tables.locate("b", source({ "match_claims.parquet": MATCH_CLAIMS }));
    await tables.loadNamed("b", NAMED);
    expect(questions).toEqual([
      { manifest: "Tables", tables: [{ type: "Projection", url: "projections.parquet" }] },
    ]);
    expect(tables.of("b")?.file).toBe(MATCH_CLAIMS);
    expect(tables.projectionsOf("b")).toEqual({ name: "mine.parquet", file });
  });

  it("ask for both without a source, taking a file and fetching a URL", async () => {
    const { server, requests } = serving();
    const file = new File([PARQUET], "match_claims.parquet");
    const url = "https://example.org/p/projections.parquet";
    const { ask, questions } = answering([
      { type: "MatchClaim", file },
      { type: "Projection", url },
    ]);
    const fetched = vi.fn(async (_input: URL) => new Response("served projections"));
    vi.stubGlobal("fetch", fetched);
    const tables = new MatchClaimTables(server, ask);
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: [
        "Loaded the MatchClaims of match_claims.parquet.",
        "Loaded the Projections of projections.parquet.",
      ],
      warned: [],
    });
    expect(questions).toEqual([
      {
        manifest: "Tables",
        tables: [
          { type: "MatchClaim", url: "match_claims.parquet" },
          { type: "Projection", url: "projections.parquet" },
        ],
      },
    ]);
    expect(fetched.mock.calls.map(([input]) => String(input))).toEqual([url]);
    expect(requests.map(([, sent]) => sent)).toEqual([file]);
    expect(tables.projectionsOf("b")?.name).toBe("projections.parquet");
    expect(await tables.projectionsOf("b")?.file.text()).toBe("served projections");
  });

  it("warn for a URL that cannot be read and load the rest", async () => {
    const { server } = serving();
    const file = new File([PARQUET], "match_claims.parquet");
    const url = "https://example.org/p/projections.parquet";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404, statusText: "Not Found" })),
    );
    const tables = new MatchClaimTables(
      server,
      answering([
        { type: "MatchClaim", file },
        { type: "Projection", url },
      ]).ask,
    );
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: ["Loaded the MatchClaims of match_claims.parquet."],
      warned: [`The Projections table was not loaded: ${url} could not be read: 404 Not Found`],
    });
    expect(tables.projectionsOf("b")).toBe(null);

    const again = new MatchClaimTables(
      server,
      answering([{ type: "Projection", url: "http://" }]).ask,
    );
    expect((await again.loadNamed("b", NAMED)).warned).toEqual([
      "The Projections table was not loaded: 'http://' is no URL",
    ]);
  });

  it("load nothing and say nothing when the user cancels", async () => {
    const { server, requests } = serving();
    const tables = new MatchClaimTables(server, answering(null).ask);
    expect(await tables.loadNamed("b", NAMED)).toEqual({ informed: [], warned: [] });
    expect(requests).toEqual([]);
    expect([tables.of("b"), tables.projectionsOf("b")]).toEqual([null, null]);
  });

  it("ask for what a failing source did not give, saying why", async () => {
    const { server } = serving();
    const { ask, questions } = answering(null);
    const tables = new MatchClaimTables(server, ask);
    tables.locate("b", {
      read: async (url) => {
        if (url === "match_claims.parquet") throw new Error("offline");
        return PROJECTIONS;
      },
    });
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: ["Loaded the Projections of projections.parquet."],
      warned: ["match_claims.parquet could not be read from where the manifest came from: offline"],
    });
    expect(questions.map(({ tables: asked }) => asked)).toEqual([
      [{ type: "MatchClaim", url: "match_claims.parquet" }],
    ]);
  });

  it("ask nothing for a block holding its table, a manifest naming none, or without a server", async () => {
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

  it("are asked for by the manual route, a MatchClaim table always", async () => {
    const { server } = serving();
    const { ask, questions } = answering(null);
    const tables = new MatchClaimTables(server, ask);
    tables.hold("b", { name: "t", table: matchTable(), file: MATCH_CLAIMS, changed: false });
    await tables.choose("b", NAMED);
    const bare = loadManifest(fixtureText("bare"));
    if (isLoadError(bare)) throw new Error("bare is refused");
    await tables.choose("c", bare);
    expect(questions).toEqual([
      {
        manifest: "Tables",
        tables: [
          { type: "MatchClaim", url: "match_claims.parquet" },
          { type: "Projection", url: "projections.parquet" },
        ],
      },
      { manifest: "The manifest", tables: [{ type: "MatchClaim", url: null }] },
    ]);
    expect(await new MatchClaimTables(null, ask).choose("b", NAMED)).toEqual({
      informed: [],
      warned: [NO_SERVER],
    });
  });

  it("are loaded for every block by the session, its messages posted", async () => {
    const { server } = serving();
    const warned: string[] = [];
    const informed: string[] = [];
    const { ask } = answering([{ type: "MatchClaim", file: new File([PARQUET], "m.parquet") }]);
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

  it("are served beside the Fixture menu's table fixture", async () => {
    const served = {
      "/x/@timetoalign/timetoshare/fixtures/tables/0.2.0/match_claims.parquet": async () =>
        "/assets/m.parquet",
      "/x/@timetoalign/timetoshare/fixtures/tables/0.2.0/projections.parquet": async () =>
        "/assets/p.parquet",
    };
    const fetched = vi.fn(async (input: string) => new Response(input));
    vi.stubGlobal("fetch", fetched);
    const read = servedSource(served);
    expect(await (await read.read("projections.parquet"))?.text()).toBe("/assets/p.parquet");
    expect(await read.read("other.parquet")).toBe(null);
    expect(fetched.mock.calls.map(([input]) => input)).toEqual(["/assets/p.parquet"]);
  });
});

describe("events on demand", () => {
  const CLAIM_1: ClaimEvents = {
    id: "claim_1",
    timeline_a_id: "clt_1",
    event_a_id: "note_1",
    event_a_name: "C4",
    event_a_projection: null,
    timeline_b_id: "dpt_1",
    event_b_id: "projection_1",
    event_b_name: null,
    event_b_projection: { projection_of: { timeline_id: "clt_1", event_id: "note_1" } },
    certainty: 1,
    is_synchronous: true,
  };

  it("are asked once per table, Projections table and claims", async () => {
    const { server, asked } = serving(matchTable(), async () => [CLAIM_1]);
    const tables = new MatchClaimTables(server);
    tables.hold("b", { name: "t", table: matchTable(), file: MATCH_CLAIMS, changed: false });
    const first = tables.events("b", NAMED, ["claim_1"]);
    expect(await first).toEqual([CLAIM_1]);
    expect(tables.events("b", NAMED, ["claim_1"])).toBe(first);
    tables.holdProjections("b", { name: "projections.parquet", file: PROJECTIONS });
    await tables.events("b", NAMED, ["claim_1"]);
    expect(asked.map(([, file, projections, claims]) => [file, projections, claims])).toEqual([
      [MATCH_CLAIMS, null, ["claim_1"]],
      [MATCH_CLAIMS, PROJECTIONS, ["claim_1"]],
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
      "The MatchClaims' events could not be read: this server cannot read Projections.",
    );
  });
});
