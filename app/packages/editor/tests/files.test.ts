/// <reference types="node" />
import { isLoadError, loadManifest } from "@timetoalign/tilie-core";
import { dumps, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  lastChanged,
  MANIFEST_FILE,
  manifestFileName,
  openFile,
  saveFile,
  WORKSPACE_FILE,
} from "../src/files.ts";
import { interceptDownloads, pickFile } from "./support.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("manifestFileName", () => {
  it("is the manifest's id, else its name, else manifest, outside [A-Za-z0-9_-] replaced", () => {
    const named = (members: object) => {
      const manifest = loadManifest(
        dumps({
          timeskeleton: SCHEMA_VERSION,
          timelines: [{ id: "piece", unit: "quarters", length: [8, 1] }],
          ...members,
        }),
      );
      if (isLoadError(manifest)) throw new Error("the manifest is refused");
      return manifestFileName(manifest);
    };
    expect(named({ id: "flow:quarters", name: "Flow" })).toBe("flow_quarters.json");
    expect(named({ name: "Eroica: II" })).toBe("Eroica__II.json");
    expect(named({})).toBe("manifest.json");
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
