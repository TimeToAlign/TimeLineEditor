/// <reference types="node" />
/**
 * Fixtures and file stubs for the editor's tests: manifests from the
 * installed `@timetoalign/timeskeleton`, the fallback file input answered
 * with a chosen file, and downloads recorded instead of performed.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Manifest } from "@timetoalign/tilie-core";
import { isLoadError, loadManifest } from "@timetoalign/tilie-core";
import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { vi } from "vitest";

const directory = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json")),
  "fixtures",
  SCHEMA_VERSION,
);

/** The text of a manifest fixture of the installed schema version. */
export function fixtureText(name: string): string {
  return readFileSync(path.join(directory, `${name}.json`), "utf8");
}

/** A manifest fixture, failing loudly if it is refused. */
export function fixture(name: string): Manifest {
  const manifest = loadManifest(fixtureText(name));
  if (isLoadError(manifest)) throw new Error(`${name} refused`);
  return manifest;
}

/** Answer the pending fallback file input with the file `name` holding `text`; returns the input. */
export function pickFile(name: string, text: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  if (input === null) throw new Error("no file input is waiting");
  Object.defineProperty(input, "files", { value: [new File([text], name)] });
  input.dispatchEvent(new Event("change"));
  return input;
}

/**
 * Record downloads instead of performing them: each clicked download link
 * adds `[file name, text]`, once its blob is read. jsdom has no object URLs,
 * so each call installs its own (the link stub is undone by
 * `vi.restoreAllMocks()`).
 */
export function interceptDownloads(): [string, string][] {
  const blobs = new Map<string, Blob>();
  const downloads: [string, string][] = [];
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:test/${blobs.size}`;
    blobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const blob = blobs.get(this.getAttribute("href") ?? "");
    if (blob === undefined) return;
    const name = this.download;
    void blob.text().then((text) => downloads.push([name, text]));
  });
  return downloads;
}
