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
  blocksInOrder,
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
  importedManifest,
  isLoadError,
  JournalMismatchError,
  manifestFileOf,
  mintBlockId,
  readManifestFile,
  readWorkspace,
  saveManifest,
  writeWorkspace,
} from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timetoshare";
import type { Example } from "./examples.ts";
import type { Opened } from "./files.ts";
import {
  chooseFolder,
  isMatchClaimTable,
  isWorkspaceFile,
  MANIFEST_FILE,
  manifestFileKind,
  manifestFileName,
  manifestFiles,
  openFiles,
  saveFile,
  UNTITLED,
  WORKSPACE_FILE,
  withMatchClaimTable,
  workspaceFileName,
} from "./files.ts";
import {
  type AskTables,
  type FolderMemory,
  fileNameOf,
  MATCHES_NEED_A_SERVER,
  type MatchClaimServer,
  MatchClaimTables,
  manifestTitle,
  namedTable,
  saveFailure,
  type TableMessages,
  unsavedQuestion,
} from "./matchClaims.svelte.ts";
import { messageOf } from "./messages.svelte.ts";

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
  /** Show a warning, kept until dismissed; editing goes on. */
  readonly warn: (text: string, problems?: readonly Problem[]) => void;
  /** Show information that goes away by itself; without it, none is shown. */
  readonly inform?: (text: string) => void;
  /** Called after the open workspace was replaced by another. */
  readonly replaced?: () => void;
  /** Called with the selected addresses whenever the selection changes. */
  readonly selected?: (selection: readonly Address[]) => void;
  /** The user's name, every store's author from its creation. */
  readonly author: () => string;
  /** The server MatchClaim tables are read through; without it (the default) none is read. */
  readonly matchClaims?: MatchClaimServer | null;
  /** Ask the user for the files of tables a manifest names that cannot be reached; without it none is asked. */
  readonly askTables?: AskTables | null;
  /** Where the folders of blocks' manifests are kept beyond the session; without it, for the session only. */
  readonly folders?: FolderMemory | null;
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
  /** The MatchClaim tables of the open workspace's blocks, held for the session, never written to its file. */
  readonly tables: MatchClaimTables;

  #selection: Selection = $state.raw(NOTHING_SELECTED);
  /** The open store's count of openings when the session last followed it: a larger count is an editor opened. */
  #openings = this.store.openings;
  /** The open store's blocks when the session last followed it: a block missing since has left. */
  #blocks = this.store.view.blocks;
  #listeners = new Set<() => void>();
  #unsubscribe: () => void;
  #saving = false;
  #loadingTables = false;
  readonly #options: SessionOptions;

  constructor(options: SessionOptions) {
    this.#options = options;
    this.tables = new MatchClaimTables(
      options.matchClaims ?? null,
      options.askTables ?? null,
      options.folders ?? null,
    );
    this.store.setAuthor(options.author());
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
   * Every block of the open workspace that `workspace` does not hold leaves:
   * its manifest's folder is forgotten (`MatchClaimTables.left`).
   */
  replace(
    workspace: Workspace,
    name: string,
    handle: FileSystemFileHandle | null,
    saved: boolean,
  ): LoadError | null {
    let next: Store;
    try {
      next = createStore(workspace, { author: this.#options.author() });
    } catch (error) {
      if (!(error instanceof JournalMismatchError)) throw error;
      return {
        problems: [{ code: ErrorCode.journalMismatch, message: error.message, path: error.path }],
      };
    }
    this.#unsubscribe();
    this.selection = NOTHING_SELECTED;
    this.#left(next.view.blocks);
    this.tables.clear();
    this.store = next;
    this.#openings = next.openings;
    this.#blocks = next.view.blocks;
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
      this.#options.warn(`The workspace could not be saved: ${messageOf(error)}`);
    } finally {
      this.#saving = false;
    }
  }

  /**
   * The question to ask before the workspace and its MatchClaim tables are
   * replaced, naming what holds unsaved changes (`unsavedQuestion`): the
   * workspace, every table a belief changed; `null` when nothing does.
   */
  unsaved(): string | null {
    const tables = this.tables.changed.map(({ loaded }) => loaded.name);
    if (!this.dirty && tables.length === 0) return null;
    return unsavedQuestion(this.dirty ? this.fileName : null, tables);
  }

  /**
   * Save what `unsaved` names: the workspace first (`save`), then each
   * changed MatchClaim table, stopping at the first the viewer does not save
   * (a table that fails to write is reported); whether nothing unsaved is
   * left, so the workspace may be replaced.
   */
  async saveUnsaved(): Promise<boolean> {
    if (this.dirty) await this.save(false);
    if (this.dirty) return false;
    for (const { block } of this.tables.changed) {
      try {
        if ((await this.tables.save(block)) === null) return false;
      } catch (error) {
        this.#options.warn(saveFailure(error));
        return false;
      }
    }
    return true;
  }

  /**
   * Import the manifest files the viewer picks, each as one new block, with
   * the MatchClaim tables picked beside them (`importPicked`).
   */
  async importManifest(canvas: ImportTarget, metrics: FontMetrics): Promise<void> {
    try {
      await this.importPicked(
        await openFiles(withMatchClaimTable(MANIFEST_FILE), true),
        canvas,
        metrics,
      );
    } catch (error) {
      this.#options.warn(`The file could not be imported: ${messageOf(error)}`);
    }
  }

  /**
   * Import the manifest files among `picked`, each as one new block
   * (`#add`), with the MatchClaim tables among them (`readTables`); the new
   * blocks.
   */
  async importPicked(
    picked: readonly Opened[],
    canvas: ImportTarget,
    metrics: FontMetrics,
  ): Promise<string[]> {
    const blocks: string[] = [];
    for (const opened of picked) {
      if (isMatchClaimTable(opened.name)) continue;
      const block = this.#add(opened.name, await opened.file.text(), canvas, metrics);
      if (block !== null) blocks.push(block);
    }
    await this.readTables(picked, blocks);
    return blocks;
  }

  /**
   * Import the manifests of a folder the viewer chooses (where the browser
   * hands over folders), each manifest file directly in it as one new
   * block (`#add`), the folder kept as each block's, so the tables its
   * manifest names are read from there (`MatchClaimTables.inFolder`). A
   * file there that is no manifest is left, and said so; a folder holding
   * none says so.
   */
  async importFolder(canvas: ImportTarget, metrics: FontMetrics): Promise<void> {
    try {
      const folder = await chooseFolder();
      if (folder === null) return;
      const manifests: { readonly name: string; readonly text: string }[] = [];
      const left: string[] = [];
      for (const opened of await manifestFiles(folder)) {
        const text = await opened.file.text();
        if (isLoadError(readManifestFile(text))) left.push(opened.name);
        else manifests.push({ name: opened.name, text });
      }
      if (manifests.length === 0) {
        this.#options.warn(
          `The folder ${folder.name} holds no manifest TimeLineEditor can import.`,
        );
        return;
      }
      if (left.length > 0) {
        this.#options.inform?.(`Left ${left.join(", ")} in ${folder.name}: no manifest.`);
      }
      const blocks: string[] = [];
      for (const { name, text } of manifests) {
        const block = this.#add(name, text, canvas, metrics);
        if (block === null) continue;
        this.tables.inFolder(block, folder);
        blocks.push(block);
      }
      await this.readTables([], blocks);
    } catch (error) {
      this.#options.warn(`The folder could not be imported: ${messageOf(error)}`);
    }
  }

  /**
   * Read the tables among `picked` as tables of `blocks`: every one is a
   * MatchClaim table, read through the server as the table of the block
   * whose manifest names a MatchClaim table of its file name, else of the
   * only block; a table no block takes is reported. Then every block of
   * `blocks` whose manifest names a MatchClaim table that is still not
   * loaded says so in the message bar, and how to load it.
   */
  async readTables(picked: readonly Opened[], blocks: readonly string[]): Promise<void> {
    const manifestOf = (block: string) => this.store.view.blocks[block]?.manifest;
    const naming = (name: string) =>
      blocks.filter((block) => {
        const manifest = manifestOf(block);
        const url = manifest === undefined ? null : namedTable(manifest);
        return url !== null && fileNameOf(url) === name;
      });
    for (const opened of picked) {
      if (!isMatchClaimTable(opened.name)) continue;
      const named = naming(opened.name);
      const [block] = named.length > 0 ? named : blocks.length === 1 ? blocks : [];
      const manifest = block === undefined ? undefined : manifestOf(block);
      if (block === undefined || manifest === undefined) {
        this.#options.warn(`${opened.name} was not loaded: no manifest picked with it names it.`);
        continue;
      }
      const failure = await this.tables.load(block, manifest, opened.file, opened.name);
      if (failure !== null) this.#options.warn(failure);
    }
    for (const block of blocks) {
      const manifest = manifestOf(block);
      if (manifest === undefined || this.tables.of(block) !== null) continue;
      const url = namedTable(manifest);
      if (url === null) continue;
      const named = manifestTitle(manifest);
      this.#options.warn(
        this.tables.connected
          ? `${named} names the MatchClaim table ${url}, which is not loaded: Show matches (M) loads it.`
          : `${named} names the MatchClaim table ${url}, which is not loaded. ${MATCHES_NEED_A_SERVER}`,
      );
    }
  }

  /**
   * Load the MatchClaim table every block's manifest names where it is not
   * loaded (what turning Show matches on asks), block after block in
   * the canvas's one order of blocks (the arranger's `blocksInOrder`): from where
   * the manifest came from, else as the user chooses it
   * (`MatchClaimTables.loadNamed`); what each load says goes to the
   * message bar. A call while one is under way is ignored.
   */
  async loadNamedTables(): Promise<void> {
    if (this.#loadingTables) return;
    this.#loadingTables = true;
    try {
      for (const { id } of blocksInOrder(this.store.view)) {
        const manifest = this.store.view.blocks[id]?.manifest;
        if (manifest === undefined) continue;
        this.post(await this.tables.loadNamed(id, manifest));
      }
    } finally {
      this.#loadingTables = false;
    }
  }

  /** Post what a load of tables says: its information, then its warnings. */
  post(messages: TableMessages): void {
    for (const text of messages.informed) this.#options.inform?.(text);
    for (const text of messages.warned) this.#options.warn(text);
  }

  /**
   * Open the workspace file among `picked` (`isWorkspaceFile`) as saved
   * (`open`), the MatchClaim tables picked beside it read as its blocks'
   * (`readTables`); the reader's refusal, or `null` when it opened. Every
   * other file is reported and left.
   */
  async openPicked(picked: readonly Opened[]): Promise<LoadError | null> {
    const [workspace, ...others] = picked.filter((opened) => isWorkspaceFile(opened.name));
    if (workspace === undefined) {
      this.#options.warn(
        "No workspace file was picked: a MatchClaim table opens with its workspace.",
      );
      return null;
    }
    for (const other of others)
      this.#options.warn(`${other.name} was not opened: one workspace opens at a time.`);
    for (const other of picked) {
      if (isWorkspaceFile(other.name) || isMatchClaimTable(other.name)) continue;
      this.#options.warn(`${other.name} was not opened: a manifest is opened without a workspace.`);
    }
    const refusal = this.open(await workspace.file.text(), workspace.name, workspace.handle);
    if (refusal !== null) return refusal;
    await this.readTables(picked, Object.keys(this.store.view.blocks));
    return null;
  }

  /**
   * Add the manifest of the manifest example `example` as one new block
   * (`#add`); the files it names are read from where the example lies, when
   * it says where (`Example.source`).
   */
  async importExample(example: Example, canvas: ImportTarget, metrics: FontMetrics): Promise<void> {
    try {
      const block = this.#add(example.label, await example.text(), canvas, metrics);
      if (block === null) return;
      if (example.source !== undefined) this.tables.locate(block, example.source);
      await this.readTables([], [block]);
    } catch (error) {
      this.#options.warn(`The example could not be added: ${messageOf(error)}`);
    }
  }

  /**
   * Add the manifest `text`, in any of TimeToShare's serializations and
   * called `name` in messages, as one new block, its top-left at the centre
   * of the view, moved right past every block it would overlap (`metrics`
   * measure the drawings); the block is selected. How the text writes the
   * manifest (its form, its styling, its serialization) becomes the block's
   * manifest file in the settings, so Export writes it back as it came. A
   * manifest without a `graphical` object is given its roots' default
   * timestamps (`importedManifest`). An editor changes only what it edits,
   * so every open editor is left first (Done), once the manifest is read;
   * the view the block is placed in is the one shown before, since leaving
   * moves the view back over a while.
   */
  #add(name: string, text: string, canvas: ImportTarget, metrics: FontMetrics): string | null {
    const read = readManifestFile(text);
    if (isLoadError(read)) {
      this.#options.warn(`${name} is not a manifest TimeLineEditor can import.`, read.problems);
      return null;
    }
    const visible = canvas.visible();
    while (this.store.editing.length > 0) this.store.done();
    const id = mintBlockId();
    const manifest = importedManifest(read.manifest);
    const refusal = this.store.dispatch(
      addCommand(this.store.view, id, manifest, visible, metrics),
    );
    if (refusal !== null) {
      this.#options.warn(`${name} could not be added.`, [refusal]);
      return null;
    }
    const configured = this.store.configure({ manifests: { [id]: read.file } });
    if (configured !== null) throw new Error(`a manifest file is refused: ${configured.message}`);
    this.selection = selectionOf([{ block: id }]);
    canvas.focus();
    return id;
  }

  /** The block the whole selection lies in, if it lies in exactly one. */
  get exportable(): string | null {
    const blocks = new Set([...this.selection.values()].map(blockOf));
    const [only] = blocks;
    return blocks.size === 1 && only !== undefined && this.live.view.blocks[only] !== undefined
      ? only
      : null;
  }

  /**
   * Export the manifest of the block the selection lies in as the block's
   * manifest file says (`manifestFileOf`): in its form, with or without its
   * styling, in its serialization, under the file name of that
   * serialization.
   */
  async exportManifest(): Promise<void> {
    const id = this.exportable;
    const block = id === null ? undefined : this.store.view.blocks[id];
    if (id === null || block === undefined) return;
    const file = manifestFileOf(this.store.view.settings, id);
    try {
      const text = saveManifest(block.manifest, file);
      await saveFile(
        text,
        manifestFileKind(file.serialization),
        manifestFileName(block.manifest, file.serialization),
      );
    } catch (error) {
      this.#options.warn(`The manifest could not be exported: ${messageOf(error)}`);
    }
  }

  /** Undo or redo. */
  step(back: boolean): void {
    if (back) this.store.undo();
    else this.store.redo();
  }

  /**
   * The open store changed (a command, an undo or a redo, an editor opened
   * or closed): a block that left the workspace has its manifest's folder
   * forgotten (`MatchClaimTables.left`); an editor that opened selects its
   * edited element (`editedSelection`), every other change keeps of the
   * selection what the view keeps under the innermost open editor
   * (`existing`); then tell the listeners.
   */
  #changed(): void {
    const { store } = this;
    this.#left(store.view.blocks);
    this.#blocks = store.view.blocks;
    const innermost = store.editing.at(-1) ?? null;
    const opened = store.openings !== this.#openings;
    this.#openings = store.openings;
    this.selection =
      opened && innermost !== null
        ? editedSelection(store.view, innermost)
        : existing(store.view, this.selection, innermost);
    this.#notify();
  }

  /** Every block of the view last seen that `blocks` does not hold left the workspace. */
  #left(blocks: View["blocks"]): void {
    if (blocks === this.#blocks) return;
    for (const block of Object.keys(this.#blocks)) {
      if (!Object.hasOwn(blocks, block)) this.tables.left(block);
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}
