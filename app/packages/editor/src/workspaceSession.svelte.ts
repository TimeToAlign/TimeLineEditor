/**
 * The open workspace of one editor: its store, the file it belongs to,
 * whether it holds changes that file does not, and the viewer's selection
 * in it. Every way of replacing, saving, importing into or stepping through
 * the workspace goes through this object; the editor's components read its
 * state and call its methods, and the autosave and the host follow it
 * through `listen`.
 */

import type { LiveStore, Selection } from "@timetoalign/tilie-arranger";
import {
  addCommand,
  blockOf,
  editedSelection,
  existing,
  liveStore,
  NOTHING_SELECTED,
  selectionOf,
} from "@timetoalign/tilie-arranger";
import type { Address, LoadError, Problem, Store, View, Workspace } from "@timetoalign/tilie-core";
import {
  createStore,
  ErrorCode,
  emptyWorkspace,
  isLoadError,
  JournalMismatchError,
  loadManifest,
  mintBlockId,
  readWorkspace,
  saveManifest,
  writeWorkspace,
} from "@timetoalign/tilie-core";
import {
  MANIFEST_FILE,
  manifestFileName,
  openFile,
  saveFile,
  UNTITLED,
  WORKSPACE_FILE,
  workspaceFileName,
} from "./files.ts";
import { messageOf } from "./messages.ts";

/** A workspace file the reader refused, with its problems. */
export class WorkspaceRefusedError extends Error {
  readonly problems: readonly Problem[];

  constructor(problems: readonly Problem[]) {
    const lines = problems.map(
      ({ code, message, path }) => `${code} at /${path.join("/")}: ${message}`,
    );
    super(`the workspace file is refused:\n${lines.join("\n")}`);
    this.name = "WorkspaceRefusedError";
    this.problems = problems;
  }
}

/** The part of the canvas an imported block is placed in: what `addCommand` takes. */
type Visible = Parameters<typeof addCommand>[3];

/** What the canvas offers an import: where the view is, and the focus. */
export interface ImportTarget {
  visible(): Visible;
  focus(): void;
}

export interface SessionOptions {
  /** Show a dismissible message; editing goes on. */
  readonly say: (text: string, problems?: readonly Problem[]) => void;
  /** Called after the open workspace was replaced by another. */
  readonly replaced?: () => void;
  /** Called with the selected addresses whenever the selection changes. */
  readonly selected?: (selection: readonly Address[]) => void;
}

/** Whether two selections name the same addresses. */
function sameSelection(left: Selection, right: Selection): boolean {
  return left.size === right.size && [...left.keys()].every((key) => right.has(key));
}

export class WorkspaceSession {
  /** The open workspace. */
  store: Store = $state.raw(createStore(emptyWorkspace()));
  /** The open workspace as Svelte state, for the canvas and the inspector. */
  readonly live: LiveStore = $derived(liveStore(this.store));
  /** The view as last opened or saved; `null` for a workspace never saved (a restored one). */
  savedView: View | null = $state.raw(this.store.view);
  /** The file the workspace was opened from or last saved to. */
  fileName: string = $state(UNTITLED);
  /** Where Save writes back to, when the browser handed over a file handle. */
  handle: FileSystemFileHandle | null = null;
  /** Whether the workspace holds changes its file does not. */
  readonly dirty: boolean = $derived(this.live.view !== this.savedView);

  #selection: Selection = $state.raw(NOTHING_SELECTED);
  /** The open store's count of openings when the session last followed it: a larger count is an editor opened. */
  #openings = this.store.openings;
  #listeners = new Set<() => void>();
  #unsubscribe: () => void;
  #saving = false;
  readonly #options: SessionOptions;

  constructor(options: SessionOptions) {
    this.#options = options;
    this.#unsubscribe = this.store.subscribe(() => this.#changed());
  }

  /** The viewer's selection: addresses of blocks and of their elements; never written to the workspace. */
  get selection(): Selection {
    return this.#selection;
  }

  set selection(next: Selection) {
    if (sameSelection(next, this.#selection)) return;
    this.#selection = next;
    this.#options.selected?.([...next.values()]);
  }

  /**
   * Call `listener` after every change of the open store, after the store
   * is replaced, and after a save; returns the removal.
   */
  listen(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Stop following the open store; the session is not used afterwards. */
  dispose(): void {
    this.#unsubscribe();
    this.#listeners.clear();
  }

  /**
   * Make `workspace` the open one, in a new store; `saved` when it equals its
   * file. A workspace whose journal does not reproduce its view is refused
   * (`journal_mismatch`, at the first place it differs) and the open one kept.
   */
  replace(
    workspace: Workspace,
    name: string,
    handle: FileSystemFileHandle | null,
    saved: boolean,
  ): LoadError | null {
    let next: Store;
    try {
      next = createStore(workspace);
    } catch (error) {
      if (!(error instanceof JournalMismatchError)) throw error;
      return {
        problems: [{ code: ErrorCode.journalMismatch, message: error.message, path: error.path }],
      };
    }
    this.#unsubscribe();
    this.selection = NOTHING_SELECTED;
    this.store = next;
    this.#openings = next.openings;
    this.savedView = saved ? next.view : null;
    this.fileName = name;
    this.handle = handle;
    this.#unsubscribe = next.subscribe(() => this.#changed());
    this.#notify();
    this.#options.replaced?.();
    return null;
  }

  /** Open the workspace file `text` as saved; the reader's refusal, or `null` when it opened. */
  open(
    text: string,
    name = UNTITLED,
    handle: FileSystemFileHandle | null = null,
  ): LoadError | null {
    const workspace = readWorkspace(text);
    if (isLoadError(workspace)) return workspace;
    return this.replace(workspace, name, handle, true);
  }

  /** The open workspace as Save writes it. */
  text(): string {
    return writeWorkspace(this.store.snapshot());
  }

  /**
   * Save the open workspace: back into its file, or, with `as` or without a
   * file handle (a new or restored workspace), to a file picked now, offered
   * under the workspace's file name: its file's, or for a workspace that has
   * none yet the one its name gives. A save requested while one is under way
   * is ignored.
   */
  async save(as: boolean): Promise<void> {
    if (this.#saving) return;
    this.#saving = true;
    const current = this.store.view;
    const text = this.text();
    const offered =
      this.handle === null && this.fileName === UNTITLED
        ? workspaceFileName(current.name)
        : this.fileName;
    try {
      const saved = await saveFile(text, WORKSPACE_FILE, offered, as ? null : this.handle);
      if (saved === null) return;
      this.fileName = saved.name;
      this.handle = saved.handle;
      this.savedView = current;
      this.#notify();
    } catch (error) {
      this.#options.say(`The workspace could not be saved: ${messageOf(error)}`);
    } finally {
      this.#saving = false;
    }
  }

  /**
   * Import a manifest file the viewer picks as one new block whose top-left
   * lies at the centre of the canvas's view; the block is selected.
   */
  async importManifest(canvas: ImportTarget): Promise<void> {
    try {
      const opened = await openFile(MANIFEST_FILE);
      if (opened === null) return;
      const manifest = loadManifest(opened.text);
      if (isLoadError(manifest)) {
        this.#options.say(
          `${opened.name} is not a manifest TimeLineEditor can import.`,
          manifest.problems,
        );
        return;
      }
      const id = mintBlockId();
      const refusal = this.store.dispatch(
        addCommand(this.store.view, id, manifest, canvas.visible()),
      );
      if (refusal !== null) {
        this.#options.say(`${opened.name} could not be added.`, [refusal]);
        return;
      }
      this.selection = selectionOf([{ block: id }]);
      canvas.focus();
    } catch (error) {
      this.#options.say(`The file could not be imported: ${messageOf(error)}`);
    }
  }

  /** The block the whole selection lies in, if it lies in exactly one. */
  get exportable(): string | null {
    const blocks = new Set([...this.selection.values()].map(blockOf));
    const [only] = blocks;
    return blocks.size === 1 && only !== undefined && this.live.view.blocks[only] !== undefined
      ? only
      : null;
  }

  /** Export the manifest of the block the selection lies in: complete, or every default left out. */
  async exportManifest(minimal: boolean): Promise<void> {
    const id = this.exportable;
    const block = id === null ? undefined : this.store.view.blocks[id];
    if (block === undefined) return;
    try {
      const text = saveManifest(block.manifest, { minimal });
      await saveFile(text, MANIFEST_FILE, manifestFileName(block.manifest));
    } catch (error) {
      this.#options.say(`The manifest could not be exported: ${messageOf(error)}`);
    }
  }

  /** Undo or redo. */
  step(back: boolean): void {
    if (back) this.store.undo();
    else this.store.redo();
  }

  /**
   * The open store changed (a command, an undo or a redo, an editor opened
   * or closed): an editor that opened selects its edited element
   * (`editedSelection`), every other change keeps of the selection what the
   * view keeps under the innermost open editor (`existing`); then tell the
   * listeners.
   */
  #changed(): void {
    const { store } = this;
    const innermost = store.editing.at(-1) ?? null;
    const opened = store.openings !== this.#openings;
    this.#openings = store.openings;
    this.selection =
      opened && innermost !== null
        ? editedSelection(store.view, innermost)
        : existing(store.view, this.selection, innermost);
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}
