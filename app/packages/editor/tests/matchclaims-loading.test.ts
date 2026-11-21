/** Loading MatchClaim tables; the expected values are derived in `README.md` ("MatchClaims and the Matchstamp tab", item 9). */

import type { MatchClaimTable } from "@timetoalign/tilie-client";
import { ServerError } from "@timetoalign/tilie-client";
import { DEFAULT_USER, emptyWorkspace } from "@timetoalign/tilie-core";
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
import type { MatchClaimServer } from "../src/matchClaims.svelte.ts";
import { loadFailure, MatchClaimTables } from "../src/matchClaims.svelte.ts";
import { WorkspaceSession } from "../src/workspaceSession.svelte.ts";
import { matchTable, TABLE_MANIFEST_TEXT, tableManifest } from "./matches.ts";
import { fixtureText, workspaceOf } from "./support.ts";

const NOT_LOADED =
  "names the MatchClaim table match_claims.parquet, which is not loaded: Load MatchClaims… in the Matchstamp tab reads it.";
const NO_SERVER = "Matches need a server: MatchClaim tables are read through tilie-server.";

const canvas = {
  visible: () => ({ x: 0, y: 0, zoom: 1, width: 0, height: 0 }),
  focus: () => undefined,
};

/** A server answering every table with `table`, recording each request's manifest text and file. */
function serving(table: MatchClaimTable = matchTable()) {
  const requests: [string, Blob][] = [];
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
  };
  return { server, requests };
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
