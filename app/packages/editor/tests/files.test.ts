/// <reference types="node" />
import { isLoadError, loadManifest } from "@timetoalign/tilie-core";
import { dumps, SCHEMA_VERSION } from "@timetoalign/timetoshare";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import { fixtureText, interceptDownloads, pickFile } from "./support.ts";

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
  it("is the manifest's id, else its name, else manifest, outside [A-Za-z0-9_-] replaced", () => {
    const named = (members: object) => {
      const manifest = loadManifest(
        dumps({
          timetoshare: SCHEMA_VERSION,
          timelines: [{ id: "piece", unit: "quarters", length: [8, 1] }],
          ...members,
        }),
      );
      if (isLoadError(manifest)) throw new Error("the manifest is refused");
      return manifestFileName(manifest);
    };
    expect(named({ id: "flow:quarters", name: "Flow" })).toBe("flow_quarters.json");
    expect(named({ name: "Eroica: II" })).toBe("Eroica__II.json");
    expect(named({})).toBe("bundle.json");
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
  /** A glob's result holding `names` below `fixtures/<directory>/`, each file's text its path. */
  const found = (directory: string, names: readonly string[]) =>
    Object.fromEntries(
      names.map((name) => {
        const file = `../node_modules/@timetoalign/timetoshare/fixtures/${directory}/${name}.json`;
        return [file, async () => file];
      }),
    );

  it("are four fixtures of the schema version, in order, under their labels", async () => {
    expect(EXAMPLES.map(({ label, file }) => [label, file])).toEqual([
      ["Score, performance and facsimile", `${version}/bundles/bundle_mixed.json`],
      ["Sonata in two takes", `${version}/bundles/bundle_shared_parent.json`],
      ["Styled edition", `${version}/groups/group_styled.json`],
      ["Repeats and jumps", `${version}/flow_control.json`],
    ]);
    const texts = await Promise.all(EXAMPLES.map(({ text }) => text()));
    expect(texts).toEqual(chosen.map((name) => fixtureText(name)));
  });

  it("read the files of the schema version and refuse a missing one", async () => {
    const files = { ...found("0.0.1", chosen), ...found(SCHEMA_VERSION, chosen) };
    const texts = await Promise.all(examples(files).map(({ text }) => text()));
    expect(texts).toEqual(
      chosen.map(
        (name) =>
          `../node_modules/@timetoalign/timetoshare/fixtures/${SCHEMA_VERSION}/${name}.json`,
      ),
    );
    expect(() => examples(found(SCHEMA_VERSION, chosen.slice(0, 3)))).toThrow(
      `the example ${version}/flow_control.json is missing`,
    );
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
    expect(second?.accept).toBe(".json");
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
