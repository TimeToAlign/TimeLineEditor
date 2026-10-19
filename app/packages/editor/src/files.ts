/**
 * Opening and saving files: through the File System Access API where the
 * browser has it (a save writes back to the file it opened or last saved),
 * otherwise through a file input and a download. A cancelled picker is
 * `null`, never an error.
 */

import type { Entry, Manifest } from "@timetoalign/tilie-core";
import { UNTITLED_WORKSPACE } from "@timetoalign/tilie-core";

/** What a picker offers: a description and the one extension it filters on. */
export interface FileKind {
  readonly description: string;
  readonly extension: string;
}

export const WORKSPACE_FILE: FileKind = {
  description: "TimeLineEditor workspace",
  extension: ".tle.json",
};
export const MANIFEST_FILE: FileKind = { description: "TimeSkeleton manifest", extension: ".json" };

/** The printable characters some system refuses in a file name: `/` everywhere, the rest on Windows. */
const NOT_IN_FILE_NAMES = new Set(["/", "\\", ":", "*", "?", '"', "<", ">", "|"]);

/** Whether a file name on Windows, macOS or Linux cannot hold `character`: those, and every control character. */
function refusedInFileNames(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code < 0x20 || code === 0x7f || NOT_IN_FILE_NAMES.has(character);
}

/**
 * The default file name of a workspace named `name`: `<name>.tle.json`,
 * every character a file name cannot hold replaced by `_`.
 */
export function workspaceFileName(name: string): string {
  const stem = Array.from(name, (character) => (refusedInFileNames(character) ? "_" : character));
  return `${stem.join("")}${WORKSPACE_FILE.extension}`;
}

/** The name a new workspace is saved under: its default name's file, `untitled.tle.json`. */
export const UNTITLED = workspaceFileName(UNTITLED_WORKSPACE);

/** A file the browser handed over, with the handle to write back to when it gave one. */
export interface Opened {
  readonly name: string;
  readonly text: string;
  readonly handle: FileSystemFileHandle | null;
}

/** Where a text was saved. */
export interface Saved {
  readonly name: string;
  readonly handle: FileSystemFileHandle | null;
}

interface PickerOptions {
  readonly types: { description: string; accept: Record<string, string[]> }[];
  readonly suggestedName?: string;
}

/** The File System Access pickers, where the browser has them. */
interface Pickers {
  showOpenFilePicker?: (options: PickerOptions) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: PickerOptions) => Promise<FileSystemFileHandle>;
}

const pickers = (): Pickers => globalThis as Pickers;

function types(kind: FileKind): PickerOptions["types"] {
  return [{ description: kind.description, accept: { "application/json": [kind.extension] } }];
}

function cancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Let the viewer pick one file of `kind` and read it as text; `null` when they cancel. */
export async function openFile(kind: FileKind): Promise<Opened | null> {
  const { showOpenFilePicker } = pickers();
  if (showOpenFilePicker !== undefined) {
    try {
      const [handle] = await showOpenFilePicker({ types: types(kind) });
      if (handle === undefined) return null;
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (error) {
      if (cancelled(error)) return null;
      throw error;
    }
  }
  const file = await chooseFile(kind);
  return file === null ? null : { name: file.name, text: await file.text(), handle: null };
}

/** The fallback picker: a file input, clicked once, resolved on its `change` or `cancel`. */
function chooseFile(kind: FileKind): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind.extension;
    input.hidden = true;
    const settle = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => settle(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => settle(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

/**
 * Save `text`: into `handle` when given, else to a file the viewer picks,
 * offered as `name`. Without the pickers the text is downloaded as `name`.
 * `null` when the viewer cancels.
 */
export async function saveFile(
  text: string,
  kind: FileKind,
  name: string,
  handle: FileSystemFileHandle | null = null,
): Promise<Saved | null> {
  const { showSaveFilePicker } = pickers();
  if (handle === null && showSaveFilePicker === undefined) {
    download(text, name);
    return { name, handle: null };
  }
  try {
    const target =
      handle ??
      (await (showSaveFilePicker as NonNullable<Pickers["showSaveFilePicker"]>)({
        types: types(kind),
        suggestedName: name,
      }));
    const writable = await target.createWritable();
    await writable.write(text);
    await writable.close();
    return { name: target.name, handle: target };
  } catch (error) {
    if (cancelled(error)) return null;
    throw error;
  }
}

function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started from the click; the URL is no longer needed after this turn.
  setTimeout(() => URL.revokeObjectURL(url));
}

/**
 * The file name of a manifest that has neither an `id` nor a `name`, before
 * `.json`: every manifest is an alignment bundle, and this one an anonymous
 * bundle.
 */
export const ANONYMOUS_BUNDLE = "bundle";

/**
 * The file name a manifest is exported under: its `id`, else its `name`,
 * else `bundle`, each character outside `A–Z a–z 0–9 _ -` written `_`,
 * then `.json`.
 */
export function manifestFileName(manifest: Manifest): string {
  const stem = manifest.id ?? manifest.name ?? ANONYMOUS_BUNDLE;
  return `${stem.replace(/[^A-Za-z0-9_-]/g, "_")}.json`;
}

/**
 * When a journal was last changed, as local `YYYY-MM-DD HH:MM`; `null` for
 * an empty journal.
 */
export function lastChanged(journal: readonly Entry[]): string | null {
  const last = journal.at(-1);
  if (last === undefined) return null;
  const time = new Date(last.time);
  const two = (value: number) => String(value).padStart(2, "0");
  return `${time.getFullYear()}-${two(time.getMonth() + 1)}-${two(time.getDate())} ${two(time.getHours())}:${two(time.getMinutes())}`;
}
