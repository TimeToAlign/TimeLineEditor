/** A MatchClaim's provenance and a belief; the cases are derived in `README.md`, item 6. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, ServerError } from "../src/index.ts";

const A = "https://orcid.org/0000-0002-1825-0097";
const SERVICE = "https://example.org/aligner";
const manifest = "name: Café\n";
const parquet = Uint8Array.of(80, 65, 82, 49, 0, 80, 65, 82, 49);
const MALFORMED_PROVENANCE =
  "the provenance answer is not the provenance of the MatchClaims asked for";
const MALFORMED_BELIEF = "the belief answer is not a Parquet file";

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

/** `parameters` as JSON behind their little-endian length, then the table's body. */
function expectedBody(parameters: string): number[] {
  const text = Array.from(new TextEncoder().encode(parameters));
  return [text.length & 0xff, text.length >> 8, 0, 0, ...text, ...TABLE_BODY];
}

const CLAIM_6 = {
  date: "2026-11-20",
  method: "imported",
  service: SERVICE,
  beliefs: [{ actor: A, belief: "unlikely", date: "2026-11-21", note: "the onset is blurred" }],
};
const CLAIM_1 = {
  stated_by: [A],
  date: "2026-11-20",
  method: "manual",
  beliefs: [{ actor: A, belief: "true", date: "2026-11-20" }],
};
/** The server's answer for `claim_6`, `claim_15` and `claim_1` of the table fixture. */
const ANSWER = {
  claims: [
    { id: "claim_6", provenance: CLAIM_6 },
    { id: "claim_15", provenance: null },
    { id: "claim_1", provenance: CLAIM_1 },
  ],
};
const ASKED = ["claim_6", "claim_15", "claim_1"] as const;

describe("matchClaimProvenance", () => {
  const call = (token: string | null = "t", asked: readonly string[] = ASKED) =>
    connect({ url: "api/", token }).matchClaimProvenance(manifest, new Blob([parquet]), asked);

  it("posts the claims asked for, then the table's request", async () => {
    const stub = stubFetch(async () => Response.json(ANSWER));
    await call();
    expect(stub.mock.calls.length).toBe(1);
    const [input, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(input).toBe("api/match-claims/provenance");
    expect([init.method, init.headers]).toEqual([
      "POST",
      { Authorization: "Bearer t", "Content-Type": "application/octet-stream" },
    ]);
    expect(await sent(init)).toEqual(expectedBody('{"claims":["claim_6","claim_15","claim_1"]}'));
  });

  it("sends no token header without a token", async () => {
    const stub = stubFetch(async () => Response.json(ANSWER));
    await call(null);
    const [, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ "Content-Type": "application/octet-stream" });
  });

  it("answers the provenance of the claims asked for, in their order", async () => {
    stubFetch(async () => Response.json(ANSWER));
    expect(await call()).toEqual([
      { id: "claim_6", provenance: CLAIM_6 },
      { id: "claim_15", provenance: null },
      { id: "claim_1", provenance: CLAIM_1 },
    ]);
  });

  it("answers nothing for no claims", async () => {
    stubFetch(async () => Response.json({ claims: [] }));
    expect(await call("t", [])).toEqual([]);
  });

  const withClaim = (at: number, claim: unknown) => ({
    claims: ANSWER.claims.map((item, index) => (index === at ? claim : item)),
  });
  const withProvenance = (provenance: unknown) => withClaim(0, { id: "claim_6", provenance });

  it.each([
    ["other IDs", withClaim(1, { id: "claim_14", provenance: null })],
    ["another order", { claims: [ANSWER.claims[1], ANSWER.claims[0], ANSWER.claims[2]] }],
    ["an entry too few", { claims: ANSWER.claims.slice(0, 2) }],
    ["no list", { claims: {} }],
    ["a provenance that is text", withProvenance("imported")],
    ["an unknown member", withProvenance({ ...CLAIM_6, status: "proposed" })],
    ["a stated_by that is text", withProvenance({ ...CLAIM_6, stated_by: A })],
    [
      "an unknown belief word",
      withProvenance({ ...CLAIM_6, beliefs: [{ actor: A, belief: "maybe", date: "2026-11-21" }] }),
    ],
    [
      "a belief's note that is no text",
      withProvenance({ ...CLAIM_6, beliefs: [{ actor: A, belief: "true", date: "d", note: 1 }] }),
    ],
  ])("rejects an answer with %s", async (_case, body) => {
    stubFetch(async () => Response.json(body));
    const error = await rejection(call());
    expect([error.code, error.status, error.message]).toEqual([
      "status",
      200,
      MALFORMED_PROVENANCE,
    ]);
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

describe("believeMatchClaim", () => {
  const believed = Uint8Array.of(80, 65, 82, 49, 7, 8, 9, 80, 65, 82, 49);
  const belief = { claim: "claim_6", actor: A, belief: "false", date: "2026-11-22" } as const;
  const call = (token: string | null = "t") =>
    connect({ url: "api/", token }).believeMatchClaim(manifest, new Blob([parquet]), belief);
  const answering = (bytes: Uint8Array) => async () => new Response(bytes.slice(), { status: 200 });

  it("posts the belief, then the table's request", async () => {
    const stub = stubFetch(answering(believed));
    await call();
    const [input, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(input).toBe("api/match-claims/belief");
    expect([init.method, init.headers]).toEqual([
      "POST",
      { Authorization: "Bearer t", "Content-Type": "application/octet-stream" },
    ]);
    expect(await sent(init)).toEqual(
      expectedBody(`{"claim":"claim_6","actor":"${A}","belief":"false","date":"2026-11-22"}`),
    );
  });

  it("answers the new file's bytes unchanged, as a Parquet file", async () => {
    stubFetch(answering(believed));
    const file = await call(null);
    expect(file.type).toBe("application/vnd.apache.parquet");
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual(Array.from(believed));
  });

  it.each([
    ["no bytes", Uint8Array.of()],
    ["seven bytes", Uint8Array.of(80, 65, 82, 49, 65, 82, 49)],
    ["no PAR1 at the start", Uint8Array.of(0, 65, 82, 49, 7, 80, 65, 82, 49)],
    ["no PAR1 at the end", Uint8Array.of(80, 65, 82, 49, 7, 80, 65, 82, 0)],
  ])("rejects an answer of %s", async (_case, bytes) => {
    stubFetch(answering(bytes));
    const error = await rejection(call());
    expect([error.code, error.status, error.message]).toEqual(["status", 200, MALFORMED_BELIEF]);
  });

  it("rejects a refusal with the server's problems", async () => {
    const message = "the MatchClaim 'claim_15' is missing";
    const problem = { code: "succession_missing", row: null, column: ["id"], message };
    stubFetch(async () =>
      Response.json({ detail: { path: [], message, problems: [problem] } }, { status: 422 }),
    );
    const error = await rejection(call());
    expect([error.status, error.message, error.refusal]).toEqual([
      422,
      message,
      { path: [], message, problems: [problem] },
    ]);
  });
});
