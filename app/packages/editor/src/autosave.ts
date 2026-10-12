/**
 * Autosave of workspace snapshots to IndexedDB: one object store, one slot
 * per workspace key. A snapshot is the workspace's text, stored and returned
 * exactly as given (normally what `writeWorkspace` returns; this module never
 * parses or builds it), and the name of the file it belongs to. A caller may
 * pass a function giving the snapshot instead, so the text is written out
 * only when it is due, not on every change.
 */
const DATABASE = "tilie-autosave";
const VERSION = 1;
const STORE = "workspaces";

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

/** What a slot holds: a workspace's text and the name of its file. */
export interface Snapshot {
  readonly text: string;
  readonly name: string;
}

/** A snapshot, or a function giving it when the write is due. */
export type Pending = Snapshot | (() => Snapshot);

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

/** The snapshot last written under `key`, or `null` when the slot holds none. */
export async function recoverWorkspace(key: string): Promise<Snapshot | null> {
  const value: unknown = await inStore(key, "readonly", (store) => store.get(key));
  if (typeof value !== "object" || value === null) return null;
  const { text, name } = value as Record<string, unknown>;
  return typeof text === "string" && typeof name === "string" ? { text, name } : null;
}

/** Remove the slot of `key`. */
export async function clear(key: string): Promise<void> {
  await inStore(key, "readwrite", (store) => store.delete(key));
}

async function putSnapshot(key: string, { text, name }: Snapshot): Promise<void> {
  await inStore(key, "readwrite", (store) => store.put({ text, name }, key));
}

/** Run one request in its own transaction and resolve once the transaction completes. */
async function inStore<T>(
  key: string,
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const factory: IDBFactory | undefined = globalThis.indexedDB;
  if (factory === undefined) {
    throw new AutosaveError(
      "indexeddb_unavailable",
      key,
      `autosave of workspace "${key}" failed: IndexedDB is not available`,
    );
  }
  let database: IDBDatabase | undefined;
  try {
    database = await open(factory);
    const opened = database;
    return await new Promise<T>((resolve, reject) => {
      const transaction = opened.transaction(STORE, mode);
      const pendingRequest = request(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(pendingRequest.result);
      transaction.onerror = () => reject(pendingRequest.error ?? transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch (cause) {
    throw new AutosaveError(
      "indexeddb_failed",
      key,
      `autosave of workspace "${key}" failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    );
  } finally {
    database?.close();
  }
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
