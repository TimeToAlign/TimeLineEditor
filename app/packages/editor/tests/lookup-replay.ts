/**
 * The replaying `fetch` of the lookup tests (README "Looking values up"):
 * it serves the answers recorded in `lookup/`, by the key `index.json`
 * gives each request, records every call, and rejects any other request.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), "lookup");

/** The recorded index: request key → file. */
const INDEX: Readonly<Record<string, string>> = JSON.parse(
  readFileSync(path.join(DIRECTORY, "index.json"), "utf8"),
);

/** The server the route's answers were recorded at. */
export const RECORDED_SERVER = { url: "http://127.0.0.1:8000/api/", token: "recorded-token" };

/** One request the replaying fetch was given. */
export interface Call {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
}

export interface Replay {
  readonly fetch: typeof fetch;
  readonly calls: Call[];
  /** The URLs of the calls, in order. */
  urls(): string[];
}

/** The key of a request in the index: a GET by its URL, a POST by `POST <url> <form body>`. */
export function keyOf(method: string, url: string, body: string | null): string {
  return method === "POST" ? `POST ${url} ${body ?? ""}` : url;
}

/** The text of a recorded file. */
export function recorded(file: string): string {
  return readFileSync(path.join(DIRECTORY, file), "utf8");
}

/**
 * A replaying fetch. `answers` serves further requests by key before the
 * recordings (an error status, a malformed body); a function there may
 * also reject.
 */
export function replay(answers: Readonly<Record<string, () => Promise<Response>>> = {}): Replay {
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body === undefined || init.body === null ? null : String(init.body);
    calls.push({ method, url, headers: { ...(init?.headers as Record<string, string>) }, body });
    if (init?.signal?.aborted) throw init.signal.reason;
    const key = keyOf(method, url, body);
    const answer = answers[key];
    if (answer !== undefined) return answer();
    const file = INDEX[key];
    if (file === undefined) throw new TypeError(`no recorded answer for ${key}`);
    return new Response(recorded(file), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetch: fetcher, calls, urls: () => calls.map((call) => call.url) };
}
