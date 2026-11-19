/**
 * The lookup's support table, its errors, YouTube and reconciliation by
 * search; the expected values are stated in `README.md` ("Looking values up").
 */

import { defaultCatalogue } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  createLookup,
  type Lookup,
  LookupError,
  NO_LOOKUP,
  VALUE_KINDS,
  type ValueKind,
} from "../src/lookup/index.ts";
import { RECORDED_SERVER, replay } from "./lookup-replay.ts";

const SYSTEMS = defaultCatalogue().systems.map((system) => system.id);
const WD = "http://www.wikidata.org/entity/";
const WIKIDATA_AGENT_SEARCH =
  "https://www.wikidata.org/w/api.php?action=query&format=json&formatversion=2&origin=*&generator=search&gsrnamespace=0&gsrlimit=10&gsrsearch=Maria+Jo%C3%A3o+Pires+haswbstatement%3AP31%3DQ5%7CP31%3DQ215380%7CP31%3DQ42998&prop=entityterms%7Cpageimages&wbetterms=label%7Cdescription&wbetlanguage=en&piprop=thumbnail&pithumbsize=80";
const GND_AGENT_SEARCH =
  "https://lobid.org/gnd/search?q=Pires%2C+Maria+Jo%C3%A3o&filter=type%3APerson+OR+type%3ACorporateBody&format=json%3Asuggest&size=10";
const VIDEO = "https://www.youtube.com/watch?v=Ch2mrPm1JnM";
const OEMBED = `https://www.youtube.com/oembed?url=${encodeURIComponent(VIDEO)}&format=json`;

/** Every (system, kind) pair `lookup` searches, as "system kind". */
function searched(lookup: Lookup): string[] {
  return SYSTEMS.flatMap((system) =>
    VALUE_KINDS.filter((kind) => lookup.searchable(system, kind)).map(
      (kind) => `${system} ${kind}`,
    ),
  );
}

describe("the support table", () => {
  it("names the catalogue's systems in its order", () => {
    expect(SYSTEMS).toEqual([
      "wikidata",
      "musicbrainz",
      "gnd",
      "viaf",
      "melody",
      "imslp",
      "youtube",
      "isrc",
      "doi",
      "fallback",
    ]);
  });

  it("searches and resolves with a server", () => {
    const lookup = createLookup({ fetch: replay().fetch, server: RECORDED_SERVER });
    expect(searched(lookup)).toEqual([
      "wikidata work",
      "wikidata agent",
      "wikidata recording",
      "wikidata release",
      "wikidata class",
      "wikidata any",
      "musicbrainz work",
      "musicbrainz agent",
      "musicbrainz recording",
      "musicbrainz release",
      "gnd work",
      "gnd agent",
    ]);
    expect(SYSTEMS.filter((system) => lookup.resolvable(system))).toEqual([
      "wikidata",
      "musicbrainz",
      "gnd",
      "youtube",
    ]);
  });

  it("leaves MusicBrainz out without a server", () => {
    const lookup = createLookup({ fetch: replay().fetch, server: null });
    expect(searched(lookup)).toEqual([
      "wikidata work",
      "wikidata agent",
      "wikidata recording",
      "wikidata release",
      "wikidata class",
      "wikidata any",
      "gnd work",
      "gnd agent",
    ]);
    expect(SYSTEMS.filter((system) => lookup.resolvable(system))).toEqual([
      "wikidata",
      "gnd",
      "youtube",
    ]);
  });

  it("answers what it does not support without a request", async () => {
    const r = replay();
    const lookup = createLookup({ fetch: r.fetch, server: null });
    expect(await lookup.search("musicbrainz", "work", "Clair de lune")).toEqual([]);
    expect(await lookup.search("viaf", "agent", "Pires")).toEqual([]);
    expect(await lookup.search("youtube", "any", "Clair de lune")).toEqual([]);
    expect(await lookup.resolve("viaf", "http://viaf.org/viaf/113931950")).toBeNull();
    expect(await lookup.resolve("musicbrainz", "http://musicbrainz.org/work/x")).toBeNull();
    expect(await lookup.resolve("youtube", `${WD}Q235650`)).toBeNull();
    expect(await lookup.reconcile("gnd", "class", ["video", "film"])).toEqual([null, null]);
    expect(await lookup.reconcile("viaf", "agent", ["Pires"])).toEqual([null]);
    expect(r.calls).toEqual([]);
  });

  it("supports nothing in NO_LOOKUP", async () => {
    expect(searched(NO_LOOKUP)).toEqual([]);
    expect(SYSTEMS.filter((system) => NO_LOOKUP.resolvable(system))).toEqual([]);
    expect(await NO_LOOKUP.search("wikidata", "agent", "Maria João Pires")).toEqual([]);
    expect(await NO_LOOKUP.resolve("wikidata", `${WD}Q235650`)).toBeNull();
    expect(await NO_LOOKUP.reconcile("wikidata", "agent", ["a", "b"])).toEqual([null, null]);
  });
});

describe("errors", () => {
  const lookupWith = (answer: () => Promise<Response>) => {
    const r = replay({ [WIKIDATA_AGENT_SEARCH]: answer });
    return createLookup({ fetch: r.fetch, server: null });
  };
  const searching = (answer: () => Promise<Response>) =>
    lookupWith(answer).search("wikidata", "agent", "Maria João Pires");

  it("names an unreachable service", async () => {
    const asked = searching(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(asked).rejects.toBeInstanceOf(LookupError);
    await expect(asked).rejects.toMatchObject({
      system: "wikidata",
      code: "unreachable",
      status: null,
      message: "it could not be reached (Failed to fetch)",
    });
  });

  it("names an answer outside 2xx", async () => {
    await expect(
      searching(
        async () => new Response("busy", { status: 503, statusText: "Service Unavailable" }),
      ),
    ).rejects.toMatchObject({
      code: "status",
      status: 503,
      message: "it answered 503 Service Unavailable",
    });
  });

  it("names a body that is no JSON", async () => {
    await expect(searching(async () => new Response("<html>"))).rejects.toMatchObject({
      code: "malformed",
      status: 200,
      message: "its answer is no JSON",
    });
  });

  it("names an answer of another form", async () => {
    await expect(
      searching(async () => new Response(JSON.stringify({ query: { pages: {} } }))),
    ).rejects.toMatchObject({
      code: "malformed",
      message: "its answer is no list of found items",
    });
    await expect(
      searching(
        async () => new Response(JSON.stringify({ error: { code: "x", info: "Bad search." } })),
      ),
    ).rejects.toMatchObject({ code: "malformed", message: "its answer is an error: Bad search." });
    const r = replay({ [GND_AGENT_SEARCH]: async () => new Response("{}") });
    await expect(
      createLookup({ fetch: r.fetch, server: null }).search("gnd", "agent", "Pires, Maria João"),
    ).rejects.toMatchObject({
      system: "gnd",
      code: "malformed",
      message: "its answer is no list of suggestions",
    });
  });

  it("rejects an aborted request with the signal's reason", async () => {
    const r = replay();
    const controller = new AbortController();
    const reason = new DOMException("superseded", "AbortError");
    controller.abort(reason);
    const lookup = createLookup({ fetch: r.fetch, server: null });
    await expect(
      lookup.search("wikidata", "agent", "Maria João Pires", controller.signal),
    ).rejects.toBe(reason);
  });
});

describe("YouTube", () => {
  it("resolves a video through oEmbed (youtube-oembed-Ch2mrPm1JnM.json)", async () => {
    const r = replay();
    expect(await createLookup({ fetch: r.fetch, server: null }).resolve("youtube", VIDEO)).toEqual({
      system: "youtube",
      iri: VIDEO,
      label: "C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical",
      description: "Jardin Musical",
      image: "https://i.ytimg.com/vi/Ch2mrPm1JnM/hqdefault.jpg",
      crossReferences: [],
      service: "https://www.youtube.com/oembed",
      match: false,
    });
    expect(r.urls()).toEqual([OEMBED]);
  });

  it("resolves a video oEmbed does not describe to null", async () => {
    const r = replay({
      [OEMBED]: async () => new Response("Not Found", { status: 404, statusText: "Not Found" }),
    });
    expect(await createLookup({ fetch: r.fetch, server: null }).resolve("youtube", VIDEO)).toBe(
      null,
    );
  });
});

describe("reconciling by search", () => {
  it("takes each text's first candidate, without a match", async () => {
    const r = replay();
    const lookup = createLookup({ fetch: r.fetch, server: null });
    const kind: ValueKind = "agent";
    const wikidata = await lookup.reconcile("wikidata", kind, ["Maria João Pires", ""]);
    expect(wikidata.map((candidate) => candidate && [candidate.iri, candidate.match])).toEqual([
      [`${WD}Q235650`, false],
      null,
    ]);
    const gnd = await lookup.reconcile("gnd", kind, ["Pires, Maria João"]);
    expect(gnd.map((candidate) => candidate && [candidate.iri, candidate.label])).toEqual([
      ["https://d-nb.info/gnd/1057057150", "Pires, Maria João Marques"],
    ]);
    expect(r.urls()).toEqual([WIKIDATA_AGENT_SEARCH, GND_AGENT_SEARCH]);
  });
});
