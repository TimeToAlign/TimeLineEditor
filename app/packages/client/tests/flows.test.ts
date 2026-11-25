/** The flows of a timeline; the cases are derived in `README.md`, item 10. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { connect, ServerError } from "../src/index.ts";
import { recorded, recordedAnswer } from "./recordings.ts";

const manifest = "name: Café\n";
const MALFORMED = "the flows answer is not the flows of the timeline asked for";
const NO_MANIFEST = "the flow-maps answer is not a manifest";
const EDITOR = "https://example.org/people/editor";

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

/** `parameters` behind their length, then the manifest: "Café\n" is twelve bytes. */
function expectedBody(parameters: string): number[] {
  const text = Array.from(new TextEncoder().encode(parameters));
  const file = Array.from(new TextEncoder().encode(manifest));
  expect(file.length).toBe(12);
  return [text.length, 0, 0, 0, ...text, ...file];
}

const server = () => connect({ url: "api/", token: "t" });

/** The flows TimeToShare expects of `flow/sonata_exposition`, its runs joined. */
const SONATA = {
  timeline: "score",
  number_type: "fraction",
  atomic_sections: [
    { name: "A", start: [0, 1], end: [12, 1] },
    { name: "B", start: [12, 1], end: [16, 1] },
    { name: "C", start: [16, 1], end: [24, 1] },
  ],
  conventions: {
    default: {
      runs: [
        [
          [0, 1],
          [16, 1],
        ],
        [
          [0, 1],
          [12, 1],
        ],
        [
          [16, 1],
          [24, 1],
        ],
      ],
      sections: ["A", "B", "A", "C"],
      findings: [],
    },
    single: {
      runs: [
        [
          [0, 1],
          [12, 1],
        ],
        [
          [16, 1],
          [24, 1],
        ],
      ],
      sections: ["A", "C"],
    },
    printed: {
      runs: [
        [
          [0, 1],
          [24, 1],
        ],
      ],
      sections: ["A", "B", "C"],
    },
  },
};

/** An answer on an integer axis: 100 samples, one jump at 60 back to the start. */
const SAMPLES = {
  timeline: "take",
  number_type: "int",
  atomic_sections: [
    { name: "A", start: 0, end: 60 },
    { name: "B", start: 60, end: 100 },
  ],
  conventions: {
    default: {
      runs: [
        [0, 60],
        [0, 100],
      ],
      sections: ["A", "A", "B"],
      findings: [],
    },
    single: { runs: [[0, 100]], sections: ["A", "B"] },
    printed: { runs: [[0, 100]], sections: ["A", "B"] },
  },
};

/** An answer on a float axis, asked with one convention. */
const SECONDS = {
  timeline: "take",
  number_type: "float",
  atomic_sections: [
    { name: "A", start: 0, end: 2.5 },
    { name: "B", start: 2.5, end: 10 },
  ],
  conventions: { printed: { runs: [[0, 10]], sections: ["A", "B"] } },
};

describe("flows", () => {
  it("posts the timeline, then the manifest's text", async () => {
    const stub = stubFetch(async () => Response.json(SONATA));
    await server().flows(manifest, "score");
    expect(stub.mock.calls.length).toBe(1);
    const [input, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(input).toBe("api/flows");
    expect([init.method, init.headers]).toEqual([
      "POST",
      { Authorization: "Bearer t", "Content-Type": "application/octet-stream" },
    ]);
    expect(await sent(init)).toEqual(expectedBody('{"timeline":"score"}'));
  });

  it("sends the options given, in their order, and no other", async () => {
    const stub = stubFetch(async () =>
      Response.json({ ...SONATA, conventions: { single: SONATA.conventions.single } }),
    );
    await server().flows(manifest, "score", { believer: EDITOR, convention: "single" });
    await server().flows(manifest, "score", { convention: "single" });
    const bodies = await Promise.all(stub.mock.calls.map(([, init]) => sent(init as RequestInit)));
    expect(bodies).toEqual([
      expectedBody(`{"timeline":"score","convention":"single","believer":"${EDITOR}"}`),
      expectedBody('{"timeline":"score","convention":"single"}'),
    ]);
  });

  it("sends no Authorization header for a null token", async () => {
    const stub = stubFetch(async () => Response.json(SONATA));
    await connect({ url: "api/", token: null }).flows(manifest, "score");
    const [, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ "Content-Type": "application/octet-stream" });
  });

  it("reads the recorded answer: the sonata exposition's three flows", async () => {
    stubFetch(async () => recordedAnswer("flows"));
    expect(await server().flows(manifest, "score")).toStrictEqual(SONATA);
  });

  it("reads the recorded answer with findings, asked with one convention", async () => {
    stubFetch(async () => recordedAnswer("flows-findings"));
    const answer = await server().flows(manifest, "score", { convention: "default" });
    expect(answer).toStrictEqual({
      timeline: "score",
      number_type: "fraction",
      atomic_sections: [
        { name: "A", start: [0, 1], end: [4, 1] },
        { name: "B", start: [4, 1], end: [12, 1] },
        { name: "C", start: [12, 1], end: [16, 1] },
        { name: "D", start: [16, 1], end: [24, 1] },
      ],
      conventions: {
        default: {
          runs: [
            [
              [0, 1],
              [16, 1],
            ],
          ],
          sections: ["A", "B", "C"],
          findings: [
            {
              kind: "undetermined_target",
              coordinate: [4, 1],
              message: expect.stringContaining("'jump_1'"),
            },
            {
              kind: "flow_ends_at_break",
              coordinate: [16, 1],
              message: expect.stringContaining("'break_1'"),
            },
            {
              kind: "never_played",
              coordinate: [16, 1],
              end: [24, 1],
              message: expect.stringContaining("[16, 24)"),
            },
          ],
        },
      },
    });
  });

  it("reads an integer axis as integers", async () => {
    stubFetch(async () => Response.json(SAMPLES));
    expect(await server().flows(manifest, "take")).toStrictEqual(SAMPLES);
  });

  it("reads a float axis as numbers", async () => {
    stubFetch(async () => Response.json(SECONDS));
    const answer = await server().flows(manifest, "take", { convention: "printed" });
    expect(answer).toStrictEqual(SECONDS);
  });

  const { single: _single, ...withoutSingle } = SONATA.conventions;
  const withSection = (section: unknown) => ({
    ...SONATA,
    atomic_sections: [section, ...SONATA.atomic_sections.slice(1)],
  });
  const withDefault = (flow: unknown) => ({
    ...SONATA,
    conventions: { ...SONATA.conventions, default: flow },
  });
  const withFinding = (finding: unknown) =>
    withDefault({ ...SONATA.conventions.default, findings: [finding] });
  const withSample = (start: unknown) => ({
    ...SAMPLES,
    atomic_sections: [{ name: "A", start, end: 60 }, SAMPLES.atomic_sections[1]],
  });
  const FINDING = { kind: "never_played", coordinate: [16, 1], end: [24, 1], message: "…" };
  const { message: _message, ...withoutMessage } = FINDING;

  it.each([
    ["another timeline", "score", { ...SONATA, timeline: "other" }],
    ["an unknown number type", "score", { ...SONATA, number_type: "decimal" }],
    ["a convention missing", "score", { ...SONATA, conventions: withoutSingle }],
    ["a bare number under fraction", "score", withSection({ name: "A", start: 0, end: [12, 1] })],
    ["a denominator 0", "score", withSection({ name: "A", start: [0, 0], end: [12, 1] })],
    [
      "an integer beyond 2^53",
      "score",
      withSection({ name: "A", start: [0, 1], end: [2 ** 53, 1] }),
    ],
    ["a fractional number under int", "take", withSample(1.5)],
    ["a pair under int", "take", withSample([0, 1])],
    [
      "a run of three values",
      "score",
      withDefault({
        ...SONATA.conventions.default,
        runs: [
          [
            [0, 1],
            [12, 1],
            [16, 1],
          ],
        ],
      }),
    ],
    [
      "a section that is no atomic section",
      "score",
      withDefault({ ...SONATA.conventions.default, sections: ["A", "D"] }),
    ],
    [
      "findings under single",
      "score",
      {
        ...SONATA,
        conventions: {
          ...SONATA.conventions,
          single: { ...SONATA.conventions.single, findings: [] },
        },
      },
    ],
    ["no findings under default", "score", withDefault(SONATA.conventions.single)],
    ["a finding of an unknown kind", "score", withFinding({ ...FINDING, kind: "lost" })],
    ["a finding with an unknown member", "score", withFinding({ ...FINDING, severity: 1 })],
    ["a finding without its message", "score", withFinding(withoutMessage)],
    ["an unknown member", "score", { ...SONATA, manifest: "flow/sonata_exposition" }],
    [
      "an unknown member of a section",
      "score",
      withSection({ name: "A", start: [0, 1], end: [12, 1], id: "region_1" }),
    ],
  ])("rejects an answer with %s", async (_case, timeline, body) => {
    stubFetch(async () => Response.json(body));
    const error = await rejection(server().flows(manifest, timeline));
    expect([error.code, error.status, error.message]).toEqual(["status", 200, MALFORMED]);
  });

  it("rejects a float answer holding a pair", async () => {
    const body = {
      ...SECONDS,
      atomic_sections: [{ name: "A", start: [0, 1], end: 2.5 }, SECONDS.atomic_sections[1]],
    };
    stubFetch(async () => Response.json(body));
    const error = await rejection(server().flows(manifest, "take", { convention: "printed" }));
    expect([error.code, error.status, error.message]).toEqual(["status", 200, MALFORMED]);
  });

  it("rejects an answer of another convention than the one asked", async () => {
    stubFetch(async () => Response.json(SONATA));
    const asked = server().flows(manifest, "score", { convention: "single" });
    const error = await rejection(asked);
    expect([error.code, error.status, error.message]).toEqual(["status", 200, MALFORMED]);
    stubFetch(async () =>
      Response.json({ ...SONATA, conventions: { printed: SONATA.conventions.printed } }),
    );
    const other = await rejection(server().flows(manifest, "score", { convention: "single" }));
    expect([other.code, other.status, other.message]).toEqual(["status", 200, MALFORMED]);
  });

  it("rejects text that is no JSON", async () => {
    stubFetch(async () => new Response("flows", { status: 200 }));
    const error = await rejection(server().flows(manifest, "score"));
    expect([error.code, error.status, error.message]).toEqual(["status", 200, MALFORMED]);
  });

  it("rejects a refusal with the server's path and message", async () => {
    const message = "the manifest has no timeline 'nothing'";
    stubFetch(async () =>
      Response.json({ detail: { path: ["timeline"], message } }, { status: 422 }),
    );
    const error = await rejection(server().flows(manifest, "nothing"));
    expect([error.status, error.message, error.refusal]).toEqual([
      422,
      message,
      { path: ["timeline"], message, problems: [] },
    ]);
  });
});

/** What the test reads of a written manifest. */
interface Written {
  readonly timelines: readonly {
    readonly regions: readonly { readonly id: string; readonly name: string }[];
  }[];
  readonly flow_maps: readonly {
    readonly convention: string;
    readonly chunks: readonly string[];
  }[];
}

describe("withFlowMaps", () => {
  it("posts the timeline, then the manifest's text", async () => {
    const stub = stubFetch(async () => Response.json({ timelines: [] }));
    await server().withFlowMaps(manifest, "score");
    await server().withFlowMaps(manifest, "score", { believer: EDITOR });
    expect(stub.mock.calls.length).toBe(2);
    const [input, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(input).toBe("api/flows/flow-maps");
    expect([init.method, init.headers]).toEqual([
      "POST",
      { Authorization: "Bearer t", "Content-Type": "application/octet-stream" },
    ]);
    expect(await sent(init)).toEqual(expectedBody('{"timeline":"score"}'));
    const [, believed] = stub.mock.calls[1] as [string, RequestInit];
    expect(await sent(believed)).toEqual(
      expectedBody(`{"timeline":"score","believer":"${EDITOR}"}`),
    );
  });

  it("reads the recorded answer: the manifest's text, unchanged", async () => {
    stubFetch(async () => recordedAnswer("flows-flow-maps"));
    const text = await server().withFlowMaps(manifest, "score");
    expect(text).toBe(new TextDecoder().decode(recorded("flows-flow-maps")));
    const written = JSON.parse(text) as Written;
    const regions = written.timelines[0]?.regions ?? [];
    expect(regions.map((region) => region.name)).toEqual(["A", "B"]);
    const names = new Map(regions.map((region) => [region.id, region.name]));
    expect(
      written.flow_maps.map((flowMap) => [
        flowMap.convention,
        flowMap.chunks.map((chunk) => names.get(chunk)),
      ]),
    ).toEqual([
      ["default", ["A", "B", "A"]],
      ["single", ["A", "B"]],
      ["printed", ["A", "B"]],
    ]);
  });

  it.each([
    ["a list", "[]"],
    ["an object without timelines", '{"flow_maps": []}'],
    ["timelines that are no list", '{"timelines": 1}'],
    ["text that is no JSON", "timelines: []\n"],
  ])("rejects an answer that is %s", async (_case, body) => {
    stubFetch(async () => new Response(body, { status: 200 }));
    const error = await rejection(server().withFlowMaps(manifest, "score"));
    expect([error.code, error.status, error.message]).toEqual(["status", 200, NO_MANIFEST]);
  });

  it("rejects a refusal with the server's path and message", async () => {
    const message = "the manifest has no timeline 'nothing'";
    stubFetch(async () =>
      Response.json({ detail: { path: ["timeline"], message } }, { status: 422 }),
    );
    const error = await rejection(server().withFlowMaps(manifest, "nothing"));
    expect([error.status, error.message, error.refusal]).toEqual([
      422,
      message,
      { path: ["timeline"], message, problems: [] },
    ]);
  });
});
