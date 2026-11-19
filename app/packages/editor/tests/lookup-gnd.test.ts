/** The GND through the lookup; the expected values are stated in `README.md` ("Looking values up"). */

import { describe, expect, it } from "vitest";
import { type Candidate, createLookup, VALUE_KINDS } from "../src/lookup/index.ts";
import { replay } from "./lookup-replay.ts";

const SEARCH = "https://lobid.org/gnd/search";
const GND = "https://d-nb.info/gnd/";

/** A GND search candidate, as the README cuts one from a suggestion. */
function found(
  id: string,
  label: string,
  description: string | null,
  image: string | null = null,
): Candidate {
  return {
    system: "gnd",
    iri: GND + id,
    label,
    description,
    image,
    crossReferences: [],
    service: SEARCH,
    match: false,
  };
}

const lookupOf = (fetch: typeof globalThis.fetch) => createLookup({ fetch, server: null });

describe("searching the GND", () => {
  it("finds agents with the person and corporate body filter (gnd-search-agent-pires-maria-joao.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).search("gnd", "agent", "Pires, Maria João")).toEqual([
      found("1057057150", "Pires, Maria João Marques", null),
      found(
        "124927521",
        "Pires, Maria João",
        "1944– | Musikerin; Pianistin",
        "https://commons.wikimedia.org/wiki/Special:FilePath/Maria%20Jo%C3%A3o%20Pires.jpg?width=100",
      ),
      found("1060694778", "Coelho, Maria da Conceição Pires", null),
      found("1157297099", "Santos, Fátima P. dos", null),
    ]);
    expect(r.urls()).toEqual([
      `${SEARCH}?q=Pires%2C+Maria+Jo%C3%A3o&filter=type%3APerson+OR+type%3ACorporateBody&format=json%3Asuggest&size=10`,
    ]);
  });

  it("finds musical works (gnd-search-work-clair-de-lune.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).search("gnd", "work", "Clair de lune")).toEqual([
      found("1173441581", "Clair de lune", "Saint-Saëns, Camille | ca. 1865"),
      found("300487355", "Clair de lune", "Martin, Frank"),
      found("1358886245", "Au clair de lune", "Reynald, Georg"),
      found("300395418", "Clair de lune", "Fauré, Gabriel | 1887"),
      found("1156628156", "Clair de lune", "Debussy, Claude | 1882"),
      found("1350302961", "Clair de lune", "Kleven, Arvid"),
      found("300339631", "Sérénade au clair de lune", "Daetwyler, Jean"),
      found("300941536", "Au clair de la lune", "Carcassi, Matteo"),
      found("1315347520", "Au clair de da lune", "Vītols, Jāzeps | 1910"),
      found("1212871863", "Variations au clair de lune", "Pierné, Paul"),
    ]);
    expect(r.urls()).toEqual([
      `${SEARCH}?q=Clair+de+lune&filter=type%3AMusicalWork&format=json%3Asuggest&size=10`,
    ]);
  });

  it("searches no other kind and sends no request for one", async () => {
    const r = replay();
    const lookup = lookupOf(r.fetch);
    for (const kind of VALUE_KINDS.filter((k) => k !== "work" && k !== "agent")) {
      expect(await lookup.search("gnd", kind, "Clair de lune")).toEqual([]);
    }
    expect(r.calls).toEqual([]);
  });
});

describe("resolving a GND record", () => {
  it("reads 124927521 with its depiction and cross-references (gnd-record-124927521.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).resolve("gnd", `${GND}124927521`)).toEqual({
      system: "gnd",
      iri: `${GND}124927521`,
      label: "Pires, Maria João",
      description: null,
      image:
        "https://commons.wikimedia.org/wiki/Special:FilePath/Maria%20Jo%C3%A3o%20Pires.jpg?width=270",
      crossReferences: [
        { system: "viaf", iri: "http://viaf.org/viaf/113931950" },
        { system: "wikidata", iri: "http://www.wikidata.org/entity/Q235650" },
      ],
      service: SEARCH,
      match: false,
    });
    expect(r.urls()).toEqual(["https://lobid.org/gnd/124927521.json"]);
  });

  it("reads 300042558 (gnd-record-300042558.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).resolve("gnd", `${GND}300042558`)).toEqual({
      system: "gnd",
      iri: `${GND}300042558`,
      label: "Suite bergamasque. Clair de lune",
      description: null,
      image: null,
      crossReferences: [
        { system: "gnd", iri: `${GND}7601249-9` },
        { system: "viaf", iri: "http://viaf.org/viaf/265616918" },
      ],
      service: SEARCH,
      match: false,
    });
  });

  it("reads 1156628156 (gnd-record-1156628156.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).resolve("gnd", `${GND}1156628156`)).toEqual({
      system: "gnd",
      iri: `${GND}1156628156`,
      label: "Clair de lune",
      description: null,
      image: null,
      crossReferences: [{ system: "viaf", iri: "http://viaf.org/viaf/180635085" }],
      service: SEARCH,
      match: false,
    });
  });

  it("resolves an IRI of another system to null without a request", async () => {
    const r = replay();
    expect(
      await lookupOf(r.fetch).resolve("gnd", "http://www.wikidata.org/entity/Q235650"),
    ).toBeNull();
    expect(r.calls).toEqual([]);
  });
});
