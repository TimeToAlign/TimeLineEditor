/** The events of MatchClaims; the cases are derived in `README.md`, item 7. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, ServerError } from "../src/index.ts";
import { recordedAnswer } from "./recordings.ts";

const manifest = "name: Café\n";
const parquet = Uint8Array.of(80, 65, 82, 49, 0, 80, 65, 82, 49);
const MALFORMED = "the events answer is not the events of the MatchClaims asked for";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(answer: () => Promise<Response>) {
  const stub = vi.fn(async (_input: string, _init: RequestInit) => answer());
  vi.stubGlobal("fetch", stub);
  return stub;
}

async function rejection(promise: Promise<unknown>): Promise<ServerError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ServerError);
    return error as ServerError;
  }
  throw new Error("the promise resolved");
}

/** The bytes of a sent body. */
async function sent(init: RequestInit): Promise<number[]> {
  return Array.from(new Uint8Array(await (init.body as Blob).arrayBuffer()));
}

/** The body `matchClaims` sends for `manifest` and `parquet`: "Café\n" is twelve bytes. */
const TABLE_BODY = [12, 0, 0, 0, ...new TextEncoder().encode(manifest), ...parquet];

/** `parameters` behind their length, then the table's body. */
function expectedBody(parameters: string): number[] {
  const text = Array.from(new TextEncoder().encode(parameters));
  return [text.length, 0, 0, 0, ...text, ...TABLE_BODY];
}

const CLAIM_1 = {
  id: "claim_1",
  timeline_a_id: "clt_1",
  event_a_id: "note_1",
  event_a_name: "C4",
  timeline_b_id: "dpt_1",
  event_b_id: "projection_1",
  event_b_name: null,
  certainty: 1.0,
  is_synchronous: true,
};
const CLAIM_11 = {
  id: "claim_11",
  timeline_a_id: "dpt_1",
  event_a_id: "projection_6",
  event_a_name: null,
  timeline_b_id: "cpt_1",
  event_b_id: "projection_7",
  event_b_name: null,
  certainty: 1.0,
  is_synchronous: true,
};
const CLAIM_12 = {
  id: "claim_12",
  timeline_a_id: "clt_1",
  event_a_id: "note_10",
  event_a_name: "E5",
  timeline_b_id: "dpt_1",
  event_b_id: null,
  event_b_name: null,
  certainty: 1.0,
  is_synchronous: false,
};
/** The server's answer for `claim_1`, `claim_11` and `claim_12` of the table fixture. */
const ANSWER = { claims: [CLAIM_1, CLAIM_11, CLAIM_12] };
const ASKED = ["claim_1", "claim_11", "claim_12"] as const;

describe("matchClaimEvents", () => {
  const call = (asked: readonly string[] = ASKED) =>
    connect({ url: "api/", token: "t" }).matchClaimEvents(manifest, new Blob([parquet]), asked);

  it("posts the claims, then the table's request", async () => {
    const stub = stubFetch(async () => Response.json(ANSWER));
    await call();
    expect(stub.mock.calls.length).toBe(1);
    const [input, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(input).toBe("api/match-claims/events");
    expect([init.method, init.headers]).toEqual([
      "POST",
      { Authorization: "Bearer t", "Content-Type": "application/octet-stream" },
    ]);
    expect(await sent(init)).toEqual(expectedBody('{"claims":["claim_1","claim_11","claim_12"]}'));
  });

  it("sends no claims as an empty list", async () => {
    const stub = stubFetch(async () => Response.json({ claims: [] }));
    expect(await call([])).toEqual([]);
    const [, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(await sent(init)).toEqual(expectedBody('{"claims":[]}'));
  });

  it("reads the recorded answer: the events of the claims asked for, in their order", async () => {
    stubFetch(async () => recordedAnswer("match-claims-events"));
    expect(await call()).toEqual([CLAIM_1, CLAIM_11, CLAIM_12]);
  });

  const withClaim = (at: number, claim: unknown) => ({
    claims: ANSWER.claims.map((item, index) => (index === at ? claim : item)),
  });
  const { certainty: _certainty, ...withoutCertainty } = CLAIM_1;

  it.each([
    ["other IDs", withClaim(1, { ...CLAIM_11, id: "claim_14" })],
    ["another order", { claims: [CLAIM_11, CLAIM_1, CLAIM_12] }],
    ["a MatchClaim too few", { claims: [CLAIM_1, CLAIM_11] }],
    ["a member missing", withClaim(0, withoutCertainty)],
    ["an unknown member", withClaim(0, { ...CLAIM_1, is_explicit: true })],
    ["a side's Projection", withClaim(0, { ...CLAIM_1, event_a_projection: null })],
    ["an event ID that is a number", withClaim(0, { ...CLAIM_1, event_a_id: 1 })],
    ["a certainty that is text", withClaim(0, { ...CLAIM_1, certainty: "1" })],
  ])("rejects an answer with %s", async (_case, body) => {
    stubFetch(async () => Response.json(body));
    const error = await rejection(call());
    expect([error.code, error.status, error.message]).toEqual(["status", 200, MALFORMED]);
  });

  it("rejects a refusal with the server's path and message", async () => {
    const message = "the MatchClaim table has no MatchClaim 'claim_99'";
    stubFetch(async () =>
      Response.json({ detail: { path: ["claims", 1], message } }, { status: 422 }),
    );
    const error = await rejection(call());
    expect([error.status, error.message, error.refusal]).toEqual([
      422,
      message,
      { path: ["claims", 1], message, problems: [] },
    ]);
  });
});
