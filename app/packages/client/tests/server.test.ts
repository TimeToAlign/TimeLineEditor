import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, ServerError } from "../src/index.ts";

const health = { name: "tilie-server", version: "0.1.0", timetoalign: "1.2.0" };

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Stub `fetch` with `answer`; returns the stub, whose calls are the requests. */
function stubFetch(answer: () => Promise<Response>) {
  const stub = vi.fn(async (_input: string, _init: RequestInit) => answer());
  vi.stubGlobal("fetch", stub);
  return stub;
}

/** The rejection of `promise`, which must reject with a `ServerError`. */
async function rejection(promise: Promise<unknown>): Promise<ServerError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ServerError);
    return error as ServerError;
  }
  throw new Error("the promise resolved");
}

describe("health", () => {
  for (const [token, headers] of [
    ["abc", { Authorization: "Bearer abc" }],
    ["", { Authorization: "Bearer " }],
    [null, {}],
  ] as const) {
    it(`asks <url>health with ${token === null ? "no token" : `the token "${token}"`}`, async () => {
      const stub = stubFetch(async () => Response.json(health));
      expect(await connect({ url: "api/", token }).health()).toEqual(health);
      expect(stub.mock.calls).toEqual([["api/health", { headers }]]);
    });
  }

  it("appends health to an absolute base", async () => {
    const stub = stubFetch(async () => Response.json(health));
    await connect({ url: "http://127.0.0.1:8000/api/", token: "t" }).health();
    expect(stub.mock.calls.map(([input]) => input)).toEqual(["http://127.0.0.1:8000/api/health"]);
  });

  it("rejects an answer outside 2xx with its status", async () => {
    stubFetch(async () => new Response(null, { status: 502, statusText: "Bad Gateway" }));
    const error = await rejection(connect({ url: "api/", token: "" }).health());
    expect([error.code, error.status, error.message]).toEqual(["status", 502, "502 Bad Gateway"]);
  });

  it("trims the message of a status without its text", async () => {
    stubFetch(async () => new Response(null, { status: 401 }));
    const error = await rejection(connect({ url: "api/", token: "" }).health());
    expect([error.code, error.status, error.message]).toEqual(["status", 401, "401"]);
  });

  it.each([
    ["a member missing", JSON.stringify({ name: "tilie-server", version: "0.1.0" })],
    ["a member no string", JSON.stringify({ ...health, version: 1 })],
    ["a list", JSON.stringify([health])],
    ["null", "null"],
    ["no JSON", "tilie-server 0.1.0"],
  ])("rejects a body with %s as malformed, with its status", async (_case, body) => {
    stubFetch(async () => new Response(body, { status: 200 }));
    const error = await rejection(connect({ url: "api/", token: "" }).health());
    expect([error.code, error.status, error.message]).toEqual([
      "status",
      200,
      "the health answer is not a name, a version and a timetoalign version",
    ]);
  });

  it("answers the three members alone", async () => {
    stubFetch(async () => Response.json({ ...health, extra: true }));
    expect(await connect({ url: "api/", token: "" }).health()).toStrictEqual(health);
  });

  it("rejects a request that fails as unreachable", async () => {
    const cause = new TypeError("Failed to fetch");
    stubFetch(async () => {
      throw cause;
    });
    const error = await rejection(connect({ url: "api/", token: null }).health());
    expect([error.code, error.status, error.message, error.cause]).toEqual([
      "unreachable",
      null,
      "Failed to fetch",
      cause,
    ]);
  });
});
