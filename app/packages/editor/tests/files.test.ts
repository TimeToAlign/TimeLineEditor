/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";
import type { TimelineManifest } from "@timetoalign/tilie-core";
import { isLoadError, loadManifest, readWorkspace } from "@timetoalign/tilie-core";
import { SCHEMA_VERSION } from "@timetoalign/timetoshare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exampleFiles } from "../../../e2e/fixtures/generate.ts";
import { EXAMPLES, examples } from "../src/examples.ts";
import {
  lastChanged,
  MANIFEST_FILE,
  manifestFileName,
  openFile,
  saveFile,
  UNTITLED,
  WORKSPACE_FILE,
  workspaceFileName,
} from "../src/files.ts";
import { fileText, fixtureText, interceptDownloads, pickFile } from "./support.ts";

/** The committed text of the example "Timestamps". */
function exampleText(): string {
  return readFileSync(path.join(import.meta.dirname, "../examples/timestamps.tle.json"), "utf8");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("workspaceFileName", () => {
  it("is the name and .tle.json, every character no file name holds replaced", () => {
    expect(UNTITLED).toBe("untitled.tle.json");
    expect(
      ["untitled", "Eroica sketches", 'a/b\\c:d*e?f"g<h>i|j\t'].map(workspaceFileName),
    ).toEqual(["untitled.tle.json", "Eroica sketches.tle.json", "a_b_c_d_e_f_g_h_i_j_.tle.json"]);
  });
});

describe("manifestFileName", () => {
  it("is the manifest's id, else its name, else bundle, outside [A-Za-z0-9_-] replaced, then the serialization's extension", () => {
    const named = (members: object) => {
      const manifest = loadManifest(
        fileText({
          timetoshare: SCHEMA_VERSION,
          timelines: [{ id: "piece", unit: "quarters", length: [8, 1] }],
          ...members,
        }),
      );
      if (isLoadError(manifest)) throw new Error("the manifest is refused");
      return (["yaml", "json", "jcs"] as const).map((serialization) =>
        manifestFileName(manifest, serialization),
      );
    };
    expect(named({ id: "flow:quarters", name: "Flow" })).toEqual([
      "flow_quarters.yaml",
      "flow_quarters.json",
      "flow_quarters.json",
    ]);
    expect(named({ name: "Eroica: II" })[0]).toBe("Eroica__II.yaml");
    expect(named({})).toEqual(["bundle.yaml", "bundle.json", "bundle.json"]);
  });
});

describe("lastChanged", () => {
  it("is the last entry's local time to the minute, or null", () => {
    vi.stubEnv("TZ", "UTC");
    expect(lastChanged([])).toBe(null);
    const entry = { command: { type: "remove", targets: [] }, author: "A", time: "" } as const;
    expect(
      lastChanged([
        { ...entry, time: "2026-10-11T23:59:00.000Z" },
        { ...entry, time: "2026-10-12T09:05:07.000Z" },
      ]),
    ).toBe("2026-10-12 09:05");
  });
});

describe("the examples", () => {
  const version = `fixtures/${SCHEMA_VERSION}`;
  const chosen = [
    "bundles/bundle_mixed",
    "bundles/bundle_shared_parent",
    "groups/group_styled",
    "flow_control",
  ];
  const fixtureFile = (directory: string, name: string) =>
    `../node_modules/@timetoalign/timetoshare/fixtures/${directory}/${name}.yaml`;
  /** A glob's result holding `names` below `fixtures/<directory>/`, each file's text its path. */
  const found = (directory: string, names: readonly string[]) =>
    Object.fromEntries(
      names.map((name) => {
        const file = fixtureFile(directory, name);
        return [file, async () => file];
      }),
    );
  const WORKSPACE = "../examples/timestamps.tle.json";
  const workspaces = { [WORKSPACE]: async () => WORKSPACE };

  it("are four manifest fixtures of the schema version, then the workspace Timestamps", async () => {
    expect(EXAMPLES.map(({ label, kind }) => [label, kind])).toEqual([
      ["Score, performance and facsimile", "manifest"],
      ["Sonata in two takes", "manifest"],
      ["Styled edition", "manifest"],
      ["Repeats and jumps", "manifest"],
      ["Timestamps", "workspace"],
    ]);
    const texts = await Promise.all(EXAMPLES.map(({ text }) => text()));
    expect(texts).toEqual([...chosen.map((name) => fixtureText(name)), exampleText()]);
  });

  it("read the files of the schema version and refuse a missing one", async () => {
    const files = { ...found("0.0.1", chosen), ...found(SCHEMA_VERSION, chosen) };
    const texts = await Promise.all(examples(files, workspaces).map(({ text }) => text()));
    expect(texts).toEqual([...chosen.map((name) => fixtureFile(SCHEMA_VERSION, name)), WORKSPACE]);
    expect(() => examples(found(SCHEMA_VERSION, chosen.slice(0, 3)), workspaces)).toThrow(
      `the example ${version}/flow_control.yaml is missing`,
    );
    expect(() => examples(files, {})).toThrow(
      "the example examples/timestamps.tle.json is missing",
    );
  });

  it("hold Timestamps as the generator writes it", () => {
    expect(exampleText()).toBe(exampleFiles().get("timestamps.tle.json"));
    const workspace = readWorkspace(exampleText());
    if (isLoadError(workspace)) throw new Error(JSON.stringify(workspace.problems));
    const { view, journal } = workspace;
    const manifest = view.blocks.timestamps?.manifest;
    if (manifest === undefined) throw new Error("no block timestamps");
    const timelines = (items: readonly TimelineManifest[]): unknown[] =>
      items.map((item) => [
        item.id,
        item.unit,
        item.number_type,
        item.is_segment_line,
        item.conversion_maps.map((map) => [map.id, map.target_unit]),
        timelines(item.children),
      ]);
    expect([
      view.name,
      Object.keys(view.blocks),
      [...new Set(journal.map((entry) => entry.author))],
      timelines(manifest.timelines),
      (manifest.graphical?.timestamps ?? [])
        .map((item) => [item.id, item.timeline, item.name, item.display])
        .sort(([left], [right]) =>
          String(left).localeCompare(String(right), "en", { numeric: true }),
        ),
    ]).toEqual([
      "Timestamps",
      ["timestamps"],
      ["TimeLineEditor"],
      [
        [
          "performance",
          "seconds",
          "float",
          true,
          [["samples", "samples"]],
          [
            ["take_1", "seconds", "float", false, [], []],
            ["take_2", "seconds", "float", false, [], []],
          ],
        ],
        [
          "score",
          "quarters",
          "fraction",
          false,
          [
            ["bars", "whole_notes"],
            ["tempo", "seconds"],
            ["ticks", "ticks"],
          ],
          [
            ["phrase", "quarters", "fraction", false, [["phrase_ticks", "ticks"]], []],
            ["coda", "quarters", "fraction", false, [], []],
          ],
        ],
      ],
      [
        ["timestamp_1", "score", "origin", ["wedge", "coordinate"]],
        ["timestamp_2", "score", "length", ["wedge", "coordinate"]],
        ["timestamp_3", "performance", "origin", ["wedge", "coordinate"]],
        ["timestamp_4", "performance", "length", ["wedge", "coordinate"]],
        ["timestamp_5", "score", "Theme", ["wedge", "name", "cross_section"]],
        ["timestamp_6", "score", "Climax", ["wedge", "name", "id", "coordinate", "cross_section"]],
        ["timestamp_7", "score", "Silent", []],
        ["timestamp_8", "phrase", "Cadence", ["wedge", "id"]],
        ["timestamp_9", "performance", "Entry", ["wedge", "coordinate", "cross_section"]],
      ],
    ]);
  });
});

describe("the fallback picker and download", () => {
  it("opens the chosen file's exact text, and null when cancelled", async () => {
    const text = 'C♯ 𝄞\r\n{"a": 1}  ';
    const opening = openFile(WORKSPACE_FILE);
    const input = pickFile("w.tle.json", text);
    expect(input.accept).toBe(".tle.json");
    expect(await opening).toEqual({ name: "w.tle.json", text, handle: null });
    expect(document.querySelectorAll("input").length).toBe(0);

    const cancelled = openFile(MANIFEST_FILE);
    const second = document.querySelector<HTMLInputElement>("input[type=file]");
    expect(second?.accept).toBe(".yaml,.yml,.json");
    second?.dispatchEvent(new Event("cancel"));
    expect(await cancelled).toBe(null);
    expect(document.querySelectorAll("input").length).toBe(0);
  });

  it("downloads exactly the text under the given name", async () => {
    const downloads = interceptDownloads();
    expect(await saveFile("one\ntwo", WORKSPACE_FILE, "w.tle.json")).toEqual({
      name: "w.tle.json",
      handle: null,
    });
    await vi.waitFor(() => expect(downloads).toEqual([["w.tle.json", "one\ntwo"]]));
  });
});

describe("File System Access", () => {
  /** A file handle whose writes are recorded. */
  function handle(name: string, text = "") {
    const written: string[] = [];
    const value = {
      name,
      getFile: async () => new File([text], name),
      createWritable: async () => ({
        write: async (data: string) => {
          written.push(data);
        },
        close: async () => {},
      }),
    } as unknown as FileSystemFileHandle;
    return { value, written };
  }

  it("opens a picked handle, saves back into it, and picks a new one without", async () => {
    const opened = handle("w.tle.json", "workspace");
    const picked = handle("other.tle.json");
    const showOpenFilePicker = vi.fn(async () => [opened.value]);
    const showSaveFilePicker = vi.fn(async () => picked.value);
    vi.stubGlobal("showOpenFilePicker", showOpenFilePicker);
    vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);

    expect(await openFile(WORKSPACE_FILE)).toEqual({
      name: "w.tle.json",
      text: "workspace",
      handle: opened.value,
    });
    expect(await saveFile("v2", WORKSPACE_FILE, "w.tle.json", opened.value)).toEqual({
      name: "w.tle.json",
      handle: opened.value,
    });
    expect(opened.written).toEqual(["v2"]);
    expect(showSaveFilePicker.mock.calls.length).toBe(0);

    expect(await saveFile("v3", WORKSPACE_FILE, "w.tle.json")).toEqual({
      name: "other.tle.json",
      handle: picked.value,
    });
    expect(showSaveFilePicker.mock.calls).toEqual([
      [
        {
          types: [
            {
              description: "TimeLineEditor workspace",
              accept: { "application/json": [".tle.json"] },
            },
          ],
          suggestedName: "w.tle.json",
        },
      ],
    ]);
    expect(picked.written).toEqual(["v3"]);
  });

  it("offers manifest files in YAML and in JSON", async () => {
    const opened = handle("piece.yml", "timelines: []");
    const showOpenFilePicker = vi.fn(async () => [opened.value]);
    vi.stubGlobal("showOpenFilePicker", showOpenFilePicker);
    expect(await openFile(MANIFEST_FILE)).toEqual({
      name: "piece.yml",
      text: "timelines: []",
      handle: opened.value,
    });
    expect(showOpenFilePicker.mock.calls).toEqual([
      [
        {
          types: [
            {
              description: "TimeToShare manifest",
              accept: { "application/yaml": [".yaml", ".yml"], "application/json": [".json"] },
            },
          ],
        },
      ],
    ]);
  });

  it("gives null for a cancelled picker and throws any other failure", async () => {
    vi.stubGlobal(
      "showOpenFilePicker",
      vi.fn(async () => {
        throw new DOMException("cancelled", "AbortError");
      }),
    );
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(async () => {
        throw new DOMException("denied", "NotAllowedError");
      }),
    );
    expect(await openFile(WORKSPACE_FILE)).toBe(null);
    await expect(saveFile("x", WORKSPACE_FILE, "w.tle.json")).rejects.toMatchObject({
      name: "NotAllowedError",
    });
  });
});
