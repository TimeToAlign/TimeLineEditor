/** Loading MatchClaim tables; the expected values are derived in `README.md` ("MatchClaims and the Matchstamp tab", item 9). */

import type { ClaimEvents, MatchClaimTable } from "@timetoalign/tilie-client";
import { ServerError } from "@timetoalign/tilie-client";
import {
  DEFAULT_USER,
  emptyWorkspace,
  isLoadError,
  loadManifest,
  saveManifest,
} from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  folderOf,
  isMatchClaimTable,
  MANIFEST_FILE,
  MATCH_CLAIM_TABLE,
  openFiles,
  relativePath,
  resolvedPath,
  serverSource,
  WORKSPACE_FILE,
  withMatchClaimTable,
} from "../src/files.ts";
import { servedSource } from "../src/fixtures.ts";
import type {
  AskTables,
  ManifestPlaces,
  ManifestSource,
  MatchClaimServer,
  TableChoice,
  TableRequest,
} from "../src/matchClaims.svelte.ts";
import {
  eventsFailure,
  HOW_TO_START_A_SERVER,
  loadFailure,
  MATCHES_NEED_A_SERVER,
  MatchClaimTables,
  NO_MATCHES,
  namedTable,
} from "../src/matchClaims.svelte.ts";
import type { MessageLevel } from "../src/messages.svelte.ts";
import type { FileHost } from "../src/workspaceSession.svelte.ts";
import { WorkspaceSession } from "../src/workspaceSession.svelte.ts";
import { matchTable, TABLE_MANIFEST_TEXT, tableManifest } from "./matches.ts";
import { fixtureText, importedAs, workspaceOf } from "./support.ts";

/** The short sentence, written out (README 9e). */
const NEED = "Matches need a running tilie-server.";
/** The sentence with how to start the server, written out (README 9e). */
const NO_SERVER =
  "Matches need a running tilie-server. To start it, run " +
  "uv run tilie --static-dir ../app/packages/editor/dist in the repository's server folder " +
  "(or tilie, once installed with pip install tilie-server), " +
  "then open the editor at the address it prints.";

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

/** What a session posted, as [level, text]. */
type Posted = [MessageLevel, string][];

function session(server: MatchClaimServer | null, posted: Posted = []) {
  return new WorkspaceSession({
    post: (level, text) => void posted.push([level, text]),
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
    const posted: Posted = [];
    const opened = session(server, posted);
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
    expect(posted).toEqual([]);
    expect(opened.text()).not.toContain("claim_1");
  });

  it("gives a table to the block whose manifest names it, and says nothing of a table not picked", async () => {
    const { server } = serving();
    const posted: Posted = [];
    const opened = session(server, posted);
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
    expect(posted).toEqual([]);

    opened.tables.clear();
    await opened.readTables([], [bare, tables]);
    expect(posted).toEqual([]);
  });

  it("says nothing on import without a server, and drops every table on another workspace", async () => {
    const posted: Posted = [];
    const offline = session(null, posted);
    const importing = offline.importManifest(canvas, fontMetrics);
    await vi.waitFor(() => expect(document.querySelector("input[type=file]")).not.toBe(null));
    pickFiles([new File([NAMED_MANIFEST], "tables.yaml")]);
    await importing;
    expect(posted).toEqual([]);

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
        { code: "claim_events", row: 2, column: ["a"], message: "a sentinel side has no name" },
        { code: "schema", row: null, column: [], message: "a column is missing" },
      ],
    });
    expect(loadFailure("t.parquet", refused)).toBe(
      "t.parquet could not be loaded: row 2: a sentinel side has no name; a column is missing",
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
    expect(saveManifest(block.manifest)).toBe(saveManifest(importedAs(read, block.manifest)));
  });
});

/** An in-memory server holding `files` by path, recording each path read; any other path is 404. */
function files(held: Record<string, Blob>) {
  const read: string[] = [];
  return {
    read,
    server: {
      async readFile(path: string) {
        read.push(path);
        const found = held[path];
        if (found === undefined) throw new ServerError("status", 404, "no such file");
        return found;
      },
    },
  };
}

/** The places over `held`, the manifest of block `b` at `path`, the file dialog answering `answers`. */
function places(held: Record<string, Blob>, path: string | null, answers: (string | null)[] = []) {
  const { read, server } = files(held);
  const located: [string, string][] = [];
  const chosen: [string[], string | null][] = [];
  const place: ManifestPlaces = {
    files: server,
    pathOf: (block) => (block === "b" ? path : null),
    located: (block, at) => {
      located.push([block, at]);
    },
    choose: async (kinds, near) => {
      chosen.push([kinds.map((kind) => kind.description), near]);
      return answers.shift() ?? null;
    },
  };
  return { place, read, located, chosen };
}

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

/** The question for the table's file, missing beside no path: what Load MatchClaims… asks. */
const TABLE = { kind: "table", missing: null, locate: expect.any(Function) };

/** Tables read through `server`, the user asked through `ask`, the server's files (answered) holding `held`. */
function answered(
  server: MatchClaimServer | null,
  ask: AskTables | null,
  held: Record<string, Blob> = {},
): MatchClaimTables {
  const { place } = places(held, null);
  return new MatchClaimTables(server, { ask, computes: () => true, places: () => place });
}

/** The server's files as the session reaches them once the health check answered: holding nothing. */
const HOST: FileHost = {
  server: {
    readFile: async () => {
      throw new ServerError("status", 404, "no such file");
    },
    writeFile: async () => {
      throw new Error("loading writes nothing");
    },
  },
  open: async () => null,
  save: async () => null,
};

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
    const tables = answered(server, ask);
    const read: string[] = [];
    tables.locate(
      "b",
      source({ "match_claims.parquet": MATCH_CLAIMS, "projections.parquet": PROJECTIONS }, read),
    );
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: ["Loaded the MatchClaims of match_claims.parquet."],
      failed: [],
    });
    expect(read).toEqual(["match_claims.parquet"]);
    expect(questions).toEqual([]);
    expect(requests.map(([, file]) => file)).toEqual([MATCH_CLAIMS]);
    expect(requests[0]?.[0]).toContain('"#resource_1"');
    expect(tables.of("b")?.name).toBe("match_claims.parquet");
  });

  it("is asked for once where the source does not reach it, a file located taken", async () => {
    const { server, requests } = serving();
    const file = new Blob([PARQUET, "mine"]);
    const { ask, questions } = answering({ path: "mine.parquet" });
    const tables = answered(server, ask, { "mine.parquet": file });
    tables.locate("b", source({ "projections.parquet": PROJECTIONS }));
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: ["Loaded the MatchClaims of mine.parquet."],
      failed: [],
    });
    expect(questions).toEqual([
      { manifest: "Tables", table: { url: "match_claims.parquet" }, question: TABLE },
    ]);
    expect(requests.map(([, sent]) => sent)).toEqual([file]);
  });

  it("is fetched from a URL chosen", async () => {
    const { server, requests } = serving();
    const url = "https://example.org/p/m.parquet";
    const fetched = vi.fn(async (_input: URL) => new Response("served claims"));
    vi.stubGlobal("fetch", fetched);
    const tables = answered(server, answering({ url }).ask);
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: ["Loaded the MatchClaims of m.parquet."],
      failed: [],
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
    const tables = answered(server, answering({ url }).ask);
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: [],
      failed: [`The MatchClaim table was not loaded: ${url} could not be read: 404 Not Found`],
    });
    expect([requests, tables.of("b")]).toEqual([[], null]);

    const again = answered(server, answering({ url: "http://" }).ask);
    expect((await again.loadNamed("b", NAMED)).failed).toEqual([
      "The MatchClaim table was not loaded: 'http://' is no URL",
    ]);
  });

  it("is not loaded, and nothing said, when the user cancels", async () => {
    const { server, requests } = serving();
    const tables = answered(server, answering(null).ask);
    expect(await tables.loadNamed("b", NAMED)).toEqual({ informed: [], failed: [] });
    expect([requests, tables.of("b")]).toEqual([[], null]);
  });

  it("is asked for where a failing source did not give it, saying why", async () => {
    const { server } = serving();
    const { ask, questions } = answering(null);
    const tables = answered(server, ask);
    tables.locate("b", {
      read: async () => {
        throw new Error("offline");
      },
    });
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: [],
      failed: ["match_claims.parquet could not be read from where the manifest came from: offline"],
    });
    expect(questions).toEqual([
      { manifest: "Tables", table: { url: "match_claims.parquet" }, question: TABLE },
    ]);
  });

  it("is asked for by nothing for a block holding its table, a manifest naming none, or without a server", async () => {
    const { server } = serving();
    const { ask, questions } = answering(null);
    const held = answered(server, ask);
    held.hold("b", { name: "t", table: matchTable(), file: MATCH_CLAIMS, changed: false });
    const none = { informed: [], failed: [] };
    expect(await held.loadNamed("b", NAMED)).toEqual(none);
    const bare = loadManifest(fixtureText("bare"));
    if (isLoadError(bare)) throw new Error("bare is refused");
    expect(await held.loadNamed("c", bare)).toEqual(none);
    expect(await new MatchClaimTables(null, { ask }).loadNamed("b", NAMED)).toEqual(none);
    expect(questions).toEqual([]);
  });

  it("is asked for by the manual route, always", async () => {
    const { server } = serving();
    const { ask, questions } = answering(null);
    const tables = answered(server, ask);
    tables.hold("b", { name: "t", table: matchTable(), file: MATCH_CLAIMS, changed: false });
    await tables.choose("b", NAMED);
    const bare = loadManifest(fixtureText("bare"));
    if (isLoadError(bare)) throw new Error("bare is refused");
    await tables.choose("c", bare);
    expect(questions).toEqual([
      { manifest: "Tables", table: { url: "match_claims.parquet" }, question: TABLE },
      { manifest: "The manifest", table: { url: null }, question: TABLE },
    ]);
    expect(await new MatchClaimTables(null, { ask }).choose("b", NAMED)).toEqual({
      informed: [],
      failed: [NO_SERVER],
    });
  });

  it("is loaded for every block by the session, its messages posted", async () => {
    const { server } = serving();
    const posted: Posted = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("served claims")),
    );
    const { ask, questions } = answering({ url: "https://example.org/m.parquet" });
    const opened = new WorkspaceSession({
      post: (level, text) => void posted.push([level, text]),
      author: () => DEFAULT_USER.name,
      matchClaims: server,
      askTables: ask,
      computes: () => true,
      files: () => HOST,
    });
    expect(opened.open(workspaceOf(tableManifest()))).toBe(null);
    await opened.loadNamedTables();
    expect(questions.map(({ question }) => question.kind)).toEqual(["manifest"]);
    expect(opened.tables.of("0000000000")?.name).toBe("m.parquet");
    expect(posted).toEqual([["info", "Loaded the MatchClaims of m.parquet."]]);
  });

  it("is loaded block after block in the canvas's order of blocks, wherever they lie", async () => {
    const { server } = serving();
    const { ask, questions } = answering(null);
    const opened = new WorkspaceSession({
      post: () => undefined,
      author: () => DEFAULT_USER.name,
      matchClaims: server,
      askTables: ask,
      computes: () => true,
      files: () => HOST,
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

describe("no server reading a table", () => {
  const FAILURE = "The server did not answer the health check (Failed to fetch).";
  /** Each state in which no server reads a table: given, the check's failure, `unavailable`, `waiting`. */
  const STATES = [
    ["no server given", false, null, NO_SERVER, false],
    ["a server not answered yet", true, null, NO_SERVER, true],
    ["a server whose health check failed", true, FAILURE, `${FAILURE} ${NO_SERVER}`, false],
  ] as const;
  /** The states in which turning Show matches on says that matches need a server. */
  const TOLD = STATES.filter(([, , , , waiting]) => !waiting);
  /** What turning Show matches on says in those states. */
  const NEEDED: [MessageLevel, string] = ["info", NO_SERVER];

  /**
   * A session without blocks, the server given or not, its health check
   * failed with what `failure()` gives (`null`: not, or not yet), answered
   * while `computes()` (by default while `host()` gives its files) and its
   * files reached once `host()` gives them; its questions and messages.
   */
  function sessionIn(
    given: boolean,
    failure: () => string | null,
    host: () => FileHost | null = () => null,
    computes: () => boolean = () => host() !== null,
  ) {
    const { server, requests } = serving();
    const { ask, questions } = answering(null);
    const posted: Posted = [];
    const opened = new WorkspaceSession({
      post: (level, text) => void posted.push([level, text]),
      author: () => DEFAULT_USER.name,
      matchClaims: given ? server : null,
      askTables: ask,
      computes,
      healthFailure: failure,
      files: host,
    });
    return { opened, questions, requests, posted };
  }

  function addTwoBlocks(opened: WorkspaceSession): void {
    for (const [id, name, index] of [
      ["000000000a", "A", "a0"],
      ["000000000b", "B", "a1"],
    ] as const) {
      const manifest = { ...tableManifest(), name };
      expect(
        opened.store.dispatch({
          type: "add",
          into: {},
          block: { id, manifest, x: 0, y: 0, index },
        }),
      ).toBeNull();
    }
  }

  /**
   * Turn Show matches on in `opened` over the steps of README 9e: no
   * blocks, a block naming no table, two naming one, again, one of them
   * held, both held. The messages after each step.
   */
  async function postedInSteps(opened: WorkspaceSession, posted: Posted): Promise<Posted[]> {
    const after: Posted[] = [];
    const turnOn = async () => {
      await opened.loadNamedTables();
      after.push([...posted]);
    };
    await turnOn();
    const bare = loadManifest(fixtureText("bare"));
    if (isLoadError(bare)) throw new Error("bare is refused");
    expect(
      opened.store.dispatch({
        type: "add",
        into: {},
        block: { id: "000000000c", manifest: bare, x: 0, y: 0, index: "a2" },
      }),
    ).toBeNull();
    await turnOn();
    addTwoBlocks(opened);
    await turnOn();
    await turnOn();
    const held = { name: "t", table: matchTable(), file: MATCH_CLAIMS, changed: false };
    opened.tables.hold("000000000a", held);
    await turnOn();
    opened.tables.hold("000000000b", held);
    await turnOn();
    return after;
  }

  it("says it in two plain sentences, the longer starting with the shorter", () => {
    expect(MATCHES_NEED_A_SERVER).toBe(NEED);
    expect(HOW_TO_START_A_SERVER).toBe(NO_SERVER);
    expect(NO_SERVER.startsWith(`${NEED} `)).toBe(true);
    expect([NEED.includes("`"), NO_SERVER.includes("`")]).toEqual([false, false]);
  });

  it.each(STATES)(
    "asks nothing on Show matches with %s",
    async (_, given, failure, text, waiting) => {
      const { server, requests } = serving();
      const { ask, questions } = answering({ url: "https://example.org/m.parquet" });
      const tables = new MatchClaimTables(given ? server : null, {
        ask,
        failure: () => failure,
      });
      tables.locate("b", source({}));
      expect([tables.unavailable, tables.waiting]).toEqual([text, waiting]);
      expect(await tables.loadNamed("b", NAMED)).toEqual({ informed: [], failed: [] });
      expect(questions).toEqual([]);
      expect(requests).toEqual([]);
      expect(tables.of("b")).toBe(null);
    },
  );

  it.each(STATES)(
    "asks nothing on Load MatchClaims… with %s, and warns why",
    async (_, given, failure, text) => {
      const { server, requests } = serving();
      const { ask, questions } = answering({ url: "https://example.org/m.parquet" });
      const tables = new MatchClaimTables(given ? server : null, {
        ask,
        failure: () => failure,
      });
      expect(await tables.choose("b", NAMED)).toEqual({ informed: [], failed: [text] });
      expect(questions).toEqual([]);
      expect(requests).toEqual([]);
    },
  );

  it.each(TOLD)(
    "informs once per turning on with %s, until every table named is held",
    async (_, given, failure) => {
      const { opened, questions, requests, posted } = sessionIn(given, () => failure);
      expect(await postedInSteps(opened, posted)).toEqual([
        [NEEDED],
        [NEEDED, NEEDED],
        [NEEDED, NEEDED, NEEDED],
        [NEEDED, NEEDED, NEEDED, NEEDED],
        [NEEDED, NEEDED, NEEDED, NEEDED, NEEDED],
        [NEEDED, NEEDED, NEEDED, NEEDED, NEEDED],
      ]);
      expect(questions).toEqual([]);
      expect(requests).toEqual([]);
    },
  );

  it("says nothing on Show matches while the health check has not answered yet", async () => {
    const { opened, questions, requests, posted } = sessionIn(true, () => null);
    expect(opened.tables.waiting).toBe(true);
    expect(await postedInSteps(opened, posted)).toEqual([[], [], [], [], [], []]);
    expect(questions).toEqual([]);
    expect(requests).toEqual([]);
  });

  it("follows the health check: a server answering later reads tables", async () => {
    let host: FileHost | null = null;
    const { opened, questions, posted } = sessionIn(
      true,
      () => null,
      () => host,
    );
    addTwoBlocks(opened);
    await opened.loadNamedTables();
    expect([questions, posted]).toEqual([[], []]);
    expect(await opened.tables.choose("000000000a", NAMED)).toEqual({
      informed: [],
      failed: [NO_SERVER],
    });
    host = HOST;
    expect([opened.tables.unavailable, opened.tables.waiting]).toEqual([null, false]);
    await opened.loadNamedTables();
    expect(questions.map(({ manifest, question }) => [manifest, question.kind])).toEqual([
      ["A", "manifest"],
      ["B", "manifest"],
    ]);
    // Both questions cancelled: no block holds a table, which is said.
    expect(posted).toEqual([["info", NO_MATCHES]]);
    await opened.tables.choose("000000000a", NAMED);
    expect(questions.at(-1)).toEqual({
      manifest: "Tables",
      table: { url: "match_claims.parquet" },
      question: TABLE,
    });
  });

  it("follows the health check: a check failing later informs once, asking nothing", async () => {
    let failure: string | null = null;
    const { opened, questions, requests, posted } = sessionIn(true, () => failure);
    addTwoBlocks(opened);
    await opened.loadNamedTables();
    expect(posted).toEqual([]);
    failure = FAILURE;
    expect([opened.tables.unavailable, opened.tables.waiting]).toEqual([
      `${FAILURE} ${NO_SERVER}`,
      false,
    ]);
    await opened.loadNamedTables();
    expect(posted).toEqual([NEEDED]);
    expect([questions, requests]).toEqual([[], []]);
  });

  it.each(STATES)(
    "reads no provenance, no events and no belief through the server with %s",
    async (_, given, failure, text) => {
      const { server, requests, asked } = serving();
      const tables = new MatchClaimTables(given ? server : null, { failure: () => failure });
      tables.hold("b", { name: "t", table: matchTable(), file: MATCH_CLAIMS, changed: false });
      expect(tables.provenance("b", NAMED, ["claim_1"])).toBe(null);
      expect(tables.events("b", NAMED, ["claim_1"])).toBe(null);
      expect(
        await tables.believe("b", NAMED, {
          claim: "claim_1",
          actor: "tag:example.org,2026:me",
          belief: "true",
          date: "2026-11-23",
        }),
      ).toBe(text);
      expect([requests, asked]).toEqual([[], []]);
      expect(tables.of("b")?.changed).toBe(false);
    },
  );
});

describe("a server that offers no files", () => {
  /** Tables read through `server`, which answered and offers no files; the user asked through `ask`. */
  function filesless(server: MatchClaimServer, ask: AskTables | null) {
    return new MatchClaimTables(server, { ask, computes: () => true, places: () => null });
  }

  /** The file input waiting for the browser's picker. */
  async function waitingInput(): Promise<HTMLInputElement> {
    let input: HTMLInputElement | null = null;
    await vi.waitFor(() => {
      input = document.querySelector<HTMLInputElement>("input[type=file]");
      expect(input).not.toBe(null);
    });
    if (input === null) throw new Error("no file input is waiting");
    return input;
  }

  const MINE = new File([PARQUET], "mine.parquet");

  it("reads tables, asking for a table's file picked in the browser", async () => {
    const { server, requests } = serving();
    const { ask, questions } = answering({ file: MINE });
    const tables = filesless(server, ask);
    expect([tables.unavailable, tables.waiting]).toEqual([null, false]);
    expect(await tables.loadNamed("b", NAMED)).toEqual({
      informed: ["Loaded the MatchClaims of mine.parquet."],
      failed: [],
    });
    expect(questions).toEqual([
      { manifest: "Tables", table: { url: "match_claims.parquet" }, question: TABLE },
    ]);
    expect(requests.map(([, file]) => file)).toEqual([MINE]);
    expect(tables.of("b")?.name).toBe("mine.parquet");

    const [question] = questions.map((request) => request.question);
    if (question === undefined) throw new Error("nothing asked");
    const picking = question.locate();
    const input = await waitingInput();
    expect([input.accept, input.multiple]).toEqual([".parquet", false]);
    pickFiles([MINE]);
    const located = await picking;
    expect(located).toEqual({ file: MINE });
    expect(located !== null && "file" in located && located.file === MINE).toBe(true);
  });

  it("is cancelled with the picker", async () => {
    const { ask, questions } = answering(null);
    const tables = filesless(serving().server, ask);
    await tables.choose("b", NAMED);
    const [question] = questions.map((request) => request.question);
    if (question === undefined) throw new Error("nothing asked");
    const picking = question.locate();
    (await waitingInput()).dispatchEvent(new Event("cancel"));
    expect(await picking).toBe(null);
  });

  it("loads from a source or a URL without a question, and Load MatchClaims… asks the same", async () => {
    const { server, requests } = serving();
    const { ask, questions } = answering({ file: MINE });
    const tables = filesless(server, ask);
    const read: string[] = [];
    tables.locate("b", source({ "match_claims.parquet": MATCH_CLAIMS }, read));
    expect((await tables.loadNamed("b", NAMED)).informed).toEqual([
      "Loaded the MatchClaims of match_claims.parquet.",
    ]);
    expect(read).toEqual(["match_claims.parquet"]);

    const url = "https://example.org/p/m.parquet";
    const fetched = vi.fn(async (_input: URL) => new Response("served claims"));
    vi.stubGlobal("fetch", fetched);
    const named = {
      ...NAMED,
      resources: (NAMED.resources ?? []).map((resource) =>
        resource.type === "MatchClaim" ? { ...resource, url } : resource,
      ),
    };
    expect((await tables.loadNamed("c", named)).informed).toEqual([
      "Loaded the MatchClaims of m.parquet.",
    ]);
    expect(fetched.mock.calls.map(([input]) => String(input))).toEqual([url]);
    expect(questions).toEqual([]);

    expect(await tables.choose("d", NAMED)).toEqual({
      informed: ["Loaded the MatchClaims of mine.parquet."],
      failed: [],
    });
    expect(questions).toEqual([
      { manifest: "Tables", table: { url: "match_claims.parquet" }, question: TABLE },
    ]);
    expect(requests.map(([, file]) => file).at(-1)).toBe(MINE);
  });

  it("reads provenance and events and records beliefs", async () => {
    const answeredFile = new Blob([PARQUET, "answered"]);
    const provenance: Blob[] = [];
    const beliefs: Blob[] = [];
    const { server, asked } = serving();
    const tables = filesless(
      {
        ...server,
        matchClaimProvenance: async (_manifest, file) => {
          provenance.push(file);
          return [];
        },
        believeMatchClaim: async (_manifest, file) => {
          beliefs.push(file);
          return answeredFile;
        },
      },
      null,
    );
    tables.hold("b", { name: "t", table: matchTable(), file: MATCH_CLAIMS, changed: false });
    expect(await tables.provenance("b", NAMED, ["claim_1"])).toEqual([]);
    expect(await tables.events("b", NAMED, ["claim_1"])).toEqual([]);
    expect(
      await tables.believe("b", NAMED, {
        claim: "claim_1",
        actor: "tag:example.org,2026:me",
        belief: "true",
        date: "2026-11-23",
      }),
    ).toBe(null);
    expect([provenance, asked.map(([, file]) => file), beliefs]).toEqual([
      [MATCH_CLAIMS],
      [MATCH_CLAIMS],
      [MATCH_CLAIMS],
    ]);
    expect([tables.of("b")?.file, tables.of("b")?.changed]).toEqual([answeredFile, true]);
  });

  it("is what Show matches asks through the session, keeping nothing of where the file lies", async () => {
    const { server } = serving();
    const { ask, questions } = answering({ file: MINE });
    const posted: Posted = [];
    const opened = new WorkspaceSession({
      post: (level, text) => void posted.push([level, text]),
      author: () => DEFAULT_USER.name,
      matchClaims: server,
      askTables: ask,
      computes: () => true,
      files: () => null,
    });
    expect(opened.open(workspaceOf(tableManifest()))).toBe(null);
    const before = opened.text();
    await opened.loadNamedTables();
    expect(questions.map(({ question }) => question)).toEqual([TABLE]);
    expect(posted).toEqual([["info", "Loaded the MatchClaims of mine.parquet."]]);
    expect(opened.tables.of("0000000000")?.name).toBe("mine.parquet");
    expect(opened.text()).toBe(before);
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
    const tables = answered(server, null);
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
    const tables = answered(server, null);
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

describe("beside the manifest's file on the server", () => {
  const MANIFEST_PATH = "story/step1.yaml";
  const TABLE_PATH = "story/step1.match_claims.parquet";
  const STEP = { ...tableManifest(), name: "LayerIt" };
  const LAYERIT = {
    ...STEP,
    resources: (STEP.resources ?? []).map((resource) =>
      resource.type === "MatchClaim"
        ? { ...resource, url: "step1.match_claims.parquet" }
        : resource,
    ),
  };

  it("resolves, relates and reads paths from the server's root", async () => {
    expect([
      resolvedPath("story", "step1.match_claims.parquet"),
      resolvedPath("work", "../story/a.yaml"),
      resolvedPath("", "./a/../b.yaml"),
      resolvedPath("", "../x"),
      resolvedPath("story", "/x"),
      resolvedPath("story", "https://h/x"),
    ]).toEqual(["story/step1.match_claims.parquet", "story/a.yaml", "b.yaml", null, null, null]);
    expect([
      relativePath("work", MANIFEST_PATH),
      relativePath("", MANIFEST_PATH),
      relativePath("story", MANIFEST_PATH),
    ]).toEqual(["../story/step1.yaml", MANIFEST_PATH, "step1.yaml"]);
    expect([folderOf(MANIFEST_PATH), folderOf("w.tle.json")]).toEqual(["story", ""]);

    const { read, server } = files({ [TABLE_PATH]: MATCH_CLAIMS });
    const beside = serverSource(server, "story");
    expect(await beside.read("step1.match_claims.parquet?x#y")).toBe(MATCH_CLAIMS);
    expect(await beside.read("other.parquet")).toBe(null);
    expect(await beside.read("../../x.parquet")).toBe(null);
    expect(await beside.read("https://h/x.parquet")).toBe(null);
    expect(read).toEqual([TABLE_PATH, "story/other.parquet"]);
    const failing = serverSource(
      {
        readFile: async () => {
          throw new ServerError("unreachable", null, "Failed to fetch");
        },
      },
      "",
    );
    await expect(failing.read("a.parquet")).rejects.toThrow("Failed to fetch");
  });

  it("loads the table beside the manifest's file without a question", async () => {
    const { server, requests } = serving();
    const { ask, questions } = answering(null);
    const { place, read } = places({ [TABLE_PATH]: MATCH_CLAIMS }, MANIFEST_PATH);
    const tables = new MatchClaimTables(server, { ask, computes: () => true, places: () => place });
    expect(await tables.loadNamed("b", LAYERIT)).toEqual({
      informed: ["Loaded the MatchClaims of step1.match_claims.parquet."],
      failed: [],
    });
    expect([read, questions]).toEqual([[TABLE_PATH], []]);
    expect(requests.map(([, file]) => file)).toEqual([MATCH_CLAIMS]);
  });

  it("asks once for the table where it is not beside the manifest, and reads the file located", async () => {
    const { server, requests } = serving();
    const { ask, questions } = answering({ path: "other/claims.parquet" });
    const { place, read, chosen } = places({ "other/claims.parquet": MATCH_CLAIMS }, MANIFEST_PATH);
    const tables = new MatchClaimTables(server, { ask, computes: () => true, places: () => place });
    expect(await tables.loadNamed("b", LAYERIT)).toEqual({
      informed: ["Loaded the MatchClaims of claims.parquet."],
      failed: [],
    });
    expect(questions.map(({ question }) => question.kind)).toEqual(["table"]);
    const [question] = questions.map((request) => request.question);
    if (question?.kind !== "table") throw new Error("not the table's question");
    expect(question.missing).toBe(MANIFEST_PATH);
    expect(await question.locate()).toBe(null);
    expect(chosen).toEqual([[["MatchClaim table"], MANIFEST_PATH]]);
    expect(read).toEqual([TABLE_PATH, "other/claims.parquet"]);
    expect(requests.map(([, file]) => file)).toEqual([MATCH_CLAIMS]);
  });

  it("asks where the manifest lies when the workspace does not say, and keeps the answer", async () => {
    const { server, requests } = serving();
    const { ask, questions } = answering({ path: MANIFEST_PATH });
    const { place, read, located, chosen } = places({ [TABLE_PATH]: MATCH_CLAIMS }, null);
    const tables = new MatchClaimTables(server, { ask, computes: () => true, places: () => place });
    expect(await tables.loadNamed("b", LAYERIT)).toEqual({
      informed: ["Loaded the MatchClaims of step1.match_claims.parquet."],
      failed: [],
    });
    const [question] = questions.map((request) => request.question);
    if (question?.kind !== "manifest") throw new Error("not the manifest's question");
    await question.locate();
    expect(chosen).toEqual([[["TimeToShare manifest"], null]]);
    expect(located).toEqual([["b", MANIFEST_PATH]]);
    expect(read).toEqual([TABLE_PATH]);
    expect(requests.map(([, file]) => file)).toEqual([MATCH_CLAIMS]);

    const empty = places({}, null);
    const nothing = new MatchClaimTables(server, {
      ask: answering({ path: MANIFEST_PATH }).ask,
      computes: () => true,
      places: () => empty.place,
    });
    expect(await nothing.loadNamed("b", LAYERIT)).toEqual({
      informed: [],
      failed: ["step1.match_claims.parquet is not beside step1.yaml."],
    });
    expect(empty.located).toEqual([["b", MANIFEST_PATH]]);
  });

  const WEB_TABLE = "https://example.org/p/step1.match_claims.parquet";

  /** The LayerIt manifest naming its MatchClaim table by `url`. */
  function naming(url: string) {
    return {
      ...LAYERIT,
      resources: (LAYERIT.resources ?? []).map((resource) =>
        resource.type === "MatchClaim" ? { ...resource, url } : resource,
      ),
    };
  }

  it("fetches a table named by an absolute URL, reading nothing through the server or a source", async () => {
    for (const url of [WEB_TABLE, WEB_TABLE.replace("https:", "http:")]) {
      const { server, requests } = serving();
      const { ask, questions } = answering(null);
      const { place, read } = places({ [TABLE_PATH]: MATCH_CLAIMS }, MANIFEST_PATH);
      const fetching = vi.fn(async (_input: URL) => new Response("served claims"));
      vi.stubGlobal("fetch", fetching);
      const tables = new MatchClaimTables(server, {
        ask,
        computes: () => true,
        places: () => place,
      });
      expect(await tables.loadNamed("b", naming(url))).toEqual({
        informed: ["Loaded the MatchClaims of step1.match_claims.parquet."],
        failed: [],
      });
      expect(fetching.mock.calls.map(([input]) => String(input))).toEqual([url]);
      expect([read, questions]).toEqual([[], []]);
      expect(await requests[0]?.[1].text()).toBe("served claims");
      expect(tables.of("b")?.name).toBe("step1.match_claims.parquet");
    }

    const fromSource: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("served claims")),
    );
    const located = answered(serving().server, answering(null).ask);
    located.locate("b", source({ "step1.match_claims.parquet": MATCH_CLAIMS }, fromSource));
    expect((await located.loadNamed("b", naming(WEB_TABLE))).failed).toEqual([]);
    expect(fromSource).toEqual([]);
  });

  it("asks as Load MatchClaims… asks where the URL cannot be fetched, saying why", async () => {
    const { server, requests } = serving();
    const { ask, questions } = answering(null);
    const { place, read } = places({ [TABLE_PATH]: MATCH_CLAIMS }, MANIFEST_PATH);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404, statusText: "Not Found" })),
    );
    const tables = new MatchClaimTables(server, { ask, computes: () => true, places: () => place });
    expect(await tables.loadNamed("b", naming(WEB_TABLE))).toEqual({
      informed: [],
      failed: [`${WEB_TABLE} could not be read: 404 Not Found`],
    });
    expect(
      questions.map(({ manifest, table, question }) => [
        manifest,
        table,
        question.kind,
        question.kind === "table" ? question.missing : undefined,
      ]),
    ).toEqual([["LayerIt", { url: WEB_TABLE }, "table", null]]);
    expect([read, requests, tables.of("b")]).toEqual([[], [], null]);
  });

  it("says why a located file the server refuses was not read", async () => {
    const { server, requests } = serving();
    const { place } = places({}, MANIFEST_PATH);
    const tables = new MatchClaimTables(server, {
      ask: answering({ path: "gone.parquet" }).ask,
      computes: () => true,
      places: () => place,
    });
    expect(await tables.loadNamed("b", LAYERIT)).toEqual({
      informed: [],
      failed: ["gone.parquet could not be read: no such file"],
    });
    expect(requests).toEqual([]);
  });
});
