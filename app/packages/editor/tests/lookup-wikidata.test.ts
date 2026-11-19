/** Wikidata through the lookup; the expected values are stated in `README.md` ("Looking values up"). */

import { describe, expect, it } from "vitest";
import { type Candidate, createLookup, LookupError } from "../src/lookup/index.ts";
import { replay } from "./lookup-replay.ts";

const API = "https://www.wikidata.org/w/api.php";
const WD = "http://www.wikidata.org/entity/";
const THUMB = "https://thumb.wikimedia.org/wikipedia/commons/thumb/";
const UTM = "?utm_source=www.wikidata.org&utm_campaign=api&utm_content=thumbnail";

/** A Wikidata search candidate, as the README reads one from a result page. */
function found(
  q: string,
  label: string,
  description: string | null,
  image: string | null = null,
): Candidate {
  return {
    system: "wikidata",
    iri: WD + q,
    label,
    description,
    image,
    crossReferences: [],
    service: API,
    match: false,
  };
}

const lookupOf = (fetch: typeof globalThis.fetch) => createLookup({ fetch, server: null });

describe("searching Wikidata", () => {
  it("sends the search request in the stated parameter order, with the kind's filter", async () => {
    const r = replay();
    await lookupOf(r.fetch).search("wikidata", "agent", "Maria João Pires");
    expect(r.urls()).toEqual([
      `${API}?action=query&format=json&formatversion=2&origin=*&generator=search&gsrnamespace=0&gsrlimit=10&gsrsearch=Maria+Jo%C3%A3o+Pires+haswbstatement%3AP31%3DQ5%7CP31%3DQ215380%7CP31%3DQ42998&prop=entityterms%7Cpageimages&wbetterms=label%7Cdescription&wbetlanguage=en&piprop=thumbnail&pithumbsize=80`,
    ]);
    expect(r.calls[0]?.method).toBe("GET");
  });

  it("adds no filter for the kind any", async () => {
    const r = replay();
    const asked = lookupOf(r.fetch).search("wikidata", "any", "Clair de lune");
    await expect(asked).rejects.toBeInstanceOf(LookupError);
    expect(r.urls()).toEqual([
      `${API}?action=query&format=json&formatversion=2&origin=*&generator=search&gsrnamespace=0&gsrlimit=10&gsrsearch=Clair+de+lune&prop=entityterms%7Cpageimages&wbetterms=label%7Cdescription&wbetlanguage=en&piprop=thumbnail&pithumbsize=80`,
    ]);
  });

  it("finds agents (wikidata-search-agent-maria-joao-pires.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).search("wikidata", "agent", "Maria João Pires")).toEqual([
      found(
        "Q235650",
        "Maria João Pires",
        "Portuguese pianist",
        `${THUMB}b/b3/Maria_Jo%C3%A3o_Pires.jpg/120px-Maria_Jo%C3%A3o_Pires.jpg${UTM}`,
      ),
      found("Q55195680", "Maria João Pires", "researcher"),
      found("Q83454911", "Maria João Pires da Rosa", "Portuguese researcher and chemical engineer"),
    ]);
  });

  it("finds works in the order of their index (wikidata-search-work-clair-de-lune.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).search("wikidata", "work", "Clair de lune")).toEqual([
      found(
        "Q29117946",
        "Clair de lune",
        "composition for piano by Claude Debussy; part of Suite bergamasque",
        `${THUMB}2/20/Clair_de_lune_Debussy.png/120px-Clair_de_lune_Debussy.png${UTM}`,
      ),
      found(
        "Q730599",
        "Clair de lune",
        "song by Gabriel Fauré, composed in 1887 to words by Paul Verlaine",
      ),
      found(
        "Q93100837",
        "Clair De Lune",
        "original song written and composed by James Lyell and Hugo Gruzman; first recorded by Flight Facilities",
      ),
      found(
        "Q29217416",
        "La terrasse des audiences du clair de lune",
        "prelude for piano by Claude Debussy",
      ),
      found("Q2415074", "The Night Heaven Fell", "1958 film by Roger Vadim"),
      found("Q123165866", "Clair de lune", "mélodie by Claude Debussy"),
      found(
        "Q124736418",
        "Two pieces for piano, Clair de Lune, Soleil à midi, Op. 33",
        "musical work by Joseph Jongen, s.d., Music Department of the Royal Library of Belgium, Mus. 3.044 C",
        `${THUMB}5/58/Deux_pi%C3%A8ces_pour_piano%2C_musical_work_by_Joseph_Jongen%2C_s.d.%2C_Music_Department_of_the_Royal_Library_of_Belgium%2C_Mus._3.044_C_-_%28p.1%29.jpg/120px-Deux_pi%C3%A8ces_pour_piano%2C_musical_work_by_Joseph_Jongen%2C_s.d.%2C_Music_Department_of_the_Royal_Library_of_Belgium%2C_Mus._3.044_C_-_%28p.1%29.jpg${UTM}`,
      ),
      found("Q1367599", "Suite bergamasque", "Piano composition by Claude Debussy"),
      found("Q25395619", "Q25395619", null),
      found(
        "Q137705723",
        "Fantasie avec variations sur l'air 'Au clair de la lune'",
        "composition by Muzio Clementi",
      ),
    ]);
  });

  it("finds classes (wikidata-search-class-video.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).search("wikidata", "class", "video")).toEqual([
      found(
        "Q34508",
        "video recording",
        "technique of recording, copying and broadcasting of moving visual images",
        `${THUMB}e/e7/Betacam_SP_camera.jpg/120px-Betacam_SP_camera.jpg${UTM}`,
      ),
      found(
        "Q744038",
        "role-playing video game",
        "video game genre",
        `${THUMB}7/7d/BOEcombat1.png/120px-BOEcombat1.png${UTM}`,
      ),
      found("Q54767", "puzzle video game", "video game genre"),
      found(
        "Q193977",
        "music video",
        "video featuring a performance of a musical work",
        `${THUMB}9/95/BTSofjhey1.jpg/120px-BTSofjhey1.jpg${UTM}`,
      ),
      found(
        "Q723685",
        "video on demand",
        "systems which allow users to select and watch to video content on demand",
        `${THUMB}f/f3/Home-AppleTV-3RevA.JPG/120px-Home-AppleTV-3RevA.JPG${UTM}`,
      ),
      found(
        "Q210167",
        "video game developer",
        "software development organization specializing in the creation of video games (for person use Q58287519)",
      ),
      found(
        "Q7889",
        "video game",
        "electronic game that involves interaction with a user interface to generate visual feedback",
        `${THUMB}e/ed/ArcadeGames.jpg/120px-ArcadeGames.jpg${UTM}`,
      ),
      found(
        "Q868217",
        "sports video game",
        "video game genre",
        `${THUMB}7/73/Iran_Games_Cup_2019_0020.jpg/120px-Iran_Games_Cup_2019_0020.jpg${UTM}`,
      ),
      found("Q208850", "single-player video game", "video game that permits only one player"),
      found("Q659563", "video game genre", "video game term; categorization of video games"),
    ]);
  });

  it("sends no request for blank text", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).search("wikidata", "work", "  ")).toEqual([]);
    expect(r.calls).toEqual([]);
  });
});

describe("resolving a Wikidata item", () => {
  const entity = (q: string) =>
    `${API}?action=wbgetentities&format=json&origin=*&ids=${q}&props=labels%7Cdescriptions%7Cclaims&languages=en&languagefallback=1`;

  it("reads Q235650 with its image and cross-references (wikidata-entity-Q235650.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).resolve("wikidata", `${WD}Q235650`)).toEqual({
      system: "wikidata",
      iri: `${WD}Q235650`,
      label: "Maria João Pires",
      description: "Portuguese pianist",
      image:
        "https://commons.wikimedia.org/wiki/Special:FilePath/Maria_Jo%C3%A3o_Pires.jpg?width=80",
      crossReferences: [
        { system: "viaf", iri: "http://viaf.org/viaf/113931950" },
        { system: "gnd", iri: "https://d-nb.info/gnd/124927521" },
        {
          system: "musicbrainz",
          iri: "http://musicbrainz.org/artist/64cf3646-fde3-4f5e-8741-8b4d21917785",
        },
      ],
      service: API,
      match: false,
    });
    expect(r.urls()).toEqual([entity("Q235650")]);
  });

  it("reads Q29117946, which states no GND number (wikidata-entity-Q29117946.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).resolve("wikidata", `${WD}Q29117946`)).toEqual({
      system: "wikidata",
      iri: `${WD}Q29117946`,
      label: "Clair de lune",
      description: "composition for piano by Claude Debussy; part of Suite bergamasque",
      image:
        "https://commons.wikimedia.org/wiki/Special:FilePath/Clair_de_lune_Debussy.png?width=80",
      crossReferences: [
        { system: "viaf", iri: "http://viaf.org/viaf/265616918" },
        {
          system: "musicbrainz",
          iri: "http://musicbrainz.org/work/8d331505-4d88-39ae-81c7-bec5da77af96",
        },
      ],
      service: API,
      match: false,
    });
  });

  it("reads Q98069877 without image or cross-references (wikidata-entity-Q98069877.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).resolve("wikidata", `${WD}Q98069877`)).toEqual({
      system: "wikidata",
      iri: `${WD}Q98069877`,
      label: "video",
      description: "specific video with defining traits like framerate",
      image: null,
      crossReferences: [],
      service: API,
      match: false,
    });
  });

  it("resolves a wiki page URL as the entity IRI", async () => {
    const r = replay();
    const read = await lookupOf(r.fetch).resolve(
      "wikidata",
      "https://www.wikidata.org/wiki/Q235650",
    );
    expect(read?.iri).toBe(`${WD}Q235650`);
    expect(r.urls()).toEqual([entity("Q235650")]);
  });

  it("resolves an IRI of another system to null without a request", async () => {
    const r = replay();
    expect(
      await lookupOf(r.fetch).resolve("wikidata", "https://d-nb.info/gnd/124927521"),
    ).toBeNull();
    expect(r.calls).toEqual([]);
  });
});
