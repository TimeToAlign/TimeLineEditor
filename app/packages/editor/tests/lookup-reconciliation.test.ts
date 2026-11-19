/**
 * The Reconciliation Service API client and MusicBrainz through the
 * server; the expected values are stated in `README.md` ("Looking values up").
 */

import { describe, expect, it } from "vitest";
import {
  type Candidate,
  createLookup,
  LookupError,
  ReconciliationClient,
} from "../src/lookup/index.ts";
import { keyOf, RECORDED_SERVER, replay } from "./lookup-replay.ts";

const ENDPOINT = "http://127.0.0.1:8000/api/reconcile/musicbrainz";
const SUGGEST = `${ENDPOINT}/suggest/entity`;
const AUTH = { Authorization: "Bearer recorded-token" };
const MB = "http://musicbrainz.org/";
const WS = "https://musicbrainz.org/ws/2/";
const WORK = "work/8d331505-4d88-39ae-81c7-bec5da77af96";

/** The form body of a POST holding one JSON text. */
const form = (name: string, value: unknown) =>
  new URLSearchParams({ [name]: JSON.stringify(value) }).toString();

const clientOf = (fetch: typeof globalThis.fetch) =>
  new ReconciliationClient(ENDPOINT, { fetch, headers: AUTH, system: "musicbrainz" });

const lookupOf = (fetch: typeof globalThis.fetch) =>
  createLookup({ fetch, server: RECORDED_SERVER });

/** A MusicBrainz candidate, as the README reads one from the service. */
function found(id: string, label: string, description: string | null, match = false): Candidate {
  return {
    system: "musicbrainz",
    iri: MB + id,
    label,
    description,
    image: null,
    crossReferences: [],
    service: WS,
    match,
  };
}

describe("the reconciliation client", () => {
  it("reads the manifest once (musicbrainz-manifest.json)", async () => {
    const r = replay();
    const client = clientOf(r.fetch);
    const manifest = await client.manifest();
    expect(manifest).toEqual({
      versions: ["0.2"],
      name: "MusicBrainz through tilie-server",
      identifierSpace: "http://musicbrainz.org/",
      schemaSpace: "http://schema.org/",
      defaultTypes: [
        { id: "work", name: "work" },
        { id: "artist", name: "artist" },
        { id: "recording", name: "recording" },
        { id: "release-group", name: "release group" },
      ],
      view: { url: "https://musicbrainz.org/{{id}}" },
      suggest: {
        entity: { service_url: "/api/reconcile/musicbrainz", service_path: "/suggest/entity" },
      },
      extend: {
        propose_properties: {
          service_url: "/api/reconcile/musicbrainz",
          service_path: "/properties",
        },
      },
    });
    expect(await client.manifest()).toBe(manifest);
    expect(await client.iriOf(WORK)).toBe(`${MB}${WORK}`);
    expect(r.calls).toEqual([{ method: "GET", url: ENDPOINT, headers: AUTH, body: null }]);
  });

  it("asks for the manifest again after a failed read", async () => {
    let failures = 1;
    const r = replay({
      [ENDPOINT]: async () => {
        if (failures-- > 0) return new Response("", { status: 503, statusText: "Busy" });
        return new Response(JSON.stringify({ name: "n", identifierSpace: "i", schemaSpace: "s" }));
      },
    });
    const client = clientOf(r.fetch);
    await expect(client.manifest()).rejects.toMatchObject({ code: "status", status: 503 });
    expect(await client.manifest()).toEqual({ name: "n", identifierSpace: "i", schemaSpace: "s" });
    expect(r.urls()).toEqual([ENDPOINT, ENDPOINT]);
  });

  it("resolves a relative endpoint against the base", () => {
    const client = new ReconciliationClient("api/reconcile/musicbrainz", {
      base: "http://127.0.0.1:8000/",
    });
    expect(client.endpoint).toBe(ENDPOINT);
  });

  it("suggests at the manifest's suggest service (musicbrainz-search-agent-pires.json)", async () => {
    const r = replay();
    const suggested = await clientOf(r.fetch).suggest("Pires", "artist");
    expect(suggested.slice(0, 3)).toEqual([
      {
        id: "artist/7f3a2f7e-6277-4d72-b673-f3a8128a6aa0",
        name: "Alexandre Pires",
        description: "Person · Brazil",
      },
      {
        id: "artist/988d39d6-eafd-4ae7-8cab-50a6448a9216",
        name: "PIRES",
        description: "Person · Portuguese house DJ and producer",
      },
      {
        id: "artist/64cf3646-fde3-4f5e-8741-8b4d21917785",
        name: "Maria João Pires",
        description: "Person · pianist · Portugal",
      },
    ]);
    expect(suggested).toHaveLength(10);
    expect(suggested[5]).toEqual({
      id: "artist/2d7a72cf-bf06-4234-8d1a-59d0d1241c13",
      name: "Djalma Pires",
    });
    expect(r.calls).toEqual([
      { method: "GET", url: ENDPOINT, headers: AUTH, body: null },
      { method: "GET", url: `${SUGGEST}?prefix=Pires&type=artist`, headers: AUTH, body: null },
    ]);
  });

  it("reconciles in one POST form (musicbrainz-reconcile-work-clair-de-lune.json)", async () => {
    const r = replay();
    const queries = { q0: { query: "Clair de lune", type: "work", limit: 3 } };
    expect(await clientOf(r.fetch).reconcile(queries)).toEqual({
      q0: [
        {
          id: "work/199ec7b6-ce07-34e9-85ca-fcf89fe808c9",
          name: "Clair de Lune",
          score: 100,
          match: true,
          type: [{ id: "work", name: "work" }],
        },
        {
          id: "work/a5c964fc-933f-40c9-a5c0-721ae34fc37a",
          name: "Clair de Lune",
          description: "Song",
          score: 99,
          match: false,
          type: [{ id: "work", name: "work" }],
        },
        {
          id: "work/5439be51-bc87-4fcd-bf6e-7e34377b7030",
          name: "Clair de lune",
          description: "Song",
          score: 99,
          match: false,
          type: [{ id: "work", name: "work" }],
        },
      ],
    });
    expect(r.calls).toEqual([
      { method: "POST", url: ENDPOINT, headers: AUTH, body: form("queries", queries) },
    ]);
  });

  it("extends in one POST form (musicbrainz-extend-work-8d331505.json)", async () => {
    const r = replay();
    expect(await clientOf(r.fetch).extend([WORK], ["name", "sameAs"])).toEqual({
      [WORK]: {
        name: [{ str: "Suite bergamasque, L. 75, CD 82 : III. Clair de lune" }],
        sameAs: [{ str: "http://www.wikidata.org/entity/Q29117946" }],
      },
    });
    const extend = { ids: [WORK], properties: [{ id: "name" }, { id: "sameAs" }] };
    expect(r.calls).toEqual([
      { method: "POST", url: ENDPOINT, headers: AUTH, body: form("extend", extend) },
    ]);
  });

  it("refuses an answer missing a query's candidates as malformed", async () => {
    const queries = { q0: { query: "x" } };
    const r = replay({
      [keyOf("POST", ENDPOINT, form("queries", queries))]: async () =>
        new Response(JSON.stringify({ q1: { result: [] } })),
    });
    const asked = clientOf(r.fetch).reconcile(queries);
    await expect(asked).rejects.toBeInstanceOf(LookupError);
    await expect(asked).rejects.toMatchObject({
      system: "musicbrainz",
      code: "malformed",
      message: "its answer is no list of candidates for the query 'q0'",
    });
  });
});

describe("MusicBrainz through the lookup", () => {
  it("searches artists by suggestion (musicbrainz-search-agent-pires.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).search("musicbrainz", "agent", "Pires")).toEqual([
      found("artist/7f3a2f7e-6277-4d72-b673-f3a8128a6aa0", "Alexandre Pires", "Person · Brazil"),
      found(
        "artist/988d39d6-eafd-4ae7-8cab-50a6448a9216",
        "PIRES",
        "Person · Portuguese house DJ and producer",
      ),
      found(
        "artist/64cf3646-fde3-4f5e-8741-8b4d21917785",
        "Maria João Pires",
        "Person · pianist · Portugal",
      ),
      found("artist/8d9c00a1-7da4-4fcd-a521-bc116dde80b9", "Les Pires", "Group · France"),
      found("artist/e6e5fdb0-2f22-48a8-bf0c-ee1743940a20", "Sandra Pires", "Person · Austria"),
      found("artist/2d7a72cf-bf06-4234-8d1a-59d0d1241c13", "Djalma Pires", null),
      found(
        "artist/29b8a697-236e-4bd9-a36d-bcd0646d07be",
        "Telmo Pires",
        "Person · portugees fado · Portugal",
      ),
      found(
        "artist/9012df03-d8f6-4888-89ff-44a7062961ea",
        "Carla Pires",
        "Person · fado singer · Portugal",
      ),
      found(
        "artist/c9cfc7f4-da2a-44d7-95d9-3f3a5e117a2d",
        "David Pires",
        "Person · Portuguese Music Artist from Luxembourg",
      ),
      found(
        "artist/07b1a6b0-07a3-45c3-96af-e655e9e3d1de",
        "Barbara Pires",
        "Person · Gospel singer · New Bedford",
      ),
    ]);
    expect(r.calls.map((call) => call.headers)).toEqual([AUTH, AUTH]);
  });

  it("reconciles a work and an artist, one request each, the best with its match", async () => {
    const r = replay();
    const lookup = lookupOf(r.fetch);
    expect(await lookup.reconcile("musicbrainz", "work", ["Clair de lune"])).toEqual([
      found("work/199ec7b6-ce07-34e9-85ca-fcf89fe808c9", "Clair de Lune", null, true),
    ]);
    expect(await lookup.reconcile("musicbrainz", "agent", ["Maria João Pires"])).toEqual([
      found(
        "artist/64cf3646-fde3-4f5e-8741-8b4d21917785",
        "Maria João Pires",
        "Person · pianist · Portugal",
        true,
      ),
    ]);
    expect(r.calls.map(({ method, body }) => [method, body])).toEqual([
      ["GET", null],
      ["POST", form("queries", { q0: { query: "Clair de lune", type: "work", limit: 3 } })],
      ["POST", form("queries", { q0: { query: "Maria João Pires", type: "artist", limit: 3 } })],
    ]);
  });

  it("reconciles blank texts and unsupported kinds to null without a request", async () => {
    const r = replay();
    const lookup = lookupOf(r.fetch);
    expect(await lookup.reconcile("musicbrainz", "work", ["", " "])).toEqual([null, null]);
    expect(await lookup.reconcile("musicbrainz", "class", ["video"])).toEqual([null]);
    expect(r.calls).toEqual([]);
  });

  it("resolves a work with its cross-references (musicbrainz-extend-work-8d331505.json)", async () => {
    const r = replay();
    expect(await lookupOf(r.fetch).resolve("musicbrainz", MB + WORK)).toEqual({
      system: "musicbrainz",
      iri: MB + WORK,
      label: "Suite bergamasque, L. 75, CD 82 : III. Clair de lune",
      description: null,
      image: null,
      crossReferences: [{ system: "wikidata", iri: "http://www.wikidata.org/entity/Q29117946" }],
      service: WS,
      match: false,
    });
  });

  it("reports the server's detail of a failed upstream request", async () => {
    const r = replay({
      [`${SUGGEST}?prefix=Pires&type=artist`]: async () =>
        new Response(JSON.stringify({ detail: "MusicBrainz could not be reached" }), {
          status: 502,
          statusText: "Bad Gateway",
        }),
    });
    await expect(lookupOf(r.fetch).search("musicbrainz", "agent", "Pires")).rejects.toMatchObject({
      system: "musicbrainz",
      code: "status",
      status: 502,
      message: "it answered 502 Bad Gateway: MusicBrainz could not be reached",
    });
  });
});
