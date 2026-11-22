/**
 * The server's recorded answers (`data/<name>.answer.bin`): each the body of
 * one route's answer to a fixed request, written byte for byte by the
 * server's `scripts/record_answers.py`, whose own test proves each is the
 * route's answer. `README.md`, item 9.
 */

import { readFileSync } from "node:fs";

/** The bytes of the recorded answer `name`. */
export function recorded(name: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(new URL(`./data/${name}.answer.bin`, import.meta.url)));
}

/** A 200 answer holding the recorded answer `name`, as `fetch` resolves it. */
export function recordedAnswer(name: string): Response {
  return new Response(recorded(name), { status: 200 });
}
