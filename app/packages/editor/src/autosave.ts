/**
 * What the editor keeps in IndexedDB: the autosave of workspace snapshots,
 * one object store, one slot per workspace key. A snapshot is the
 * workspace's text, stored and returned exactly as given (normally what
 * `writeWorkspace` returns; this module never parses or builds it), the
 * name of the file it belongs to and where that file lies: its path on the
 * server, or, where the browser can store it, the browser's handle of it,
 * so a restored workspace is saved back into it. A caller may pass a
 * function giving the snapshot instead, so the text is written out only
 * when it is due, not on every change.
 */

/** One object store of its own database, and how its failures name a key. */
interface Kept {
  readonly database: string;
  readonly version: number;
  readonly store: string;
  /** What a failure says failed for a key, before the key. */
  readonly subject: string;
}

const WORKSPACES: Kept = {
  database: "tilie-autosave",
  version: 1,
  store: "workspaces",
  subject: "autosave of workspace",
};

/** Why the autosave failed: IndexedDB is missing, or one of its requests failed. */
export type AutosaveErrorCode = "indexeddb_unavailable" | "indexeddb_failed";

/** IndexedDB is missing, or one of its requests failed; `cause` holds its error. */
export class AutosaveError extends Error {
  readonly code: AutosaveErrorCode;
  readonly key: string;

  constructor(code: AutosaveErrorCode, key: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "AutosaveError";
    this.code = code;
    this.key = key;
  }
}

/** What `createAutosave` is given: the slot, the delay and where unattended failures go. */
export interface AutosaveOptions {
  /** The workspace's slot. */
  readonly key: string;
  /** How long `schedule` waits for a later snapshot before writing. */
  readonly delayMs: number;
  /**
   * Told of a failure no caller waits for (a write the timer started, a
   * `discard`); without it, the failure is held and rejects the next `flush()`.
   */
  readonly onError?: (error: unknown) => void;
}

/**
 * What a slot holds: a workspace's text, the name of its file and, where
 * known, the file's path on the server or, where kept, its handle.
 */
export interface Snapshot {
  readonly text: string;
  readonly name: string;
  readonly path?: string;
  readonly handle?: FileSystemFileHandle;
}

/** A snapshot, or a function giving it when the write is due. */
export type Pending = Snapshot | (() => Snapshot);

/** The autosave of one slot: snapshots scheduled, written one after another. */
export interface Autosave {
  /** Write `snapshot` once no further snapshot was scheduled for `delayMs`. */
  schedule(snapshot: Pending): void;
  /** Drop the pending snapshot and empty the slot, after every write already started. */
  discard(): void;
  /**
   * Write the pending snapshot now and wait for every write. Rejects with
   * the first failure since the previous flush that no caller waited for.
   */
  flush(): Promise<void>;
}

/** An autosave of the slot `key`, writing a scheduled snapshot after `delayMs` without a later one. */
export function createAutosave({ key, delayMs, onError }: AutosaveOptions): Autosave {
  let pending: { readonly snapshot: Pending } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Writes run one after another; the queue itself never rejects.
  let queue: Promise<void> = Promise.resolve();
  let failure: { readonly error: unknown } | undefined;

  function stopTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  /** Run `work` after every queued request; `unattended` when no caller waits for it. */
  function enqueue(work: () => Promise<void>, unattended: boolean): void {
    queue = queue.then(work).catch((error: unknown) => {
      if (unattended && onError !== undefined) onError(error);
      else failure ??= { error };
    });
  }

  function writePending(byTimer: boolean): void {
    stopTimer();
    if (pending === undefined) {
      return;
    }
    const { snapshot } = pending;
    pending = undefined;
    enqueue(
      () => putSnapshot(key, typeof snapshot === "function" ? snapshot() : snapshot),
      byTimer,
    );
  }

  return {
    schedule(snapshot) {
      pending = { snapshot };
      stopTimer();
      timer = setTimeout(() => writePending(true), delayMs);
    },
    discard() {
      stopTimer();
      pending = undefined;
      enqueue(() => clear(key), true);
    },
    async flush() {
      writePending(false);
      await queue;
      if (failure !== undefined) {
        const { error } = failure;
        failure = undefined;
        throw error;
      }
    },
  };
}

/** Whether `value` is a handle of `kind`, as a browser stores and gives one back. */
function isHandle(value: unknown, kind: FileSystemHandleKind): boolean {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === kind;
}

/** The snapshot last written under `key`, or `null` when the slot holds none. */
export async function recoverWorkspace(key: string): Promise<Snapshot | null> {
  const value: unknown = await inStore(WORKSPACES, key, "readonly", (store) => store.get(key));
  if (typeof value !== "object" || value === null) return null;
  const { text, name, path, handle } = value as Record<string, unknown>;
  if (typeof text !== "string" || typeof name !== "string") return null;
  return {
    text,
    name,
    ...(typeof path === "string" ? { path } : {}),
    ...(isHandle(handle, "file") ? { handle: handle as FileSystemFileHandle } : {}),
  };
}

/** Remove the slot of `key`. */
export async function clear(key: string): Promise<void> {
  await inStore(WORKSPACES, key, "readwrite", (store) => store.delete(key));
}

/** Whether `error` is IndexedDB refusing to store a value (a handle a browser cannot keep). */
function notStorable(error: unknown): boolean {
  const { cause } = error instanceof AutosaveError ? error : { cause: undefined };
  return cause instanceof Error && cause.name === "DataCloneError";
}

/** Write `snapshot` under `key`; a handle the browser cannot store is left out. */
async function putSnapshot(key: string, { handle, ...kept }: Snapshot): Promise<void> {
  const put = (value: object) =>
    inStore(WORKSPACES, key, "readwrite", (store) => store.put(value, key));
  if (handle === undefined) {
    await put(kept);
    return;
  }
  try {
    await put({ ...kept, handle });
  } catch (error) {
    if (!notStorable(error)) throw error;
    await put(kept);
  }
}

/** Run one request in its own transaction of `kept` and resolve once the transaction completes. */
async function inStore<T>(
  kept: Kept,
  key: string,
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const factory: IDBFactory | undefined = globalThis.indexedDB;
  if (factory === undefined) {
    throw new AutosaveError(
      "indexeddb_unavailable",
      key,
      `${kept.subject} "${key}" failed: IndexedDB is not available`,
    );
  }
  let database: IDBDatabase | undefined;
  try {
    database = await open(factory, kept);
    const opened = database;
    return await new Promise<T>((resolve, reject) => {
      const transaction = opened.transaction(kept.store, mode);
      const pendingRequest = request(transaction.objectStore(kept.store));
      transaction.oncomplete = () => resolve(pendingRequest.result);
      transaction.onerror = () => reject(pendingRequest.error ?? transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch (cause) {
    throw new AutosaveError(
      "indexeddb_failed",
      key,
      `${kept.subject} "${key}" failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    );
  } finally {
    database?.close();
  }
}

function open(factory: IDBFactory, kept: Kept): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(kept.database, kept.version);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(kept.store);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
