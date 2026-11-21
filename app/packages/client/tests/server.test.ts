import { readFileSync } from "node:fs";
import { anchorIndexOf } from "@timetoalign/tilie-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { beliefMask, connect, ServerError } from "../src/index.ts";

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

describe("matchClaims", () => {
  /** The server's answer to TimeToShare's table fixture, recorded by its script. */
  const recording = readFileSync(new URL("./data/match-claims.answer.bin", import.meta.url));
  const manifest = "name: Café\n";
  const parquet = Uint8Array.of(80, 65, 82, 49, 0, 80, 65, 82, 49);
  const A = "https://orcid.org/0000-0002-1825-0097";
  const B = "https://orcid.org/0000-0001-5109-3700";
  const MALFORMED = "the match-claims answer is not of the tilie-match-claims layout";

  /** A fresh copy of `bytes` as the body of a 200 answer. */
  const answering = (bytes: Uint8Array) => async () => new Response(bytes.slice(), { status: 200 });

  const call = (token: string | null = "t") =>
    connect({ url: "api/", token }).matchClaims(manifest, new Blob([parquet]));

  it("posts the manifest's length, the manifest and the file", async () => {
    const stub = stubFetch(answering(recording));
    await call();
    expect(stub.mock.calls.length).toBe(1);
    const [input, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(input).toBe("api/match-claims");
    expect([init.method, init.headers]).toEqual([
      "POST",
      { Authorization: "Bearer t", "Content-Type": "application/octet-stream" },
    ]);
    const sent = new Uint8Array(await (init.body as Blob).arrayBuffer());
    // "Café\n" in UTF-8 is twelve bytes for eleven characters.
    expect(Array.from(sent)).toEqual([
      12,
      0,
      0,
      0,
      ...new TextEncoder().encode(manifest),
      ...parquet,
    ]);
  });

  it("sends no token header without a token", async () => {
    const stub = stubFetch(answering(recording));
    await call(null);
    const [, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ "Content-Type": "application/octet-stream" });
  });

  it("decodes the fixture's columns, each a view into the answer", async () => {
    stubFetch(answering(recording));
    const { columns, beliefs } = await call();
    const none = [0, 0n, 0n] as const;
    const exact = (n: number, d = 1) => [n / d, BigInt(n), BigInt(d)] as const;
    const real = (value: number) => [value, 0n, 0n] as const;
    const cells = (column: {
      position: Float64Array;
      numerator: BigInt64Array;
      denominator: BigInt64Array;
    }) =>
      Array.from(column.position, (position, row) => [
        position,
        column.numerator[row],
        column.denominator[row],
      ]);
    expect(columns.rows).toBe(15);
    expect(columns.claimIds).toEqual(Array.from({ length: 15 }, (_, row) => `claim_${row + 1}`));
    expect(columns.timelines).toEqual([
      { id: "clt_1", numberType: "fraction" },
      { id: "clt_2", numberType: "fraction" },
      { id: "cpt_1", numberType: "float" },
      { id: "dpt_1", numberType: "int" },
    ]);
    expect(Array.from(columns.a.timeline)).toEqual([0, 0, 0, 3, 0, 3, 0, 0, 0, 0, 3, 0, 0, 0, 1]);
    expect(Array.from(columns.b.timeline)).toEqual([3, 3, 3, 0, 3, 2, 2, 2, 2, 2, 2, 3, 3, 2, 3]);
    expect(Array.from(columns.startPresent)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1]);
    expect(Array.from(columns.endPresent)).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    expect(cells(columns.a.start)).toEqual([
      exact(0),
      exact(1),
      exact(3),
      exact(132300),
      exact(4),
      exact(176400),
      exact(5),
      exact(5),
      exact(6),
      exact(15, 2),
      exact(441000),
      none,
      exact(10),
      none,
      exact(1),
    ]);
    expect(cells(columns.b.start)).toEqual([
      exact(0),
      exact(44100),
      exact(132300),
      exact(3),
      exact(176400),
      real(4),
      real(5),
      real(5.25),
      real(6),
      real(7.5),
      real(10),
      none,
      exact(441000),
      none,
      exact(396900),
    ]);
    const ends = (row1: readonly unknown[], row8: readonly unknown[]) =>
      Array.from({ length: 15 }, (_, row) => (row === 1 ? row1 : row === 8 ? row8 : none));
    expect(cells(columns.a.end)).toEqual(ends(exact(2), exact(8)));
    expect(cells(columns.b.end)).toEqual(ends(exact(88200), real(8)));
    expect(beliefs.actors).toEqual([B, A]);
    expect(Array.from(beliefs.offsets)).toEqual([0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 5, 6, 6]);
    expect(Array.from(beliefs.actor)).toEqual([1, 1, 1, 1, 0, 0]);
    expect(Array.from(beliefs.word)).toEqual([0, 2, 0, 1, 0, 0]);

    const views = [
      columns.a.timeline,
      columns.b.timeline,
      columns.startPresent,
      columns.endPresent,
      ...[columns.a, columns.b].flatMap((side) =>
        [side.start, side.end].flatMap((c) => [c.position, c.numerator, c.denominator]),
      ),
      beliefs.offsets,
      beliefs.actor,
      beliefs.word,
    ];
    expect(new Set(views.map((view) => view.buffer)).size).toBe(1);
  });

  it("gives the belief filter's rows of the fixture's cases", async () => {
    stubFetch(answering(recording));
    const { beliefs } = await call();
    const rows = (mask: Uint8Array | null) =>
      mask === null ? null : Array.from(mask.keys()).filter((row) => mask[row] === 1);
    const every = Array.from({ length: 15 }, (_, row) => row);
    expect(beliefMask(beliefs, null)).toBeNull();
    expect(beliefMask(beliefs, null, "true")).toBeNull();
    expect(rows(beliefMask(beliefs, A))).toEqual(every.filter((row) => row !== 12));
    expect(rows(beliefMask(beliefs, A, "true"))).toEqual([0, 10]);
    expect(rows(beliefMask(beliefs, B, "true"))).toEqual([12, 13]);
    expect(rows(beliefMask(beliefs, B))).toEqual(every);
    expect(rows(beliefMask(beliefs, "https://example.org/nobody"))).toEqual(every);
    expect(rows(beliefMask(beliefs, "https://example.org/nobody", "true"))).toEqual([]);
    expect(() => beliefMask(beliefs, A, "false" as "true")).toThrow(
      new RangeError("'false' is no belief filter: write 'not_false' or 'true'"),
    );
  });

  it("builds the anchor index of the fixture's expected anchors", async () => {
    stubFetch(answering(recording));
    const { columns, beliefs } = await call();
    // expected.yaml: [believer, filter, unique anchors, potential MatchStamps]
    for (const [believer, belief, anchors, stamps] of [
      [null, "not_false", 14, 11],
      [A, "not_false", 13, 11],
      [A, "true", 2, 2],
      [B, "true", 1, 1],
    ] as const) {
      const index = anchorIndexOf(columns, beliefMask(beliefs, believer, belief));
      expect([index.anchors.count, index.matchStamps.count]).toEqual([anchors, stamps]);
    }
  });

  it("rejects a refused table with the check's problems", async () => {
    const problem = {
      code: "unknown_timeline",
      row: 14,
      column: ["timeline_a_id"],
      message: "the manifest has no timeline 'clt_2'",
    };
    stubFetch(async () =>
      Response.json(
        { detail: { path: [], message: problem.message, problems: [problem] } },
        { status: 422 },
      ),
    );
    const error = await rejection(call());
    expect([error.code, error.status, error.message, error.refusal]).toEqual([
      "status",
      422,
      problem.message,
      { path: [], message: problem.message, problems: [problem] },
    ]);
  });

  it("rejects a refusal without problems with its path and message", async () => {
    const message = "the installed timetoalign 1.2.0 cannot read MatchClaim tables";
    stubFetch(async () => Response.json({ detail: { path: [], message } }, { status: 501 }));
    const error = await rejection(call());
    expect([error.status, error.message, error.refusal]).toEqual([
      501,
      message,
      { path: [], message, problems: [] },
    ]);
  });

  it.each([
    ["no body", null],
    ["a detail that is text", JSON.stringify({ detail: "missing or invalid token" })],
    [
      "a problem without a code",
      JSON.stringify({ detail: { path: [], message: "m", problems: [{}] } }),
    ],
  ])("rejects an answer outside 2xx with %s by its status", async (_case, body) => {
    stubFetch(async () => new Response(body, { status: 401, statusText: "Unauthorized" }));
    const error = await rejection(call());
    expect([error.code, error.status, error.message, error.refusal]).toEqual([
      "status",
      401,
      "401 Unauthorized",
      null,
    ]);
  });

  /** The recording with its header changed by `change` and the arrays kept where they lie. */
  function withHeader(change: (header: Record<string, unknown>) => void): Uint8Array {
    const view = new DataView(recording.buffer, recording.byteOffset, recording.byteLength);
    const length = view.getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(recording.subarray(4, 4 + length)));
    change(header);
    const text = new TextEncoder().encode(JSON.stringify(header));
    const base = Math.ceil((4 + text.length) / 8) * 8;
    const arrays = recording.subarray(Math.ceil((4 + length) / 8) * 8);
    const bytes = new Uint8Array(base + arrays.length);
    new DataView(bytes.buffer).setUint32(0, text.length, true);
    bytes.set(text, 4);
    bytes.set(arrays, base);
    return bytes;
  }

  const placed = (header: Record<string, unknown>) => header.arrays as Record<string, number[]>;
  /** The bytes of the first fourteen claim IDs joined by line feeds. */
  const fourteenIds = Array.from({ length: 14 }, (_, row) => `claim_${row + 1}`).join("\n").length;

  it("decodes the recording rebuilt unchanged", async () => {
    stubFetch(answering(withHeader(() => {})));
    expect((await call()).columns.rows).toBe(15);
  });

  it.each([
    ["three bytes", recording.subarray(0, 3)],
    ["a header longer than the answer", Uint8Array.of(255, 0, 0, 0, 123)],
    ["a header that is no JSON", Uint8Array.of(1, 0, 0, 0, 123)],
    ["a header that is a list", Uint8Array.of(2, 0, 0, 0, 91, 93)],
    [
      "another format",
      withHeader((h) => {
        h.format = "arrow";
      }),
    ],
    [
      "version 2",
      withHeader((h) => {
        h.version = 2;
      }),
    ],
    [
      "other belief words",
      withHeader((h) => {
        h.beliefs = ["true", "false"];
      }),
    ],
    [
      "an unknown number type",
      withHeader((h) => {
        h.timelines = [{ id: "t", number_type: "real" }];
      }),
    ],
    [
      "an array missing",
      withHeader((h) => {
        delete placed(h)["b.end.numerator"];
      }),
    ],
    [
      "an array beyond the answer",
      withHeader((h) => {
        placed(h).belief_words = [8000, 6];
      }),
    ],
    [
      "an array misaligned",
      withHeader((h) => {
        placed(h)["a.start.position"] = [260, 15];
      }),
    ],
    [
      "a.timeline of 14 entries",
      withHeader((h) => {
        placed(h)["a.timeline"] = [128, 14];
      }),
    ],
    [
      "fourteen claim IDs",
      withHeader((h) => {
        placed(h).claim_ids = [0, fourteenIds];
      }),
    ],
    [
      "a belief of no actor",
      withHeader((h) => {
        h.actors = [B];
      }),
    ],
  ])("rejects an answer with %s as malformed", async (_case, bytes) => {
    stubFetch(answering(bytes));
    const error = await rejection(call());
    expect([error.code, error.status, error.message]).toEqual(["status", 200, MALFORMED]);
  });
});
