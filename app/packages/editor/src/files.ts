/**
 * Opening and saving files: through the File System Access API where the
 * browser has it (a save writes back to the file it opened or last saved,
 * once the browser lets it write there), otherwise through a file input and
 * a download. A cancelled picker is `null`, never an error. Where the
 * browser hands over folders, the files a manifest names are read from
 * the folder chosen as the manifest's.
 */

import type { Entry, Manifest } from "@timetoalign/tilie-core";
import { UNTITLED_WORKSPACE } from "@timetoalign/tilie-core";
import type { Serialization } from "@timetoalign/timetoshare";

/** What a picker offers: a description and the extensions it filters on, by media type. */
export interface FileKind {
  readonly description: string;
  readonly accept: { readonly [mediaType: string]: readonly string[] };
}

const WORKSPACE_EXTENSION = ".tle.json";

export const WORKSPACE_FILE: FileKind = {
  description: "TimeLineEditor workspace",
  accept: { "application/json": [WORKSPACE_EXTENSION] },
};

const YAML_EXTENSION = ".yaml";
const JSON_EXTENSION = ".json";

const YAML_MANIFEST: FileKind = {
  description: "TimeToShare manifest",
  accept: { "application/yaml": [YAML_EXTENSION] },
};
const JSON_MANIFEST: FileKind = {
  description: "TimeToShare manifest",
  accept: { "application/json": [JSON_EXTENSION] },
};

/** A manifest file to import: canonical YAML (`.yaml`, `.yml`) or JSON (`.json`), read by its content. */
export const MANIFEST_FILE: FileKind = {
  description: "TimeToShare manifest",
  accept: { "application/yaml": [".yaml", ".yml"], "application/json": [".json"] },
};

/**
 * A MatchClaim table, the Parquet file a package holds its MatchClaims in
 * (`match_claims.parquet`), read through the server.
 */
export const MATCH_CLAIM_TABLE: FileKind = {
  description: "MatchClaim table",
  accept: { "application/vnd.apache.parquet": [".parquet"] },
};

/** `kind` with the MatchClaim table offered beside it, for pickers that take both at once. */
export function withMatchClaimTable(kind: FileKind): FileKind {
  return {
    description: `${kind.description} and MatchClaim table`,
    accept: { ...kind.accept, ...MATCH_CLAIM_TABLE.accept },
  };
}

/**
 * What Open… offers: a workspace, manifest files (imported, as Import
 * manifest… imports them) and the MatchClaim tables beside either.
 */
export const OPENABLE_FILE: FileKind = {
  description: "TimeLineEditor workspace, TimeToShare manifest and MatchClaim table",
  accept: {
    "application/json": [WORKSPACE_EXTENSION, JSON_EXTENSION],
    "application/yaml": [YAML_EXTENSION, ".yml"],
    ...MATCH_CLAIM_TABLE.accept,
  },
};

/** Whether the file named `name` is a workspace file to Open…: its extension is `.tle.json`. */
export function isWorkspaceFile(name: string): boolean {
  return name.toLowerCase().endsWith(WORKSPACE_EXTENSION);
}

/** Whether the file named `name` is a MatchClaim table to the pickers: its extension is `.parquet`. */
export function isMatchClaimTable(name: string): boolean {
  return name.toLowerCase().endsWith(".parquet");
}

/** The file a manifest is exported to in `serialization`: `.yaml` for YAML, `.json` for both JSON forms. */
export function manifestFileKind(serialization: Serialization): FileKind {
  return serialization === "yaml" ? YAML_MANIFEST : JSON_MANIFEST;
}

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
  return `${stem.join("")}${WORKSPACE_EXTENSION}`;
}

/** The name a new workspace is saved under: its default name's file, `untitled.tle.json`. */
export const UNTITLED = workspaceFileName(UNTITLED_WORKSPACE);

/** A file the browser handed over, with the handle to write back to when it gave one. */
export interface Opened {
  readonly name: string;
  readonly file: File;
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
  readonly multiple?: boolean;
}

/** The File System Access pickers, where the browser has them. */
interface Pickers {
  showOpenFilePicker?: (options: PickerOptions) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: PickerOptions) => Promise<FileSystemFileHandle>;
}

const pickers = (): Pickers => globalThis as Pickers;

function types(kind: FileKind): PickerOptions["types"] {
  const accept = Object.fromEntries(
    Object.entries(kind.accept).map(([type, extensions]) => [type, [...extensions]]),
  );
  return [{ description: kind.description, accept }];
}

/** The first media type of `kind`, the type of a download. */
function mediaType(kind: FileKind): string {
  const [first] = Object.keys(kind.accept);
  if (first === undefined) throw new Error(`${kind.description} names no media type`);
  return first;
}

function cancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Let the viewer pick files of `kind`, one or, with `multiple`, several at
 * once; none when they cancel.
 */
export async function openFiles(kind: FileKind, multiple = false): Promise<Opened[]> {
  const { showOpenFilePicker } = pickers();
  if (showOpenFilePicker !== undefined) {
    try {
      const options = multiple ? { types: types(kind), multiple } : { types: types(kind) };
      const handles = await showOpenFilePicker(options);
      return await Promise.all(
        handles.map(async (handle) => {
          const file = await handle.getFile();
          return { name: file.name, file, handle };
        }),
      );
    } catch (error) {
      if (cancelled(error)) return [];
      throw error;
    }
  }
  const files = await chooseFiles(kind, multiple);
  return files.map((file) => ({ name: file.name, file, handle: null }));
}

/** A file the browser handed over, read as text. */
export interface OpenedText {
  readonly name: string;
  readonly text: string;
  readonly handle: FileSystemFileHandle | null;
}

/** Let the viewer pick one file of `kind` and read it as text; `null` when they cancel. */
export async function openFile(kind: FileKind): Promise<OpenedText | null> {
  const [opened] = await openFiles(kind);
  if (opened === undefined) return null;
  return { name: opened.name, text: await opened.file.text(), handle: opened.handle };
}

/** The fallback picker: a file input, clicked once, resolved on its `change` or `cancel`. */
function chooseFiles(kind: FileKind, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = Object.values(kind.accept).flat().join(",");
    input.multiple = multiple;
    input.hidden = true;
    const settle = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => settle([...(input.files ?? [])]), { once: true });
    input.addEventListener("cancel", () => settle([]), { once: true });
    document.body.append(input);
    input.click();
  });
}

/** How a handle is used: read, or read and written. */
type Access = "read" | "readwrite";

/** The permission calls of a handle, where the browser has them. */
interface Permissions {
  queryPermission?: (descriptor: { mode: Access }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: Access }) => Promise<PermissionState>;
}

/**
 * Whether the browser lets the page use `handle` for `access`, asking the
 * user where it must (a handle kept from an earlier visit; the browser asks
 * only while the user's last key or click is recent). A browser without
 * the permission calls lets every handle it gave be used; one that cannot
 * ask now refuses.
 */
export async function permitted(handle: FileSystemHandle, access: Access): Promise<boolean> {
  const { queryPermission, requestPermission } = handle as FileSystemHandle & Permissions;
  if (queryPermission === undefined) return true;
  try {
    if ((await queryPermission.call(handle, { mode: access })) === "granted") return true;
    if (requestPermission === undefined) return false;
    return (await requestPermission.call(handle, { mode: access })) === "granted";
  } catch {
    return false;
  }
}

/** The failures of writing into a kept handle after which the user picks the file instead. */
const NOT_WRITABLE = new Set(["NotAllowedError", "SecurityError", "NotFoundError"]);

/** Write `text` into `handle`. */
async function write(handle: FileSystemFileHandle, text: string | Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

/**
 * Save `text` (a text, or the bytes of a `Blob`): into `handle` when given
 * and the browser lets the page write there (`permitted`), else to a file
 * the viewer picks, offered as `name` (Save as). Without the pickers it is
 * downloaded as `name`. `null` when the viewer cancels.
 */
export async function saveFile(
  text: string | Blob,
  kind: FileKind,
  name: string,
  handle: FileSystemFileHandle | null = null,
): Promise<Saved | null> {
  if (handle !== null && (await permitted(handle, "readwrite"))) {
    try {
      await write(handle, text);
      return { name: handle.name, handle };
    } catch (error) {
      if (!(error instanceof DOMException && NOT_WRITABLE.has(error.name))) throw error;
    }
  }
  const { showSaveFilePicker } = pickers();
  if (showSaveFilePicker === undefined) {
    download(text, name, mediaType(kind));
    return { name, handle: null };
  }
  try {
    const target = await showSaveFilePicker({ types: types(kind), suggestedName: name });
    await write(target, text);
    return { name: target.name, handle: target };
  } catch (error) {
    if (cancelled(error)) return null;
    throw error;
  }
}

function download(text: string | Blob, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
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

/** The File System Access directory picker, where the browser has one. */
interface DirectoryPicker {
  showDirectoryPicker?: (options: { mode: Access }) => Promise<FileSystemDirectoryHandle>;
}

/** The entries of a directory, which the DOM types of this TypeScript version do not list. */
interface Listed {
  values(): AsyncIterable<FileSystemHandle>;
}

/** Whether the browser hands over folders (`chooseFolder`); without, no folder is ever asked for. */
export function canChooseFolders(): boolean {
  return (globalThis as DirectoryPicker).showDirectoryPicker !== undefined;
}

/** Let the viewer choose a folder to read from; `null` when they cancel or the browser cannot. */
export async function chooseFolder(): Promise<FileSystemDirectoryHandle | null> {
  const { showDirectoryPicker } = globalThis as DirectoryPicker;
  if (showDirectoryPicker === undefined) return null;
  try {
    return await showDirectoryPicker({ mode: "read" });
  } catch (error) {
    if (cancelled(error)) return null;
    throw error;
  }
}

/**
 * The path within a folder that the location `url` names, relative to a
 * file in that folder (as a manifest's `resources` state locations): its
 * segments, decoded, `.` and `..` applied; `null` for a location no folder
 * holds (with a scheme, from the root, above the folder, or none at all).
 */
export function folderPath(url: string): string[] | null {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(url) || url.startsWith("/")) return null;
  const [path = ""] = url.split(/[?#]/u, 1);
  const segments: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segments.pop() === undefined) return null;
      continue;
    }
    try {
      segments.push(decodeURIComponent(part));
    } catch {
      return null;
    }
  }
  return segments.length === 0 ? null : segments;
}

/** Whether `error` says a file or folder is not there (or is the other kind). */
function absent(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "TypeMismatchError")
  );
}

/**
 * The file at the location `url` (`folderPath`) in `folder`; `null` where
 * the folder holds none there, the location is none a folder holds, or the
 * browser does not let the page read the folder (`permitted`). Rejects when
 * reading failed otherwise.
 */
export async function readInFolder(
  folder: FileSystemDirectoryHandle,
  url: string,
): Promise<File | null> {
  const path = folderPath(url);
  if (path === null || !(await permitted(folder, "read"))) return null;
  const directories = path.slice(0, -1);
  const name = path[path.length - 1] ?? "";
  try {
    let directory = folder;
    for (const segment of directories) directory = await directory.getDirectoryHandle(segment);
    return await (await directory.getFileHandle(name)).getFile();
  } catch (error) {
    if (absent(error)) return null;
    throw error;
  }
}

/**
 * The manifest files directly in `folder`, by name: every `.yaml`, `.yml`
 * and `.json` file but workspace files.
 */
export async function manifestFiles(folder: FileSystemDirectoryHandle): Promise<Opened[]> {
  const extensions = Object.values(MANIFEST_FILE.accept).flat();
  const found: Opened[] = [];
  for await (const entry of (folder as FileSystemDirectoryHandle & Listed).values()) {
    if (entry.kind !== "file" || isWorkspaceFile(entry.name)) continue;
    const lower = entry.name.toLowerCase();
    if (!extensions.some((extension) => lower.endsWith(extension))) continue;
    const handle = entry as FileSystemFileHandle;
    found.push({ name: entry.name, file: await handle.getFile(), handle });
  }
  return found.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
}

/**
 * The file name of a manifest that has neither an `id` nor a `name`, before
 * its extension: every manifest is an alignment bundle, and this one an
 * anonymous bundle.
 */
export const ANONYMOUS_BUNDLE = "bundle";

/**
 * The file name a manifest is exported under in `serialization`: its `id`,
 * else its `name`, else `bundle`, each character outside `A–Z a–z 0–9 _ -`
 * written `_`, then the extension of the serialization's file: `.yaml`
 * for YAML, `.json` for both JSON forms.
 */
export function manifestFileName(manifest: Manifest, serialization: Serialization): string {
  const stem = manifest.id ?? manifest.name ?? ANONYMOUS_BUNDLE;
  const extension = serialization === "yaml" ? YAML_EXTENSION : JSON_EXTENSION;
  return `${stem.replace(/[^A-Za-z0-9_-]/g, "_")}${extension}`;
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
