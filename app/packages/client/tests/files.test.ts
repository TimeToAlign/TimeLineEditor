/** The file calls; the cases are derived in `README.md`, item 8. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fileCalls, type Transport } from "../src/files.ts";
import { connect, ServerError } from "../src/index.ts";
import { recordedAnswer } from "./recordings.ts";

const HEADERS = { Authorization: "Bearer t" } as const;
const MALFORMED_LISTING = "the folder answer is not a listing of the folder asked for";
const MALFORMED_WRITTEN = "the write answer is not the file written";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A malformed answer, as the transport reports it. */
class Malformed extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A refusal the transport rejects with: the answer's status and the server's message. */
class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * A transport standing in for `connect`'s over the stubbed `fetch`: it asks
 * `api/<route>`, records what it is given, resolves a 2xx answer and rejects
 * any other with the server's message.
 */
function transport(answer: () => Response) {
  const fetched = vi.fn(async (_input: string, _init: RequestInit) => answer());
  vi.stubGlobal("fetch", fetched);
  const requests: [string, RequestInit, boolean][] = [];
  const stood: Transport = {
    headers: HEADERS,
    async request(route, init, explained) {
      requests.push([route, init, explained]);
      const response = await fetch(`api/${route}`, init);
      if (response.ok) return response;
      const body: { detail: { message: string } } = await response.json();
      throw new Refused(response.status, body.detail.message);
    },
    malformed: (status, message) => new Malformed(status, message),
  };
  return { calls: fileCalls(stood), requests, fetched };
}

async function rejection<E extends Error>(
  promise: Promise<unknown>,
  type: new (...args: never[]) => E,
) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(type);
    return error as E;
  }
  throw new Error("the promise resolved");
}

const refusal = (status: number, message: string) => () =>
  Response.json({ detail: { path: ["path"], message } }, { status });

describe("listFolder", () => {
  const LISTING = {
    path: "sub dir/ä",
    entries: [
      { name: "d", kind: "folder" },
      { name: "a.yaml", kind: "file" },
    ],
  };

  it("asks for the path as one query parameter and reads the listing", async () => {
    const { calls, requests, fetched } = transport(() => recordedAnswer("folders"));
    expect(await calls.listFolder("sub dir/ä")).toEqual(LISTING);
    expect(requests).toEqual([["folders?path=sub+dir%2F%C3%A4", { headers: HEADERS }, true]]);
    expect(fetched.mock.calls).toEqual([
      ["api/folders?path=sub+dir%2F%C3%A4", { headers: HEADERS }],
    ]);
  });

  it("asks for the root with the empty path", async () => {
    const { calls, requests } = transport(() => Response.json({ path: "", entries: [] }));
    expect(await calls.listFolder("")).toEqual({ path: "", entries: [] });
    expect(requests.map(([route]) => route)).toEqual(["folders?path="]);
  });

  it("rejects with the server's refusal", async () => {
    const { calls } = transport(refusal(400, "path outside the root"));
    const error = await rejection(calls.listFolder("../x"), Refused);
    expect([error.status, error.message]).toEqual([400, "path outside the root"]);
  });

  for (const [what, body] of [
    ["another path", { ...LISTING, path: "sub" }],
    ["an entry of another kind", { ...LISTING, entries: [{ name: "x", kind: "link" }] }],
    [
      "an entry with a member more",
      { ...LISTING, entries: [{ name: "x", kind: "file", size: 1 }] },
    ],
    ["entries that are no list", { ...LISTING, entries: {} }],
  ] as const) {
    it(`rejects an answer with ${what}`, async () => {
      const { calls } = transport(() => Response.json(body));
      const error = await rejection(calls.listFolder("sub dir/ä"), Malformed);
      expect([error.status, error.message]).toEqual([200, MALFORMED_LISTING]);
    });
  }

  it("rejects an answer that is no JSON", async () => {
    const { calls } = transport(() => new Response("{"));
    const error = await rejection(calls.listFolder("sub dir/ä"), Malformed);
    expect([error.status, error.message]).toEqual([200, MALFORMED_LISTING]);
  });
});

describe("readFile", () => {
  it("asks for the file and resolves to its bytes", async () => {
    const { calls, requests } = transport(() => recordedAnswer("files-get"));
    const file = await calls.readFile("a.yaml");
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual([120, 58, 32, 49, 10]);
    expect(requests).toEqual([["files?path=a.yaml", { headers: HEADERS }, true]]);
  });

  it("rejects with the server's refusal", async () => {
    const { calls } = transport(refusal(404, "no such file"));
    const error = await rejection(calls.readFile("nope.yaml"), Refused);
    expect([error.status, error.message]).toEqual([404, "no such file"]);
  });
});

describe("writeFile", () => {
  const WRITE = {
    method: "PUT",
    headers: { ...HEADERS, "Content-Type": "application/octet-stream" },
  };

  it("puts a string as its UTF-8 bytes and reads the file written", async () => {
    const { calls, requests, fetched } = transport(() => recordedAnswer("files-put"));
    expect(await calls.writeFile("sub/new.tle.json", "y: ä\n")).toEqual({
      path: "sub/new.tle.json",
      size: 6,
    });
    expect(requests).toEqual([
      ["files?path=sub%2Fnew.tle.json", { ...WRITE, body: "y: ä\n" }, true],
    ]);
    const sent = new Request("http://127.0.0.1/", fetched.mock.calls[0]?.[1]);
    expect(Array.from(new Uint8Array(await sent.arrayBuffer()))).toEqual([
      121, 58, 32, 195, 164, 10,
    ]);
  });

  it("puts a Blob unchanged", async () => {
    const { calls, requests } = transport(() => Response.json({ path: "t.tle.json", size: 3 }));
    const blob = new Blob([Uint8Array.of(0, 255, 7)]);
    expect(await calls.writeFile("t.tle.json", blob)).toEqual({ path: "t.tle.json", size: 3 });
    expect(requests).toEqual([["files?path=t.tle.json", { ...WRITE, body: blob }, true]]);
  });

  it("rejects with the server's refusal of a foreign kind", async () => {
    const message = "TimeLineEditor writes only workspace files";
    const { calls } = transport(refusal(403, message));
    const error = await rejection(calls.writeFile("sub/c.txt", "x"), Refused);
    expect([error.status, error.message]).toEqual([403, message]);
  });

  for (const [what, body] of [
    ["another path", { path: "sub/other.tle.json", size: 6 }],
    ["a negative size", { path: "sub/new.tle.json", size: -1 }],
    ["a fractional size", { path: "sub/new.tle.json", size: 1.5 }],
    ["a size that is a string", { path: "sub/new.tle.json", size: "6" }],
  ] as const) {
    it(`rejects an answer with ${what}`, async () => {
      const { calls } = transport(() => Response.json(body));
      const error = await rejection(calls.writeFile("sub/new.tle.json", "y: ä\n"), Malformed);
      expect([error.status, error.message]).toEqual([200, MALFORMED_WRITTEN]);
    });
  }
});

describe("connect", () => {
  it("gives its Server the file calls over its own transport", async () => {
    const fetched = vi.fn(async (_input: string, _init: RequestInit) =>
      Response.json(
        { detail: { path: ["path"], message: "path outside the root" } },
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetched);
    const error = await rejection(
      connect({ url: "api/", token: "t" }).listFolder("sub"),
      ServerError,
    );
    expect(fetched.mock.calls).toEqual([
      ["api/folders?path=sub", { headers: { Authorization: "Bearer t" } }],
    ]);
    expect([error.code, error.status, error.message]).toEqual([
      "status",
      400,
      "path outside the root",
    ]);
    expect(error.refusal?.path).toEqual(["path"]);
  });
});
