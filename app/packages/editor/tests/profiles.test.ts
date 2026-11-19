/** Type profiles: the file, the catalogue offered, storage and the services' lookup; values derived in `README.md` ("Type profiles"). */

import { defaultCatalogue, dumps } from "@timetoalign/timetoshare";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OTHER_PROPERTY,
  systemChoices,
  typeOptions,
  typesOf,
  verbChoices,
} from "../src/inspector/metadata/catalogue.ts";
import { createLookup } from "../src/lookup/index.ts";
import type { Service } from "../src/lookup/services.ts";
import { ProfilesState } from "../src/profiles/profiles.svelte.ts";
import type { Profile, Profiles } from "../src/profiles/profiles.ts";
import {
  isAChoices,
  lookupChoices,
  movedVerb,
  NO_PROFILES,
  newProfile,
  parseProfiles,
  profilesText,
  readProfiles,
  withLookup,
  withPattern,
  withProfiles,
  withServiceLookup,
} from "../src/profiles/profiles.ts";
import { follow } from "./follow.svelte.ts";
import { RECORDED_SERVER, recorded, replay } from "./lookup-replay.ts";

const SHIPPED = defaultCatalogue();
/** The key the page keeps the profiles under. */
const KEY = "tilie.profiles";

const LECTURE: Profile = {
  id: "lecture_recording",
  label: "lecture recording",
  is_a: { fallback: [{ pattern: { type: ["schema:AudioObject"] } }] },
  verbs: ["performed_by", "recorded_at_on"],
  lookup: ["wikidata"],
};
const ENDPOINT = `${RECORDED_SERVER.url}reconcile/musicbrainz`;
const MB: Service = { id: "mb", name: "MusicBrainz route", endpoint: ENDPOINT };

const LECTURE_FILE = [
  "profiles:",
  "  -",
  "    id: lecture_recording",
  "    is_a:",
  "      fallback:",
  "        -",
  "          pattern:",
  '            type: ["schema:AudioObject"]',
  '    label: "lecture recording"',
  "    lookup: [wikidata]",
  "    verbs: [performed_by, recorded_at_on]",
  "services: []",
  "",
].join("\n");

/** The profiles of an editor without storage, in which the catalogue tests set theirs. */
let state = new ProfilesState(null);

beforeEach(() => {
  localStorage.clear();
  state = new ProfilesState(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/** A copy of the lecture profile file's value with `change` applied. */
function file(change: (value: { profiles: unknown[]; services: unknown[] }) => void = () => {}) {
  const value: { profiles: unknown[]; services: unknown[] } = {
    profiles: [structuredClone(LECTURE)],
    services: [],
  };
  change(value);
  return value;
}

const profile0 = (value: { profiles: unknown[] }) => value.profiles[0] as Record<string, unknown>;

describe("the file", () => {
  it("writes canonical YAML and reads it back byte for byte", () => {
    const profiles: Profiles = { profiles: [LECTURE], services: [] };
    expect(profilesText(profiles)).toBe(LECTURE_FILE);
    const read = parseProfiles(LECTURE_FILE, SHIPPED);
    expect(read).toEqual(profiles);
    expect(profilesText(read as Profiles)).toBe(LECTURE_FILE);
  });

  it("reads JSON text with the same value alike", () => {
    expect(parseProfiles(dumps(file(), { serialization: "json" }), SHIPPED)).toEqual({
      profiles: [LECTURE],
      services: [],
    });
  });

  it("reads a lookup system of a service of the file", () => {
    const value = file((v) => {
      v.services.push({ ...MB });
      profile0(v).lookup = ["service:mb"];
    });
    expect(readProfiles(value, SHIPPED)).toEqual({
      profiles: [{ ...LECTURE, lookup: ["service:mb"] }],
      services: [MB],
    });
  });

  it("refuses a text that is no YAML", () => {
    const read = parseProfiles("profiles: [", SHIPPED);
    expect(typeof read === "string" && read.startsWith("The file is no YAML or JSON: ")).toBe(true);
  });

  it.each<[string, unknown, string]>([
    ["no object", [], "a profile file is an object"],
    ["an unknown root member", { ...file(), types: [] }, "'types' is no member here"],
    ["no services", { profiles: [] }, "'services' is missing"],
    [
      "a service id with a space",
      file((v) => v.services.push({ ...MB, id: "m b" })),
      "services/0/id: 'm b' is no service id: use A–Z, a–z, 0–9, _ and - only",
    ],
    [
      "an endpoint that is no web address",
      file((v) => v.services.push({ ...MB, endpoint: "ftp://x.org/" })),
      "services/0/endpoint: 'ftp://x.org/' is no http or https URL",
    ],
    [
      "a service twice",
      file((v) => v.services.push({ ...MB }, { ...MB })),
      "services/1/id: 'mb' is given twice",
    ],
    [
      "a profile id with a capital",
      file((v) => {
        profile0(v).id = "Lecture";
      }),
      "profiles/0/id: 'Lecture' is no profile id: use a–z, 0–9 and _ only",
    ],
    [
      "an empty label",
      file((v) => {
        profile0(v).label = "";
      }),
      "profiles/0/label: a label is a non-empty text",
    ],
    [
      "an unknown system",
      file((v) => {
        profile0(v).is_a = { discogs: [] };
      }),
      "profiles/0/is_a/discogs: 'discogs' is no system of the catalogue",
    ],
    [
      "an undeclared prefix",
      file((v) => {
        profile0(v).is_a = { fallback: [{ pattern: { type: ["foo:Bar"] } }] };
      }),
      "profiles/0/is_a/fallback/0/pattern/type/0: 'foo:Bar' is no IRI: write it absolute or with a prefix the catalogue declares",
    ],
    [
      "an empty pattern",
      file((v) => {
        profile0(v).is_a = { fallback: [{ pattern: {} }] };
      }),
      "profiles/0/is_a/fallback/0/pattern: a pattern states at least one pair",
    ],
    [
      "an unknown verb",
      file((v) => {
        profile0(v).verbs = ["recorded"];
      }),
      "profiles/0/verbs/0: 'recorded' is no verb of the catalogue",
    ],
    [
      "a verb twice",
      file((v) => {
        profile0(v).verbs = ["performed_by", "performed_by"];
      }),
      "profiles/0/verbs/1: 'performed_by' is given twice",
    ],
    [
      "a service the file does not hold",
      file((v) => {
        profile0(v).lookup = ["service:x"];
      }),
      "profiles/0/lookup/0: 'service:x' is no system of the catalogue and no service of the file",
    ],
    [
      "a profile twice",
      file((v) => v.profiles.push(structuredClone(LECTURE))),
      "profiles/1/id: 'lecture_recording' is given twice",
    ],
  ])("refuses %s", (_, value, message) => {
    expect(readProfiles(value, SHIPPED)).toBe(message);
  });
});

const SHIPPED_TYPES = [
  "musical_work",
  "recorded_performance",
  "release",
  "video",
  "printed_or_scanned_edition",
  "score_encoding",
  "dj_set",
];

describe("the catalogue offered", () => {
  it("is the shipped catalogue itself without profiles or services", () => {
    expect(withProfiles(SHIPPED, NO_PROFILES)).toBe(SHIPPED);
  });

  it("puts the profiles first and replaces a type of the same id", () => {
    expect(
      withProfiles(SHIPPED, { profiles: [LECTURE], services: [] }).types.map((type) => type.id),
    ).toEqual(["lecture_recording", ...SHIPPED_TYPES]);
    const film: Profile = { ...LECTURE, id: "video", label: "film" };
    const types = withProfiles(SHIPPED, { profiles: [film], services: [] }).types;
    expect(types.map((type) => [type.id, type.label])).toEqual([
      ["video", "film"],
      ...SHIPPED.types.filter((type) => type.id !== "video").map((type) => [type.id, type.label]),
    ]);
  });

  it("makes each service a system after the catalogue's", () => {
    const systems = withProfiles(SHIPPED, { profiles: [], services: [MB] }).systems;
    expect(systems.map((system) => system.id)).toEqual([
      ...SHIPPED.systems.map((system) => system.id),
      "service:mb",
    ]);
    expect(systems.at(-1)).toEqual({
      id: "service:mb",
      name: "MusicBrainz route",
      prefixes: [],
      things: [],
      lookup: { route: "browser", endpoint: ENDPOINT },
    });
  });

  const AUDIO = [["type", "schema:AudioObject"] as const];
  const firstVerbs = (count: number) =>
    verbChoices(state.catalogue, typesOf(state.catalogue, {}, AUDIO))
      .slice(0, count)
      .map((choice) => choice.label);

  it("orders the verbs by the shipped types without profiles", () => {
    expect(state.catalogue).toBe(SHIPPED);
    expect(typesOf(state.catalogue, {}, AUDIO)).toEqual(["recorded_performance", "dj_set"]);
    expect(firstVerbs(3)).toEqual(["is a", "is a recording of", "performed by"]);
  });

  it("puts a profile's verbs first where its is-a is stated", () => {
    state.set({ profiles: [LECTURE], services: [] });
    expect(typesOf(state.catalogue, {}, AUDIO)).toEqual([
      "lecture_recording",
      "recorded_performance",
      "dj_set",
    ]);
    expect(firstVerbs(4)).toEqual([
      "is a",
      "performed by",
      "recorded at, recorded on",
      "is a recording of",
    ]);
    expect(typeOptions(state.catalogue, "fallback").map((option) => option.label)).toEqual([
      "lecture recording",
      "recorded performance",
      "video",
      "printed or scanned edition",
      "score encoding",
      "DJ set",
    ]);
  });

  it("offers a service wherever the fallback pattern takes a thing", () => {
    state.set({ profiles: [], services: [MB] });
    const catalogue = state.catalogue;
    const performed = verbChoices(catalogue, []).find((choice) => choice.id === "performed_by");
    if (performed === undefined) throw new Error("performed_by is offered");
    expect(systemChoices(catalogue, performed).map((choice) => choice.label)).toEqual([
      "Wikidata",
      "MusicBrainz",
      "GND",
      "MeLODy / LRMoo",
      "Other vocabularies",
      "MusicBrainz route",
      "An element of this manifest",
    ]);
    const isA = { id: "is_a", inverse: false, label: "is a" };
    expect(systemChoices(catalogue, isA).map((choice) => choice.id)).not.toContain("service:mb");
    expect(verbChoices(catalogue, [], "service:mb").at(-1)).toEqual(OTHER_PROPERTY);
    expect(verbChoices(catalogue, [], "service:mb").map((choice) => choice.id)).toContain(
      "performed_by",
    );
  });

  it("is read afresh, so a derived value follows a change of the profiles", () => {
    const first = follow(() => state.catalogue.types[0]?.id);
    flushSync();
    state.set({ profiles: [LECTURE], services: [] });
    flushSync();
    first.stop();
    expect(first.values).toEqual(["musical_work", "lecture_recording"]);
  });
});

describe("the vocabularies a subject prefers", () => {
  const PERFORMED = { id: "performed_by", inverse: false, label: "performed by" };
  const labels = (types: readonly string[]) =>
    systemChoices(state.catalogue, PERFORMED, types).map((choice) => choice.label);

  it("keeps the catalogue's order without types", () => {
    expect(labels([])).toEqual([
      "Wikidata",
      "MusicBrainz",
      "GND",
      "MeLODy / LRMoo",
      "Other vocabularies",
      "An element of this manifest",
    ]);
  });

  it("leads with a catalogue type's lookup systems", () => {
    expect(labels(["release"])).toEqual([
      "MusicBrainz",
      "Wikidata",
      "GND",
      "MeLODy / LRMoo",
      "Other vocabularies",
      "An element of this manifest",
    ]);
  });

  it("leads with the profile's lookup systems, the first type's first", () => {
    state.set({ profiles: [LECTURE], services: [] });
    const types = typesOf(state.catalogue, {}, [["type", "schema:AudioObject"]]);
    expect(types).toEqual(["lecture_recording", "recorded_performance", "dj_set"]);
    expect(labels(types)[0]).toBe("Wikidata");
    expect(labels(types)).toEqual([
      "Wikidata",
      "MusicBrainz",
      "GND",
      "MeLODy / LRMoo",
      "Other vocabularies",
      "An element of this manifest",
    ]);
    state.set({ profiles: [{ ...LECTURE, lookup: ["gnd", "wikidata"] }], services: [] });
    expect(labels(["lecture_recording"])).toEqual([
      "GND",
      "Wikidata",
      "MusicBrainz",
      "MeLODy / LRMoo",
      "Other vocabularies",
      "An element of this manifest",
    ]);
  });
});

describe("kept where the host says", () => {
  it("reads no profiles when nothing is stored", () => {
    expect(new ProfilesState(KEY).profiles).toEqual(NO_PROFILES);
  });

  it("stores the file under its key and reads it back", () => {
    new ProfilesState(KEY).set({ profiles: [LECTURE], services: [] });
    expect(localStorage.getItem(KEY)).toBe(LECTURE_FILE);
    expect(new ProfilesState(KEY).profiles).toEqual({ profiles: [LECTURE], services: [] });
  });

  it("reads a stored text that is no profile file as no profiles", () => {
    for (const text of ["profiles: [", "[]", LECTURE_FILE.replace("performed_by,", "recorded,")]) {
      localStorage.setItem(KEY, text);
      expect(new ProfilesState(KEY).profiles).toEqual(NO_PROFILES);
    }
  });

  it("touches no storage without a key, and holds what is set", () => {
    localStorage.setItem(KEY, LECTURE_FILE);
    const read = vi.spyOn(Storage.prototype, "getItem");
    const written = vi.spyOn(Storage.prototype, "setItem");
    const kept = new ProfilesState(null);
    expect(kept.profiles).toEqual(NO_PROFILES);
    kept.set({ profiles: [], services: [MB] });
    expect(kept.profiles).toEqual({ profiles: [], services: [MB] });
    expect([read.mock.calls, written.mock.calls]).toEqual([[], []]);
  });

  it("holds the profiles in memory when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const stored = new ProfilesState(KEY);
    expect(stored.profiles).toEqual(NO_PROFILES);
    stored.set({ profiles: [LECTURE], services: [] });
    expect(stored.profiles).toEqual({ profiles: [LECTURE], services: [] });
  });
});

describe("the services' lookup", () => {
  const SUGGEST = `${ENDPOINT}/suggest/entity?prefix=Pires`;
  const json = (text: string) => async () =>
    new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });

  it("searches every kind of a service and resolves nothing", async () => {
    const recording = replay();
    const lookup = createLookup({ server: null, fetch: recording.fetch, services: () => [MB] });
    for (const kind of ["work", "agent", "recording", "release", "class", "any"] as const) {
      expect(lookup.searchable("service:mb", kind)).toBe(true);
      expect(lookup.searchable("service:x", kind)).toBe(false);
    }
    expect(lookup.resolvable("service:mb")).toBe(false);
    expect(await lookup.resolve("service:mb", "http://musicbrainz.org/work/x")).toBeNull();
    expect(await lookup.search("service:x", "any", "Pires")).toEqual([]);
    expect(recording.calls).toEqual([]);
  });

  it("asks a service's suggestions without a type", async () => {
    const recording = replay({ [SUGGEST]: json(recorded("musicbrainz-search-agent-pires.json")) });
    const lookup = createLookup({ server: null, fetch: recording.fetch, services: () => [MB] });
    const found = await lookup.search("service:mb", "agent", "Pires");
    expect(recording.urls()).toEqual([ENDPOINT, SUGGEST]);
    expect(recording.calls.map((call) => call.headers)).toEqual([{}, {}]);
    expect(found).toHaveLength(10);
    expect(found[0]).toEqual({
      system: "service:mb",
      iri: "http://musicbrainz.org/artist/7f3a2f7e-6277-4d72-b673-f3a8128a6aa0",
      label: "Alexandre Pires",
      description: "Person · Brazil",
      image: null,
      crossReferences: [],
      service: ENDPOINT,
      match: false,
    });
  });

  it("searches a service without suggestions by one reconciliation query", async () => {
    const endpoint = "https://reconcile.example.org/api";
    const service: Service = { id: "ex", name: "Example", endpoint };
    const queries = new URLSearchParams({
      queries: '{"q0":{"query":"Pires","limit":10}}',
    }).toString();
    const recording = replay({
      [endpoint]: json(
        '{"name": "Example", "identifierSpace": "https://example.org/entity/", "schemaSpace": "http://schema.org/"}',
      ),
      [`POST ${endpoint} ${queries}`]: json(
        '{"q0": {"result": [{"id": "E1", "name": "Pires", "score": 50, "match": false}]}}',
      ),
    });
    const lookup = createLookup({
      server: null,
      fetch: recording.fetch,
      services: () => [service],
    });
    expect(await lookup.search("service:ex", "any", "Pires")).toEqual([
      {
        system: "service:ex",
        iri: "https://example.org/entity/E1",
        label: "Pires",
        description: null,
        image: null,
        crossReferences: [],
        service: endpoint,
        match: false,
      },
    ]);
  });

  it("reconciles all texts in one request", async () => {
    const queries = new URLSearchParams({
      queries: '{"q0":{"query":"Clair de lune","limit":3}}',
    }).toString();
    const recording = replay({
      [`POST ${ENDPOINT} ${queries}`]: json(
        recorded("musicbrainz-reconcile-work-clair-de-lune.json"),
      ),
    });
    const lookup = createLookup({ server: null, fetch: recording.fetch, services: () => [MB] });
    const best = await lookup.reconcile("service:mb", "work", ["Clair de lune", " "]);
    expect(recording.calls.map((call) => call.method)).toEqual(["GET", "POST"]);
    expect(best).toEqual([
      {
        system: "service:mb",
        iri: "http://musicbrainz.org/work/199ec7b6-ce07-34e9-85ca-fcf89fe808c9",
        label: "Clair de Lune",
        description: null,
        image: null,
        crossReferences: [],
        service: ENDPOINT,
        match: true,
      },
      null,
    ]);
  });

  it("has no services unless given them", () => {
    const lookup = createLookup({ server: null, fetch: replay().fetch });
    expect(lookup.searchable("service:mb", "work")).toBe(false);
  });

  it("reads the services given at every request", () => {
    const lookup = createLookup({
      server: null,
      fetch: replay().fetch,
      services: () => state.profiles.services,
    });
    state.set({ profiles: [], services: [MB] });
    expect(lookup.searchable("service:mb", "work")).toBe(true);
    state.set(NO_PROFILES);
    expect(lookup.searchable("service:mb", "work")).toBe(false);
  });
});

describe("editing helpers", () => {
  it("offers the catalogue's is-a patterns per system", () => {
    const choices = isAChoices(SHIPPED);
    expect(choices.map((choice) => choice.label)).toEqual([
      "Wikidata",
      "MusicBrainz",
      "GND",
      "MeLODy / LRMoo",
      "Other vocabularies",
    ]);
    expect(choices.at(-1)?.options.map((option) => [option.text, option.types.join(", ")])).toEqual(
      [
        ["type schema:AudioObject", "recorded performance, DJ set"],
        ["type schema:VideoObject", "video"],
        ["type schema:SheetMusic", "printed or scanned edition, score encoding"],
      ],
    );
  });

  it("states and unstates a pattern", () => {
    const empty: Profile = { ...LECTURE, is_a: {} };
    const video = { type: ["schema:VideoObject"] };
    const stated = withPattern(
      withPattern(empty, "fallback", video, true),
      "wikidata",
      video,
      true,
    );
    expect(stated.is_a).toEqual({
      fallback: [{ pattern: video }],
      wikidata: [{ pattern: video }],
    });
    const audio = { type: ["schema:AudioObject"] };
    expect(withPattern(LECTURE, "fallback", video, true).is_a).toEqual({
      fallback: [{ pattern: audio }, { pattern: video }],
    });
    expect(withPattern(LECTURE, "fallback", { type: ["schema:AudioObject"] }, false).is_a).toEqual(
      {},
    );
  });

  it("moves a verb within the list only", () => {
    expect(movedVerb(LECTURE, 1, -1).verbs).toEqual(["recorded_at_on", "performed_by"]);
    expect(movedVerb(LECTURE, 0, 1).verbs).toEqual(["recorded_at_on", "performed_by"]);
    expect(movedVerb(LECTURE, 0, -1)).toBe(LECTURE);
    expect(movedVerb(LECTURE, 1, 1)).toBe(LECTURE);
  });

  it("keeps the lookup systems in the order of the choices", () => {
    const order = lookupChoices(SHIPPED, [MB]).map((choice) => choice.id);
    expect(order).toEqual([
      "wikidata",
      "musicbrainz",
      "gnd",
      "viaf",
      "melody",
      "imslp",
      "youtube",
      "isrc",
      "doi",
      "service:mb",
    ]);
    const chosen = withLookup(withLookup(LECTURE, "service:mb", true, order), "gnd", true, order);
    expect(chosen.lookup).toEqual(["wikidata", "gnd", "service:mb"]);
    expect(withLookup(chosen, "wikidata", false, order).lookup).toEqual(["gnd", "service:mb"]);
  });

  it("follows a service's change of ID or its deletion in a profile's lookup", () => {
    const looking: Profile = { ...LECTURE, lookup: ["wikidata", "service:mb"] };
    expect(withServiceLookup(looking, "mb", "mbz").lookup).toEqual(["wikidata", "service:mbz"]);
    expect(withServiceLookup(looking, "mb", null).lookup).toEqual(["wikidata"]);
    expect(withServiceLookup(LECTURE, "mb", "mbz")).toBe(LECTURE);
    expect(withServiceLookup(LECTURE, "mb", null)).toBe(LECTURE);
  });

  it("makes a new profile empty or from a catalogue type", () => {
    expect(newProfile([], null)).toEqual({
      id: "type_1",
      label: "new type",
      is_a: {},
      verbs: [],
      lookup: [],
    });
    expect(newProfile(["type_1"], null).id).toBe("type_2");
    const video = SHIPPED.types.find((type) => type.id === "video");
    if (video === undefined) throw new Error("the catalogue has video");
    expect(newProfile([], video)).toEqual({
      id: "video",
      label: "video",
      is_a: {
        fallback: [{ pattern: { type: ["schema:VideoObject"] } }],
        melody: [{ pattern: { type: ["melod:Manifestation"] } }],
        wikidata: [
          { pattern: { "wdt:P31": [{ id: "wd:Q193977" }] } },
          { pattern: { "wdt:P31": [{ id: "wd:Q98069877" }] } },
        ],
      },
      verbs: ["same_as", "recording_of", "performed_by", "recorded_at_on", "released_on"],
      lookup: ["youtube", "wikidata", "musicbrainz"],
    });
    expect(newProfile(["video"], video).id).toBe("video_2");
  });
});
