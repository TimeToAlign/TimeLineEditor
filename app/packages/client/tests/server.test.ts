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

/** An expanded row of four quarters in 4/4, as the server answers it. */
function bar(count: number, next: readonly number[]) {
  return {
    ID: String(count),
    count,
    qstamp: [4 * (count - 1), 1],
    number: count,
    name: String(count),
    time_signature: "4/4",
    nominal_length: [4, 1],
    actual_length: [4, 1],
    start_repeat: false,
    end_repeat: false,
    next,
    volta: null,
    offset_within_measure: [0, 1],
  };
}

/** The answer to the TimeToShare fixture `group_measure_map`. */
const expanded = {
  measure_maps: [{ id: "measuremap_1", rows: [bar(1, [2]), bar(2, [3]), bar(3, [4]), bar(4, [])] }],
};

const manifestText = '{\n  "timetoshare": "0.2.0",\n  "timelines": []\n}\n';

describe("measureMaps", () => {
  for (const [token, authorization] of [
    ["abc", { Authorization: "Bearer abc" }],
    ["", { Authorization: "Bearer " }],
    [null, {}],
  ] as const) {
    it(`posts the manifest text unchanged with ${token === null ? "no token" : `the token "${token}"`}`, async () => {
      const stub = stubFetch(async () => Response.json(expanded));
      expect(await connect({ url: "api/", token }).measureMaps(manifestText)).toStrictEqual(
        expanded.measure_maps,
      );
      expect(stub.mock.calls).toEqual([
        [
          "api/measure-maps",
          {
            method: "POST",
            headers: { ...authorization, "Content-Type": "application/json" },
            body: manifestText,
          },
        ],
      ]);
    });
  }

  it("sends one request per call and keeps nothing", async () => {
    const stub = stubFetch(async () => Response.json(expanded));
    const server = connect({ url: "http://127.0.0.1:8000/api/", token: "t" });
    await server.measureMaps(manifestText);
    await server.measureMaps(manifestText);
    expect(stub.mock.calls.map(([input]) => input)).toEqual([
      "http://127.0.0.1:8000/api/measure-maps",
      "http://127.0.0.1:8000/api/measure-maps",
    ]);
  });

  it("rejects a server that cannot expand measure maps with status 501", async () => {
    stubFetch(async () =>
      Response.json(
        {
          detail: {
            path: [],
            message: "the installed timetoalign 1.2.0 cannot expand measure maps",
          },
        },
        { status: 501, statusText: "Not Implemented" },
      ),
    );
    const error = await rejection(connect({ url: "api/", token: "" }).measureMaps(manifestText));
    expect([error.code, error.status, error.message]).toEqual([
      "status",
      501,
      "501 Not Implemented",
    ]);
  });

  it("answers no measure maps", async () => {
    stubFetch(async () => Response.json({ measure_maps: [] }));
    expect(await connect({ url: "api/", token: "" }).measureMaps(manifestText)).toEqual([]);
  });

  it("rejects an answer outside 2xx with its status", async () => {
    stubFetch(async () => new Response(null, { status: 422, statusText: "Unprocessable Content" }));
    const error = await rejection(connect({ url: "api/", token: "" }).measureMaps(manifestText));
    expect([error.code, error.status, error.message]).toEqual([
      "status",
      422,
      "422 Unprocessable Content",
    ]);
  });

  const row = bar(1, []);
  it.each([
    ["no measure_maps", JSON.stringify({})],
    ["measure_maps no list", JSON.stringify({ measure_maps: {} })],
    ["an entry without an id", JSON.stringify({ measure_maps: [{ rows: [] }] })],
    ["an entry without rows", JSON.stringify({ measure_maps: [{ id: "m" }] })],
    [
      "a qstamp no pair",
      JSON.stringify({ measure_maps: [{ id: "m", rows: [{ ...row, qstamp: 0 }] }] }),
    ],
    [
      "a count no integer",
      JSON.stringify({ measure_maps: [{ id: "m", rows: [{ ...row, count: 1.5 }] }] }),
    ],
    [
      "a numerator beyond 2^53",
      `{"measure_maps": [{"id": "m", "rows": [${JSON.stringify(row).replace('"qstamp":[0,1]', '"qstamp":[9007199254740993,1]')}]}]}`,
    ],
    [
      "a row member missing",
      JSON.stringify({ measure_maps: [{ id: "m", rows: [{ ...row, next: undefined }] }] }),
    ],
    ["no JSON", "measuremap_1"],
  ])("rejects a body with %s as malformed, with its status", async (_case, body) => {
    stubFetch(async () => new Response(body, { status: 200 }));
    const error = await rejection(connect({ url: "api/", token: "" }).measureMaps(manifestText));
    expect([error.code, error.status, error.message]).toEqual([
      "status",
      200,
      "the measure-maps answer is not a list of expanded measure maps",
    ]);
  });

  it("accepts a null qstamp and lengths, and a volta", async () => {
    const open = { ...row, qstamp: null, nominal_length: null, actual_length: null, volta: 2 };
    stubFetch(async () => Response.json({ measure_maps: [{ id: "m", rows: [open] }] }));
    expect(await connect({ url: "api/", token: "" }).measureMaps(manifestText)).toEqual([
      { id: "m", rows: [open] },
    ]);
  });
});
