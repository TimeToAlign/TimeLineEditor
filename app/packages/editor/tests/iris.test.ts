/** How IRIs are shown; the expected values are derived in `README.md` ("How IRIs are shown"). */

import { USER_TAG } from "@timetoalign/tilie-core";
import { defaultCatalogue } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { iriNames, prefixesOf, shownIri } from "../src/iris.ts";

const CATALOGUE = defaultCatalogue();
const C = { ex: "https://example.org/", tilie: USER_TAG };
const NAMES = iriNames(CATALOGUE, C);
const MBID = "8d331505-4d88-39ae-81c7-bec5da77af96";

const shown = (written: string) => shownIri(NAMES, written);

describe("an IRI of a known system", () => {
  it("shows a MusicBrainz IRI as an MBID, whatever its form", () => {
    for (const iri of [
      `http://musicbrainz.org/work/${MBID}`,
      `https://www.musicbrainz.org/work/${MBID}`,
    ]) {
      expect(shown(iri)).toEqual({ text: `mbid:${MBID}`, iri });
    }
    const recording = "https://musicbrainz.org/recording/7A0C7C3B-1D2E-4F50-8A9B-0C1D2E3F4A5B";
    expect(shown(recording)).toEqual({
      text: "mbid:7a0c7c3b-1d2e-4f50-8a9b-0c1d2e3f4a5b",
      iri: recording,
    });
  });

  it("writes a thing's prefix, else the system's ID", () => {
    expect(shown("http://www.wikidata.org/entity/Q235650")).toEqual({
      text: "wd:Q235650",
      iri: "http://www.wikidata.org/entity/Q235650",
    });
    expect(shown("https://www.wikidata.org/wiki/Q235650")).toEqual({
      text: "wd:Q235650",
      iri: "https://www.wikidata.org/wiki/Q235650",
    });
    expect(shown("https://d-nb.info/gnd/124927521")).toEqual({
      text: "gnd:124927521",
      iri: "https://d-nb.info/gnd/124927521",
    });
    expect(shown("https://www.youtube.com/watch?v=Ch2mrPm1JnM")).toEqual({
      text: "youtube:Ch2mrPm1JnM",
      iri: "https://www.youtube.com/watch?v=Ch2mrPm1JnM",
    });
    expect(shown("https://doi.org/10.1000/182")).toEqual({
      text: "doi:10.1000/182",
      iri: "https://doi.org/10.1000/182",
    });
  });
});

describe("an IRI in a namespace", () => {
  it("compacts it with the catalogue's and the context's prefixes", () => {
    for (const iri of ["http://schema.org/VideoObject", "https://schema.org/VideoObject"]) {
      expect(shown(iri)).toEqual({ text: "schema:VideoObject", iri });
    }
    expect(shown("https://example.org/thing")).toEqual({
      text: "ex:thing",
      iri: "https://example.org/thing",
    });
    expect(shown("https://example.org/people/editor")).toEqual({
      text: "https://example.org/people/editor",
      iri: null,
    });
  });
});

describe("what is shown as written", () => {
  it("keeps a compact IRI and carries the IRI it stands for", () => {
    expect(shown("wd:Q1")).toEqual({ text: "wd:Q1", iri: "http://www.wikidata.org/entity/Q1" });
    expect(shown("ex:sources/a")).toEqual({
      text: "ex:sources/a",
      iri: "https://example.org/sources/a",
    });
  });

  it("shows an unknown IRI, a name and a reference as written, with no IRI", () => {
    for (const text of [
      "https://example.com/a",
      "urn:isbn:0451450523",
      "Clair de lune",
      "#clt_6",
    ]) {
      expect(shown(text)).toEqual({ text, iri: null });
    }
  });
});

describe("the namespaces", () => {
  it("adds the context's namespaces to the catalogue's, nothing else", () => {
    const context = { ...C, "@vocab": "https://example.net/", wd: "https://example.net/wd/" };
    expect(prefixesOf(CATALOGUE, context)).toEqual({
      ...CATALOGUE.prefixes,
      ex: "https://example.org/",
      wd: "https://example.net/wd/",
    });
  });
});
