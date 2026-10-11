/**
 * Autosave of workspace text to IndexedDB: one object store, one slot per
 * workspace key. The text is stored and returned exactly as given (normally
 * what `writeWorkspace` returns); this module never parses or builds it.
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
  /** How long `schedule` waits for a later text before writing. */
  readonly delayMs: number;
}

export interface Autosave {
  /** Write `text` once no further text was scheduled for `delayMs`. */
  schedule(text: string): void;
  /**
   * Write the pending text now and wait for every write. Rejects with the
   * first failure since the previous flush, including writes the timer started.
   */
  flush(): Promise<void>;
}

export function createAutosave({ key, delayMs }: AutosaveOptions): Autosave {
  let pending: { readonly text: string } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Writes run one after another; the queue itself never rejects.
  let queue: Promise<void> = Promise.resolve();
  let failure: { readonly error: unknown } | undefined;

  function writePending(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending === undefined) {
      return;
    }
    const { text } = pending;
    pending = undefined;
    queue = queue
      .then(() => putText(key, text))
      .catch((error: unknown) => {
        failure ??= { error };
      });
  }

  return {
    schedule(text) {
      pending = { text };
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(writePending, delayMs);
    },
    async flush() {
      writePending();
      await queue;
      if (failure !== undefined) {
        const { error } = failure;
        failure = undefined;
        throw error;
      }
    },
  };
}

/** The text last written under `key`, or `null` when there is none. */
export async function recoverWorkspace(key: string): Promise<string | null> {
  const value = await inStore(key, "readonly", (store) => store.get(key));
  return typeof value === "string" ? value : null;
}

/** Remove the slot of `key`. */
export async function clear(key: string): Promise<void> {
  await inStore(key, "readwrite", (store) => store.delete(key));
}

async function putText(key: string, text: string): Promise<void> {
  await inStore(key, "readwrite", (store) => store.put(text, key));
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
