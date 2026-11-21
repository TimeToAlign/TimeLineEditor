/**
 * Opening and saving files: through the File System Access API where the
 * browser has it (a save writes back to the file it opened or last saved,
 * once the browser lets it write there), otherwise through a file input and
 * a download. A cancelled picker is `null`, never an error. With a
 * server, files are named by their path from the server's root folder
 * (POSIX, `""` the root) and read and written through it; the paths' own
 * arithmetic and the reading of the files a manifest names are here too.
 */

import { ServerError } from "@timetoalign/tilie-client";
import type { Entry, Manifest } from "@timetoalign/tilie-core";
import { isRelativeLocation, UNTITLED_WORKSPACE } from "@timetoalign/tilie-core";
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

/** Whether a save without a server downloads the file: the browser has no save picker. */
export function savesByDownload(): boolean {
  return pickers().showSaveFilePicker === undefined;
}

// --- Paths on the server -------------------------------------------------------------

/**
 * The segments of `path`, a location relative to `folder` (itself a path
 * from the server's root, `""` the root): `.` and empty segments dropped,
 * `..` leading up; `null` where it leads above the root or is no relative
 * location (core's `isRelativeLocation`: it starts with `/`, names a scheme
 * or holds a backslash).
 */
function segmentsOf(folder: string, path: string): string[] | null {
  if (!isRelativeLocation(path)) return null;
  const segments: string[] = [];
  for (const part of [...folder.split("/"), ...path.split("/")]) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segments.pop() === undefined) return null;
      continue;
    }
    segments.push(part);
  }
  return segments;
}

/**
 * The path from the server's root of `path`, relative to the folder
 * `folder` (a path from the root, `""` the root); `null` where it leads
 * above the root or is no relative location (`isRelativeLocation`).
 */
export function resolvedPath(folder: string, path: string): string | null {
  return segmentsOf(folder, path)?.join("/") ?? null;
}

/** The folder of the file `path` (a path from the root): `""` for a file in the root. */
export function folderOf(path: string): string {
  const at = path.lastIndexOf("/");
  return at < 0 ? "" : path.slice(0, at);
}

/** The last segment of `path`: the file's name. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * The path of the file `path` relative to the folder `folder`, both from
 * the root: `..` for every folder left, then the rest of `path`
 * (`relativePath("work", "story/a.yaml")` is `../story/a.yaml`).
 */
export function relativePath(folder: string, path: string): string {
  const from = folder === "" ? [] : folder.split("/");
  const to = path.split("/");
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared += 1;
  return [...from.slice(shared).map(() => ".."), ...to.slice(shared)].join("/");
}

/** What a server needs to read a file by its path from the root. */
export interface FileReader {
  readFile(path: string): Promise<Blob>;
}

/** HTTP 404: the server holds no such file. */
const NOT_FOUND = 404;

/**
 * The files a manifest in the server's folder `folder` names: `read(url)`
 * reads the location `url` relative to that folder through `server`
 * (`readFile`); `null` where the server holds no file there (it answers
 * 404) or the location leads out of the root or is a URL. Rejects when the
 * server fails otherwise.
 */
export function serverSource(
  server: FileReader,
  folder: string,
): { read(url: string): Promise<Blob | null> } {
  return {
    async read(url) {
      const [location = ""] = url.split(/[?#]/u, 1);
      const path = resolvedPath(folder, location);
      if (path === null || path === "") return null;
      try {
        return await server.readFile(path);
      } catch (error) {
        if (error instanceof ServerError && error.status === NOT_FOUND) return null;
        throw error;
      }
    },
  };
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
