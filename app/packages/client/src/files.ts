/**
 * The user's files as `tilie-server` serves them below its root folder:
 * `GET folders`, `GET files` and `PUT files`
 * (`decisions/0033-server-file-access.md`). A path is POSIX and relative to
 * the root, `""` the root itself; the server refuses one leading outside
 * the root or into a hidden place, reads only workspace, manifest and table
 * files, and writes only workspace files.
 *
 * The calls run on `connect`'s transport (its headers, its request, which
 * rejects with a `ServerError` carrying the server's refusal, and its
 * error for an answer not of a route's form), so `connect` gives its
 * `Server` these three calls beside the others.
 */

/** One entry of a folder: a folder, or a file of a kind the editor opens. */
export interface FolderEntry {
  readonly name: string;
  readonly kind: "folder" | "file";
}

/** A folder's entries, folders first, then files, each group sorted by code point. */
export interface FolderListing {
  readonly path: string;
  readonly entries: readonly FolderEntry[];
}

/** A file written: its path and its size in bytes. */
export interface WrittenFile {
  readonly path: string;
  readonly size: number;
}

/** The file calls of a `Server`. */
export interface FileServer {
  /**
   * The folder `path` lists: its folders, then its workspace, manifest and
   * table files, hidden names and links leading out of the root left out.
   * Rejects with a `ServerError` whose `refusal` is the server's (`no such
   * folder`, `path outside the root`, `hidden files are not served`,
   * `permission denied`).
   */
  listFolder(path: string): Promise<FolderListing>;
  /**
   * The bytes of the workspace, manifest or table file `path`. Rejects as
   * `listFolder` does, for `no such file`, and for a file of another kind.
   */
  readFile(path: string): Promise<Blob>;
  /**
   * Write `content` into the workspace file `path`, replacing it whole: a
   * string as its UTF-8 bytes, a `Blob` unchanged. Rejects as `listFolder`
   * does, and for a file that is no workspace file.
   */
  writeFile(path: string, content: Blob | string): Promise<WrittenFile>;
}

/** What the file calls take of `connect`. */
export interface Transport {
  /** The headers every request carries (the bearer token). */
  readonly headers: Readonly<Record<string, string>>;
  /** The 2xx answer to the request of `route` below the server's base URL; rejects otherwise. */
  request(route: string, init: RequestInit, explained: boolean): Promise<Response>;
  /** The error for a 2xx answer of `status` that is not of its route's form. */
  malformed(status: number, message: string, cause?: unknown): Error;
}

/** The message of a folder answer that is not of the route's form. */
const MALFORMED_LISTING = "the folder answer is not a listing of the folder asked for";

/** The message of a file answer whose bytes could not be read. */
const UNREAD_FILE = "the file answer could not be read";

/** The message of a write answer that is not of the route's form. */
const MALFORMED_WRITTEN = "the write answer is not the file written";

/** The route of `route` for the file or folder `path`. */
function pathRoute(route: "folders" | "files", path: string): string {
  return `${route}?${new URLSearchParams({ path })}`;
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function member(value: object, key: string): unknown {
  return key in value ? Reflect.get(value, key) : undefined;
}

function entryOf(value: unknown): FolderEntry | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 2) return undefined;
  const name = member(value, "name");
  const kind = member(value, "kind");
  if (typeof name !== "string" || (kind !== "folder" && kind !== "file")) return undefined;
  return { name, kind };
}

/** The listing of `asked` a 2xx body of `GET folders` holds, or `undefined`. */
function listingOf(body: unknown, asked: string): FolderListing | undefined {
  if (!isRecord(body) || member(body, "path") !== asked) return undefined;
  const given = member(body, "entries");
  if (!Array.isArray(given)) return undefined;
  const entries = given.map(entryOf);
  if (entries.some((entry) => entry === undefined)) return undefined;
  return { path: asked, entries: entries.filter((entry) => entry !== undefined) };
}

/** The file written at `asked` a 2xx body of `PUT files` states, or `undefined`. */
function writtenOf(body: unknown, asked: string): WrittenFile | undefined {
  if (!isRecord(body) || member(body, "path") !== asked) return undefined;
  const size = member(body, "size");
  return Number.isSafeInteger(size) && typeof size === "number" && size >= 0
    ? { path: asked, size }
    : undefined;
}

/** The three file calls over `connect`'s transport. */
export function fileCalls({ headers, request, malformed }: Transport): FileServer {
  async function json<T>(
    response: Response,
    read: (body: unknown) => T | undefined,
    message: string,
  ): Promise<T> {
    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw malformed(response.status, message, cause);
    }
    const value = read(body);
    if (value === undefined) throw malformed(response.status, message);
    return value;
  }

  return {
    async listFolder(path) {
      const response = await request(pathRoute("folders", path), { headers }, true);
      return json(response, (body) => listingOf(body, path), MALFORMED_LISTING);
    },
    async readFile(path) {
      const response = await request(pathRoute("files", path), { headers }, true);
      try {
        return await response.blob();
      } catch (cause) {
        throw malformed(response.status, UNREAD_FILE, cause);
      }
    },
    async writeFile(path, content) {
      const response = await request(
        pathRoute("files", path),
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/octet-stream" },
          body: content,
        },
        true,
      );
      return json(response, (body) => writtenOf(body, path), MALFORMED_WRITTEN);
    },
  };
}
