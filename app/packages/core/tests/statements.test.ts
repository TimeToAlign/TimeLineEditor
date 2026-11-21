/** Statements and provenance of the manifest, its timelines and its regions; the expected values are derived in `README.md` ("Statements"). */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { dumps, loads, SCHEMA_VERSION, subjectPath } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { isCommandError } from "../src/errors.ts";
import type { JsonObject } from "../src/json.ts";
import {
  loadManifest,
  manifestWarnings,
  readManifestFile,
  saveManifest,
} from "../src/manifest/io.ts";
import { skeletonOf, statementHolder, statementHolders } from "../src/manifest/statements.ts";
import { findTimeline } from "../src/manifest/tree.ts";
import type { Manifest, TimelineManifest } from "../src/manifest/types.ts";
import type { Address } from "../src/workspace/address.ts";
import { DEFAULT_USER, readOrcid, statedBy } from "../src/workspace/user.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
import { A, at, block, changed, key, loadText, storeOf } from "./support.ts";

const packageDir = path.dirname(
  createRequire(import.meta.url).resolve("@timetoalign/timetoshare/package.json"),
);

/** A text of the installed schema package's fixtures, by its path below `fixtures/`. */
function packageText(name: string): string {
  return readFileSync(path.join(packageDir, "fixtures", name), "utf8");
}

/** The text of a statement fixture of the installed schema package. */
function statementsText(name: string): string {
  return packageText(`${SCHEMA_VERSION}/statements/${name}.yaml`);
}

const L_TEXT = statementsText("layerit_recording");
const L = loadText(L_TEXT, "layerit_recording.yaml");
/** The `@context` of `L`'s file: the format's terms and the catalogue's prefixes its statements use. */
const L_CONTEXT = (loads(L_TEXT) as JsonObject)["@context"];
const MBW = "http://musicbrainz.org/work/";

/** `P`: where a problem of block `A`'s manifest lies. */
const P = [A, "manifest"];
const BLOCK: Address = { block: A };
const CPT_2 = ["timelines", 1, "children", 0];
const ORCID = "https://orcid.org/0000-0002-1825-0097";

/** A view holding `L` as block `A`. */
function viewOfL(): View {
  return changed(createView(), {
    type: "add",
    into: {},
    block: { id: A, manifest: L, x: 0, y: 0 },
  });
}

const set = (target: Address, values: object) => ({ type: "set", changes: [{ target, values }] });
const remove = (...targets: Address[]) => ({ type: "remove", targets });

function manifestOf(view: View): Manifest {
  return block(view).manifest;
}

/** The `@context` a file of the block's manifest writes. */
function fileContext(view: View): unknown {
  return (loads(saveManifest(manifestOf(view))) as JsonObject)["@context"];
}

function timelineOf(view: View, id: string): TimelineManifest {
  const found = findTimeline(manifestOf(view), id);
  if (found === undefined) throw new Error(`no timeline ${id}`);
  return found;
}

/** The code, message and path of a refusal, failing loudly if there was none. */
function refusedWith(view: View, command: object) {
  const result = apply(view, command);
  if (!isCommandError(result)) throw new Error("expected a refusal");
  return { code: result.code, message: result.message, path: result.path };
}

/** The timelines of `L` by ID. */
function own(id: string): TimelineManifest {
  const found = findTimeline(L, id);
  if (found === undefined) throw new Error(`no timeline ${id}`);
  return found;
}

describe("the holders of statements", () => {
  it("(a) walks the manifest, then each root, its regions and its children", () => {
    const holders = [...statementHolders(L)];
    expect(holders.map(({ kind, id, path }) => [kind, id, path])).toEqual([
      ["manifest", null, []],
      ["timeline", "clt_6", ["timelines", 0]],
      ["timeline", "cpt_1", ["timelines", 1]],
      ["timeline", "cpt_2", CPT_2],
      ["timeline", "dpt_1", ["timelines", 2]],
    ]);
    const [bundle, clt6, , cpt2] = holders;
    expect(bundle?.statements).toBe(L.statements);
    expect(clt6?.statements).toBe(own("clt_6").statements);
    expect(clt6?.provenance).toBe(own("clt_6").provenance);
    expect([cpt2?.statements, cpt2?.provenance]).toEqual([undefined, undefined]);
    expect(statementHolder(L, "cpt_2")).toEqual(cpt2);
    expect(statementHolder(L, "nope")).toBeUndefined();
  });

  it("(b) cuts the manifest to its statements, at the paths they have in it", () => {
    const described = (id: string) => ({
      id,
      statements: own(id).statements,
      provenance: own(id).provenance,
    });
    expect(skeletonOf(L)).toEqual({
      "@context": L_CONTEXT,
      id: "layerit_clair_de_lune",
      statements: L.statements,
      timelines: [
        { ...described("clt_6"), regions: [], children: [] },
        {
          ...described("cpt_1"),
          regions: [],
          children: [{ id: "cpt_2", regions: [], children: [] }],
        },
        { ...described("dpt_1"), regions: [], children: [] },
      ],
    });
    expect(skeletonOf(L)).toBe(skeletonOf(L));
    expect(subjectPath(skeletonOf(L), "cpt_2")).toEqual(CPT_2);
  });
});

describe("setting statements", () => {
  it("(c) stores a statement, holds no context, and journals and undoes it", () => {
    const view = viewOfL();
    const store = storeOf(view);
    const journal = store.journal.length;
    const statements = { "wdt:P31": [{ id: "wd:Q98069877" }] };
    expect(store.dispatch(set(at("cpt_2"), { statements }))).toBeNull();
    expect(timelineOf(store.view, "cpt_2").statements).toEqual(statements);
    expect("@context" in manifestOf(store.view)).toBe(false);
    expect(fileContext(store.view)).toEqual(L_CONTEXT);
    expect(store.journal.length).toBe(journal + 1);
    store.undo();
    expect(store.view).toEqual(storeOf(view).view);
  });

  it("(d) refuses a value naming no element", () => {
    expect(
      refusedWith(
        viewOfL(),
        set(at("cpt_2"), { statements: { "dcterms:source": [{ id: "#nope" }] } }),
      ),
    ).toEqual({
      code: "schema_violation",
      message: "'#nope' names no element of this manifest",
      path: [...P, ...CPT_2, "statements", "dcterms:source", 0, "id"],
    });
  });

  it("(e) refuses a prefix neither declared nor catalogued", () => {
    expect(
      refusedWith(viewOfL(), set(at("cpt_2"), { statements: { "foaf:maker": [{ id: "wd:Q1" }] } })),
    ).toEqual({
      code: "schema_violation",
      message: "'foaf:maker': the prefix 'foaf' is not declared in @context",
      path: [...P, ...CPT_2, "statements", "foaf:maker"],
    });
  });

  it("(f) writes the context a file needs from the statements", () => {
    const added = changed(viewOfL(), {
      type: "add",
      into: at("cpt_1"),
      region: { id: "region_1", start: 0.0, end: 10.0 },
    });
    const statements = { "bf:instanceOf": [{ id: "wd:Q29117946" }] };
    const stated = changed(added, set(at("region_1"), { statements }));
    expect("@context" in manifestOf(stated)).toBe(false);
    expect(fileContext(stated)).toEqual({
      ...(L_CONTEXT as JsonObject),
      bf: "http://id.loc.gov/ontologies/bibframe/",
    });
    expect(timelineOf(stated, "cpt_1").regions[0]?.statements).toEqual(statements);
    const cleared = changed(stated, set(at("region_1"), { statements: null }));
    expect("@context" in manifestOf(cleared)).toBe(false);
    expect(fileContext(cleared)).toEqual(L_CONTEXT);
    const [region] = timelineOf(cleared, "cpt_1").regions;
    expect(region !== undefined && "statements" in region).toBe(false);
  });

  it("(g) states a candidate, and refuses an actor holding two beliefs", () => {
    const { statements, provenance } = own("cpt_1");
    if (statements === undefined || provenance === undefined) throw new Error("cpt_1 states");
    const pair = { ...statements, "wdt:P2550": [{ id: "wd:Q29117946" }] };
    const believed = (beliefs: object[]) =>
      provenance.map((entry, index) => (index === 3 ? { ...entry, beliefs } : entry));
    const belief = { actor: ORCID, belief: "true", date: "2026-11-20" };
    const twice = believed([belief, { ...belief, belief: "false" }]);
    expect(refusedWith(viewOfL(), set(at("cpt_1"), { provenance: twice }))).toEqual({
      code: "schema_violation",
      message: `'${ORCID}' already holds belief 0 of this entry; an actor holds one belief`,
      path: [...P, "timelines", 1, "provenance", 3, "beliefs", 1, "actor"],
    });
    const once = believed([belief]);
    const view = changed(viewOfL(), set(at("cpt_1"), { statements: pair, provenance: once }));
    expect(timelineOf(view, "cpt_1").statements).toEqual(pair);
    expect(timelineOf(view, "cpt_1").provenance).toEqual(once);
  });

  it("(h) reads an object of pairs and a list of annotations, or null", () => {
    const view = viewOfL();
    expect(refusedWith(view, set(at("cpt_2"), { statements: [] }))).toEqual({
      code: "invalid_value",
      message: "statements is an object of property–value pairs, or null",
      path: [key(at("cpt_2")), "statements"],
    });
    expect(refusedWith(view, set(at("cpt_2"), { provenance: {} }))).toEqual({
      code: "invalid_value",
      message: "provenance is a list of annotations, or null",
      path: [key(at("cpt_2")), "provenance"],
    });
    expect(refusedWith(view, set(at("cpt_2"), { statements: null }))).toMatchObject({
      code: "invalid_value",
      message: "the command changes nothing",
    });
  });
});

describe("removal", () => {
  it("(i) prunes the references to what it removes", () => {
    const withoutDpt = changed(viewOfL(), remove(at("dpt_1")));
    const provenance = own("cpt_1").provenance ?? [];
    expect(timelineOf(withoutDpt, "cpt_1").provenance).toEqual(
      provenance.map((entry, index) => (index === 3 ? { ...entry, basis: ["#clt_6"] } : entry)),
    );
    expect(timelineOf(withoutDpt, "cpt_1").statements).toEqual(own("cpt_1").statements);
    expect(manifestOf(withoutDpt).groups[0]?.members).toEqual(["cpt_2"]);

    const withoutCpt = changed(viewOfL(), remove(at("cpt_1")));
    const dpt = timelineOf(withoutCpt, "dpt_1");
    expect("provenance" in dpt).toBe(false);
    expect(dpt.statements).toEqual(own("dpt_1").statements);
    expect(manifestOf(withoutCpt).groups[0]?.members).toEqual(["dpt_1"]);
  });

  it("(j) an editor refuses to change what an element outside it states", () => {
    const store = storeOf(viewOfL());
    expect(store.open(at("group_1"))).toBeNull();
    const before = store.view;
    const refused = store.dispatch(remove(at("dpt_1")));
    expect(refused).toEqual({
      code: "side_effect",
      message:
        "the statements of timeline 'C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical' lie outside group 'recording': an editor changes only what it edits",
      path: [key(at("cpt_1")), "statements"],
    });
    expect(store.view).toBe(before);
    store.cancel();
    expect(store.open(at("cpt_2"))).toBeNull();
    const opened = store.view;
    const bundle = store.dispatch(set(BLOCK, { statements: { "wdt:P31": [{ id: "wd:Q1" }] } }));
    expect(bundle === null ? null : { code: bundle.code, path: bundle.path }).toEqual({
      code: "side_effect",
      path: [...P, "statements"],
    });
    expect(store.view).toBe(opened);
  });
});

describe("adding a described timeline", () => {
  it("(k) reads its statements where they will lie", () => {
    const timeline = (source: string) => ({
      id: "cpt_9",
      unit: "seconds",
      length: null,
      statements: { "dcterms:source": [{ id: source }] },
    });
    const add = (source: string) => ({ type: "add", into: BLOCK, timeline: timeline(source) });
    const added = changed(viewOfL(), add("#dpt_1"));
    expect(timelineOf(added, "cpt_9").statements).toEqual({
      "dcterms:source": [{ id: "#dpt_1" }],
    });
    expect(refusedWith(viewOfL(), add("#nope"))).toEqual({
      code: "schema_violation",
      message: "'#nope' names no element of this manifest",
      path: [...P, "timelines", 3, "statements", "dcterms:source", 0, "id"],
    });
  });
});

describe("the user", () => {
  it("(l) reads an ORCID iD and names the user", () => {
    const iD = "0000-0002-1825-0097";
    for (const text of [iD, ORCID, ` orcid.org/${iD} `, `http://orcid.org/${iD}`]) {
      expect(readOrcid(text)).toBe(iD);
    }
    expect(readOrcid("0000-0002-1694-233X")).toBe("0000-0002-1694-233X");
    expect(readOrcid("0000-0002-1825-0098")).toBeNull();
    expect(readOrcid("Clara Wieck")).toBeNull();
    expect(statedBy(DEFAULT_USER)).toBe("tag:timetoalign.github.io,2026:tilie:user:Gerhardt");
    expect(statedBy({ name: "Clara Wieck", orcid: null })).toBe(
      "tag:timetoalign.github.io,2026:tilie:user:Clara%20Wieck",
    );
    expect(statedBy({ name: "Clara Wieck", orcid: iD })).toBe(ORCID);
  });
});

describe("warnings", () => {
  it("(m) are none for L, and a blank bundle for statements without an ID", () => {
    expect(manifestWarnings(L)).toEqual([]);
    const entry = loads(
      packageText(`warnings/${SCHEMA_VERSION}/bundle_blank_statements.yaml`),
    ) as JsonObject;
    const manifest = loadManifest(dumps(entry.manifest));
    if (isCommandError(manifest) || "problems" in manifest) throw new Error("the case loads");
    expect(manifestWarnings(manifest)).toEqual([
      {
        code: "bundle_blank",
        path: ["statements"],
        message: "the manifest has statements but no ID; its subject is a blank node",
      },
    ]);
  });
});

describe("the context core holds", () => {
  it("(n) holds only a manifest's own prefixes, and gives a file its context back", () => {
    expect("@context" in L).toBe(false);
    const recording = readManifestFile(L_TEXT);
    if ("problems" in recording) throw new Error("L loads");
    expect(saveManifest(recording.manifest, recording.file)).toBe(L_TEXT);
    const workText = statementsText("op106_work");
    const work = readManifestFile(workText);
    if ("problems" in work) throw new Error("op106_work loads");
    expect(work.manifest["@context"]).toEqual({ mbw: MBW });
    expect(saveManifest(work.manifest, work.file)).toBe(workText);
  });

  it("(o) keeps an own prefix while it is used, and writes it in full", () => {
    const about = { "schema:about": [{ id: "mbw:4a622b0d-b0c0-405e-b49e-05b70c108284" }] };
    const manifest = {
      ...L,
      "@context": { "@version": 1.1, wd: "http://www.wikidata.org/entity/", mbw: MBW },
      statements: { ...L.statements, ...about },
    };
    const held = changed(viewOfL(), set(BLOCK, { manifest }));
    expect(manifestOf(held)["@context"]).toEqual({ mbw: MBW });
    expect(fileContext(held)).toEqual({ ...(L_CONTEXT as JsonObject), mbw: MBW });
    const unused = changed(held, set(BLOCK, { statements: L.statements }));
    expect("@context" in manifestOf(unused)).toBe(false);
    expect(fileContext(unused)).toEqual(L_CONTEXT);
  });
});
