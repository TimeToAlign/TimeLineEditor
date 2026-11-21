/** A provenance entry as both tabs show it; the expected values are derived in `README.md` ("A provenance entry"). */

import { TILIE_AGENT, USER_TAG } from "@timetoalign/tilie-core";
import { defaultCatalogue } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { beliefOf, lineOf, paradataRows, whoOf } from "../src/inspector/provenance.ts";
import { iriNames } from "../src/iris.ts";

const CATALOGUE = defaultCatalogue();
const G = "tag:timetoalign.github.io,2026:tilie:user:Gerhardt";
const P = "https://example.org/people/editor";
const MB_WORK = "http://musicbrainz.org/work/8d331505-4d88-39ae-81c7-bec5da77af96";
const GERHARDT = { name: "Gerhardt", orcid: null };
const NAMES = iriNames(CATALOGUE, { tilie: USER_TAG, ex: "https://example.org/" });

describe("who stated it", () => {
  it("words the user, an ORCID iD, a user tag and TiLiE, any other IRI as written or shown", () => {
    expect(whoOf(G, GERHARDT)).toBe("Gerhardt");
    expect(whoOf("https://orcid.org/0000-0002-1825-0097", GERHARDT)).toBe("0000-0002-1825-0097");
    expect(whoOf(`${USER_TAG}Clara%20Wieck`, GERHARDT)).toBe("Clara Wieck");
    expect(whoOf(TILIE_AGENT, GERHARDT)).toBe("TiLiE");
    expect(whoOf(P, GERHARDT)).toBe(P);
    expect(whoOf("http://www.wikidata.org/entity/Q1", GERHARDT)).toBe(
      "http://www.wikidata.org/entity/Q1",
    );
    expect(whoOf("http://www.wikidata.org/entity/Q1", GERHARDT, NAMES)).toBe("wd:Q1");
  });
});

describe("a provenance entry", () => {
  const entry = {
    stated_by: ["ex:people/editor", "tilie:Gerhardt"],
    date: "2026-11-18",
    method: "manual",
    service: "http://www.wikidata.org/entity/Q2",
    basis: ["ex:sources/a", MB_WORK],
    beliefs: [
      { actor: "tilie:Gerhardt", belief: "true", date: "2026-11-19" },
      { actor: "ex:people/editor", belief: "unlikely", date: "2026-11-18", note: "check" },
    ],
  };

  it("reads every actor as the IRI it stands for, the service and the basis as shown", () => {
    const line = lineOf(entry, GERHARDT, NAMES);
    expect(line.statedBy).toEqual([
      { text: P, iri: null },
      { text: "Gerhardt", iri: G },
    ]);
    expect(line.service).toEqual({ text: "wd:Q2", iri: "http://www.wikidata.org/entity/Q2" });
    expect(line.basis).toEqual([
      { text: "ex:sources/a", iri: "https://example.org/sources/a" },
      { text: "mbid:8d331505-4d88-39ae-81c7-bec5da77af96", iri: MB_WORK },
    ]);
    expect(line.beliefs.map((held) => [held.actor, held.iri, held.who, held.belief])).toEqual([
      ["tilie:Gerhardt", G, "Gerhardt", "true"],
      ["ex:people/editor", P, P, "unlikely"],
    ]);
    expect(beliefOf(line, GERHARDT)).toBe("true");
    const unexpanded = lineOf(entry, GERHARDT, iriNames(CATALOGUE, undefined));
    expect(unexpanded.beliefs.map((held) => held.iri)).toEqual([
      "tilie:Gerhardt",
      "ex:people/editor",
    ]);
    expect(beliefOf(unexpanded, GERHARDT)).toBe(null);
  });

  it("lists its paradata in one order with one set of labels", () => {
    expect(paradataRows(lineOf(entry, GERHARDT, NAMES))).toEqual([
      {
        key: "statedBy",
        label: "stated by",
        items: [
          { text: P, iri: null },
          { text: "Gerhardt", iri: G },
        ],
      },
      { key: "method", label: "method", items: [{ text: "manual", iri: null }] },
      {
        key: "service",
        label: "service",
        items: [{ text: "wd:Q2", iri: "http://www.wikidata.org/entity/Q2" }],
      },
      {
        key: "basis",
        label: "basis",
        items: [
          { text: "ex:sources/a", iri: "https://example.org/sources/a" },
          { text: "mbid:8d331505-4d88-39ae-81c7-bec5da77af96", iri: MB_WORK },
        ],
      },
      { key: "date", label: "date", items: [{ text: "2026-11-18", iri: null }] },
    ]);
    expect(paradataRows(lineOf({}, GERHARDT, NAMES))).toEqual([]);
  });
});
