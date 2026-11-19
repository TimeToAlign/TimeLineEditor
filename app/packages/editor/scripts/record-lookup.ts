/**
 * Record the answers the lookup tests and the end-to-end suite replay, into
 * `tests/lookup/`: one JSON file per request and `index.json`, which maps
 * each request to its file. A GET request's key is its URL; a POST
 * request's key is `POST <url> <form body>`.
 *
 *     node scripts/record-lookup.ts
 *         asks Wikidata, lobid-gnd and YouTube themselves, one request a
 *         second, with a User-Agent naming this repository and nothing else.
 *
 *     node scripts/record-lookup.ts --route <server directory>
 *         answers the server's MusicBrainz endpoint from `tilie-server`'s
 *         own test application (`uv run` in that directory), which replays
 *         the MusicBrainz answers recorded for the server's tests
 *         (`tests/data/musicbrainz/`). A reconciliation query asks for 3
 *         candidates, the server's recordings hold searches for 5: such a
 *         search is answered with the first 3 entities of the recorded one.
 *
 * Each mode makes exactly the calls of its list below through the lookup
 * itself, so the recorded keys are the requests the code sends. Existing
 * entries of the other mode are kept.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLookup, type Lookup } from "../src/lookup/index.ts";

const DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tests", "lookup");
const INDEX = path.join(DIRECTORY, "index.json");

/** The User-Agent of the live requests: the repository, never a person. */
const USER_AGENT = "TimeLineEditor-lookup-recorder (https://github.com/TimeToAlign/TimeLineEditor)";

/** Milliseconds between two live requests. */
const INTERVAL = 1000;

/** The server the route mode answers as, and its token. */
const RECORDED_SERVER = { url: "http://127.0.0.1:8000/api/", token: "recorded-token" };

/** Files named for what they hold rather than for the call that first asked for them. */
const NAMED: Readonly<Record<string, string>> = {
  [`${RECORDED_SERVER.url}reconcile/musicbrainz`]: "musicbrainz-manifest.json",
};

/** Biome, which formats the written files as the repository's check expects. */
const BIOME = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "node_modules",
  ".bin",
  "biome",
);

interface Call {
  readonly name: string;
  readonly run: (lookup: Lookup) => Promise<unknown>;
}

const LIVE: readonly Call[] = [
  {
    name: "wikidata-search-agent-maria-joao-pires",
    run: (l) => l.search("wikidata", "agent", "Maria João Pires"),
  },
  {
    name: "wikidata-search-work-clair-de-lune",
    run: (l) => l.search("wikidata", "work", "Clair de lune"),
  },
  { name: "wikidata-search-class-video", run: (l) => l.search("wikidata", "class", "video") },
  {
    name: "wikidata-entity-Q235650",
    run: (l) => l.resolve("wikidata", "http://www.wikidata.org/entity/Q235650"),
  },
  {
    name: "wikidata-entity-Q29117946",
    run: (l) => l.resolve("wikidata", "http://www.wikidata.org/entity/Q29117946"),
  },
  {
    name: "wikidata-entity-Q98069877",
    run: (l) => l.resolve("wikidata", "http://www.wikidata.org/entity/Q98069877"),
  },
  {
    name: "gnd-search-agent-pires-maria-joao",
    run: (l) => l.search("gnd", "agent", "Pires, Maria João"),
  },
  { name: "gnd-search-work-clair-de-lune", run: (l) => l.search("gnd", "work", "Clair de lune") },
  { name: "gnd-record-124927521", run: (l) => l.resolve("gnd", "https://d-nb.info/gnd/124927521") },
  { name: "gnd-record-300042558", run: (l) => l.resolve("gnd", "https://d-nb.info/gnd/300042558") },
  {
    name: "gnd-record-1156628156",
    run: (l) => l.resolve("gnd", "https://d-nb.info/gnd/1156628156"),
  },
  {
    name: "youtube-oembed-Ch2mrPm1JnM",
    run: (l) => l.resolve("youtube", "https://www.youtube.com/watch?v=Ch2mrPm1JnM"),
  },
];

const ROUTE: readonly Call[] = [
  { name: "musicbrainz-search-agent-pires", run: (l) => l.search("musicbrainz", "agent", "Pires") },
  {
    name: "musicbrainz-reconcile-work-clair-de-lune",
    run: (l) => l.reconcile("musicbrainz", "work", ["Clair de lune"]),
  },
  {
    name: "musicbrainz-reconcile-agent-maria-joao-pires",
    run: (l) => l.reconcile("musicbrainz", "agent", ["Maria João Pires"]),
  },
  {
    name: "musicbrainz-extend-work-8d331505",
    run: (l) =>
      l.resolve("musicbrainz", "http://musicbrainz.org/work/8d331505-4d88-39ae-81c7-bec5da77af96"),
  },
];

/**
 * The route mode's answer to one request, from the server's test
 * application: argv is the server's test data, the method, the URL, the
 * form body and the token; the output `{"status", "body"}`.
 */
const ROUTE_ANSWER = `
import json, sys, tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from tilie_server.app import create_app
from tilie_server.musicbrainz import MusicBrainz
from tilie_server.settings import ServerSettings

data, method, url, body, token = sys.argv[1:6]
index = json.loads((Path(data) / "index.json").read_text(encoding="utf-8"))

def replay(asked, headers):
    if asked in index:
        return 200, (Path(data) / index[asked]).read_bytes()
    recorded = asked.replace("&limit=3&", "&limit=5&")
    if recorded == asked or recorded not in index:
        raise AssertionError(f"no recorded answer for {asked}")
    answer = json.loads((Path(data) / index[recorded]).read_bytes())
    for key, value in answer.items():
        if isinstance(value, list):
            answer[key] = value[:3]
    return 200, json.dumps(answer).encode("utf-8")

async def no_sleep(seconds):
    return None

with tempfile.TemporaryDirectory() as directory:
    settings = ServerSettings("127.0.0.1", 8000, token, Path(directory))
    app = create_app(settings, musicbrainz=MusicBrainz(replay, sleep=no_sleep))
    client = TestClient(app, base_url="http://127.0.0.1:8000")
    headers = {"Authorization": f"Bearer {token}"}
    if method == "POST":
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        response = client.post(url, headers=headers, content=body.encode("utf-8"))
    else:
        response = client.get(url, headers=headers)
    print(json.dumps({"status": response.status_code, "body": response.json()}))
`;

/** The key of a request in `index.json`. */
function keyOf(url: string, init: RequestInit | undefined): string {
  return init?.method === "POST" ? `POST ${url} ${String(init.body)}` : url;
}

/** Read the index, `{}` when there is none yet. */
function readIndex(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(INDEX, "utf8"));
  } catch {
    return {};
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Run `calls` through a lookup whose fetch is `answer`, writing every answer. */
async function record(
  calls: readonly Call[],
  answer: (
    url: string,
    init: RequestInit | undefined,
  ) => Promise<{ status: number; body: unknown }>,
  server: typeof RECORDED_SERVER | null,
): Promise<void> {
  const index = readIndex();
  for (const call of calls) {
    let count = 0;
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      const { status, body } = await answer(url, init);
      if (status !== 200) throw new Error(`${call.name}: ${url} answered ${status}`);
      const key = keyOf(url, init);
      if (!(key in index)) {
        count += key in NAMED ? 0 : 1;
        const file = NAMED[key] ?? `${call.name}${count === 1 ? "" : `-${count}`}.json`;
        writeFileSync(path.join(DIRECTORY, file), `${JSON.stringify(body, null, 2)}\n`);
        index[key] = file;
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    };
    await call.run(createLookup({ fetch: fetcher, server }));
    console.log(`recorded ${call.name}`);
  }
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(INDEX, `${JSON.stringify(sorted, null, 2)}\n`);
  const formatted = spawnSync(BIOME, ["format", "--write", DIRECTORY], { encoding: "utf8" });
  if (formatted.status !== 0) throw new Error(`biome could not format:\n${formatted.stderr}`);
}

let last = 0;

/** A live request, at least `INTERVAL` after the previous one. */
async function live(url: string): Promise<{ status: number; body: unknown }> {
  const wait = last + INTERVAL - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  return { status: response.status, body: await response.json() };
}

/** A request answered by the server's test application in `serverDirectory`. */
function routed(serverDirectory: string) {
  const data = path.resolve(serverDirectory, "tests", "data", "musicbrainz");
  return async (url: string, init: RequestInit | undefined) => {
    const target = new URL(url);
    const method = init?.method ?? "GET";
    const body = init?.body === undefined ? "" : String(init.body);
    const run = spawnSync(
      "uv",
      [
        "run",
        "--directory",
        serverDirectory,
        "python",
        "-c",
        ROUTE_ANSWER,
        data,
        method,
        target.pathname + target.search,
        body,
        RECORDED_SERVER.token,
      ],
      { encoding: "utf8" },
    );
    if (run.status !== 0) throw new Error(`the server's test application failed:\n${run.stderr}`);
    return JSON.parse(run.stdout) as { status: number; body: unknown };
  };
}

const [mode, serverDirectory] = process.argv.slice(2);
if (mode === "--route") {
  if (serverDirectory === undefined) throw new Error("--route needs the server's directory");
  await record(ROUTE, routed(path.resolve(serverDirectory)), RECORDED_SERVER);
} else {
  await record(LIVE, live, null);
}
