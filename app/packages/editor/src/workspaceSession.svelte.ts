/**
 * The open workspace of one editor: its store, the file it belongs to,
 * whether it holds changes that file does not, and the viewer's selection
 * in it. Every way of replacing, saving, importing into or stepping through
 * the workspace goes through this object; the editor's components read its
 * state and call its methods, and the autosave and the host follow it
 * through `listen`.
 *
 * Where the editor reaches the user's files through the server
 * (`FileHost`), a file is named by its path from the server's root, opened
 * and saved through the editor's file dialog, and the workspace keeps
 * where each block's manifest file lies (`ManifestFile.location`, relative
 * to the workspace file's folder), so the MatchClaim table a manifest
 * names is read from beside it. Otherwise the browser's pickers and
 * downloads serve (`files.ts`).
 */

import type { LiveStore, Pane, Selection } from "@timetoalign/tilie-arranger";
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
import type { FileServer } from "@timetoalign/tilie-client";
import type {
  Address,
  LoadError,
  ManifestFile,
  Problem,
  Store,
  View,
  Workspace,
} from "@timetoalign/tilie-core";
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
  WORKSPACE,
  writeWorkspace,
} from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timetoshare";
import type { Example } from "./examples.ts";
import type { FileKind, Opened } from "./files.ts";
import {
  baseName,
  folderOf,
  isMatchClaimTable,
  isWorkspaceFile,
  MANIFEST_FILE,
  manifestFileKind,
  manifestFileName,
  openFiles,
  relativePath,
  resolvedPath,
  saveFile,
  savesByDownload,
  UNTITLED,
  WORKSPACE_FILE,
  withMatchClaimTable,
  workspaceFileName,
} from "./files.ts";
import { nameCommand } from "./inspector/properties.ts";
import {
  type AskTables,
  fileNameOf,
  type ManifestPlaces,
  type MatchClaimServer,
  MatchClaimTables,
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

/**
 * The user's files through the server, as the session uses them: read and
 * written by path from the server's root, and the editor's file dialog
 * choosing paths (`null` when the user cancels).
 */
export interface FileHost {
  readonly server: Pick<FileServer, "readFile" | "writeFile">;
  /** Let the user choose a file of one of `kinds`, starting in the folder `start`. */
  open(kinds: readonly FileKind[], start: string): Promise<string | null>;
  /** Let the user choose where to save a file of `kind`, starting in `start`, offered as `suggested`. */
  save(kind: FileKind, start: string, suggested: string): Promise<string | null>;
}

/** What Open… offers through the file dialog: workspaces and manifests. */
const OPENED_KINDS: readonly FileKind[] = [WORKSPACE_FILE, MANIFEST_FILE];

/** Said once, after the first save that downloaded the workspace. */
const SAVED_AS_DOWNLOAD =
  "Saved as a download: this browser cannot write files; start TiLiE with tilie-server to save in place.";

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
  /**
   * The user's files through the server as far as the editor reaches them
   * now (`null`: it does not, and the browser's pickers serve); without it,
   * never.
   */
  readonly files?: () => FileHost | null;
  /** The canvas's pane, which a new block is placed by as the canvas draws it; without it, layout's default view. */
  readonly pane?: Pane;
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
  /** Where Save writes back to through the server: the workspace file's path from its root. */
  path: string | null = null;
  /** Whether the workspace holds changes its file does not. */
  readonly dirty: boolean = $derived(this.live.view !== this.savedView);
  /** The MatchClaim tables of the open workspace's blocks, held for the session, never written to its file. */
  readonly tables: MatchClaimTables;

  #selection: Selection = $state.raw(NOTHING_SELECTED);
  /** The open store's count of openings when the session last followed it: a larger count is an editor opened. */
  #openings = this.store.openings;
  /** The workspace's name at the last open, replace or save: a Save after a rename asks where (Save as). */
  #savedName = this.store.view.name;
  /** The folder the file dialog was last used in this session; `null` before. */
  #lastFolder: string | null = null;
  /** Whether the page said that a save downloads. */
  #toldDownload = false;
  #listeners = new Set<() => void>();
  #unsubscribe: () => void;
  #saving = false;
  #loadingTables = false;
  readonly #options: SessionOptions;

  constructor(options: SessionOptions) {
    this.#options = options;
    this.tables = new MatchClaimTables(options.matchClaims ?? null, options.askTables ?? null, () =>
      this.#places(),
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
   * file, which is called `name` and written back through `handle` (the
   * browser's) or at `path` (the server's). A workspace whose journal does
   * not reproduce its view is refused (`journal_mismatch`, at the first
   * place it differs) and the open one kept.
   */
  replace(
    workspace: Workspace,
    name: string,
    handle: FileSystemFileHandle | null,
    saved: boolean,
    path: string | null = null,
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
    this.tables.clear();
    this.store = next;
    this.#openings = next.openings;
    this.#savedName = next.view.name;
    this.savedView = saved ? next.view : null;
    this.fileName = name;
    this.handle = handle;
    this.path = path;
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
    path: string | null = null,
  ): LoadError | null {
    const workspace = readWorkspace(text);
    if (isLoadError(workspace)) return workspace;
    return this.replace(workspace, name, handle, true, path);
  }

  /** The user's files through the server, where the editor reaches them now; `null` where it does not. */
  get files(): FileHost | null {
    return this.#options.files?.() ?? null;
  }

  /** The folder of the workspace's file on the server, `""` (the root) for a workspace without one. */
  get #folder(): string {
    return this.path === null ? "" : folderOf(this.path);
  }

  /** Where the file dialog starts: where it was last used, else the workspace file's folder. */
  get #start(): string {
    return this.#lastFolder ?? this.#folder;
  }

  /** Let the user choose a file of one of `kinds` in the file dialog of `host`; its path, `null` when cancelled. */
  async #chosen(
    host: FileHost,
    kinds: readonly FileKind[],
    near: string | null,
  ): Promise<string | null> {
    const path = await host.open(kinds, near === null ? this.#start : folderOf(near));
    if (path !== null) this.#lastFolder = folderOf(path);
    return path;
  }

  /**
   * The path from the server's root of the file block `block`'s manifest
   * came from, as the workspace states it (`location`, relative to the
   * workspace file's folder); `null` where it states none.
   */
  manifestPath(block: string): string | null {
    const location = this.store.view.settings.manifests[block]?.location;
    return location === undefined ? null : resolvedPath(this.#folder, location);
  }

  /** Keep `path` as where block `block`'s manifest file lies, relative to the workspace file's folder. */
  #locate(block: string, path: string): void {
    const file = manifestFileOf(this.store.view.settings, block);
    const configured = this.store.configure({
      manifests: { [block]: { ...file, location: relativePath(this.#folder, path) } },
    });
    if (configured !== null) throw new Error(`a location is refused: ${configured.message}`);
  }

  /** The server's files as the MatchClaim tables reach them; `null` where the editor does not reach them. */
  #places(): ManifestPlaces | null {
    const host = this.files;
    if (host === null) return null;
    return {
      files: host.server,
      pathOf: (block) => this.manifestPath(block),
      located: (block, path) => this.#locate(block, path),
      choose: (kinds, near) => this.#chosen(host, kinds, near),
    };
  }

  /**
   * Rename the workspace to `name` (`set {} {name}`, journalled): `null`
   * when it is renamed or already so called, else the store's refusal's
   * message (an empty name; a rename inside an editor).
   */
  rename(name: string): string | null {
    const field = {
      target: WORKSPACE,
      name: this.store.view.name,
      nullable: false,
      manifest: null,
    };
    const command = nameCommand(field, name);
    if (command === null) return null;
    return this.store.dispatch(command)?.message ?? null;
  }

  /** The open workspace as Save writes it. */
  text(): string {
    return writeWorkspace(this.store.snapshot());
  }

  /**
   * Save the open workspace: back into its file, or, with `as`, without a
   * file to write back to (a new workspace, one without a handle), or after
   * a rename since it was last opened or saved (until the rename is
   * undone), to a file the user chooses now, offered under the workspace's
   * file name: the one its name gives for a new or renamed workspace, else
   * its file's. Through the server (`FileHost`) the file is a path chosen in
   * the file dialog, and a save into another folder first rewrites every
   * block's manifest location relative to that folder; otherwise it is
   * the browser's (`saveFile`), and where that downloads, the page says so
   * once. A save requested while one is under way is ignored.
   */
  async save(as: boolean): Promise<void> {
    if (this.#saving) return;
    this.#saving = true;
    const renamed = this.store.view.name !== this.#savedName;
    const offered =
      renamed || (this.handle === null && this.path === null && this.fileName === UNTITLED)
        ? workspaceFileName(this.store.view.name)
        : this.fileName;
    try {
      const host = this.files;
      if (host === null) await this.#saveInBrowser(as || renamed, offered);
      else await this.#saveOnServer(host, as || renamed, offered);
    } catch (error) {
      this.#options.warn(`The workspace could not be saved: ${messageOf(error)}`);
    } finally {
      this.#saving = false;
    }
  }

  /** Save through the browser: into the handle unless `asking`, else to a file picked, or downloaded. */
  async #saveInBrowser(asking: boolean, offered: string): Promise<void> {
    const current = this.store.view;
    const text = this.text();
    const saved = await saveFile(text, WORKSPACE_FILE, offered, asking ? null : this.handle);
    if (saved === null) return;
    this.fileName = saved.name;
    this.handle = saved.handle;
    this.path = null;
    this.#saved(current);
    if (saved.handle === null && savesByDownload() && !this.#toldDownload) {
      this.#toldDownload = true;
      this.#options.inform?.(SAVED_AS_DOWNLOAD);
    }
  }

  /**
   * Save through the server: at `path` unless `asking` or without one, else
   * at the path chosen in the file dialog. The text written holds every
   * block's manifest location relative to the folder it is written into
   * (`#relocated`); the settings take those locations once it is written,
   * and nothing changes when the write fails.
   */
  async #saveOnServer(host: FileHost, asking: boolean, offered: string): Promise<void> {
    const target =
      !asking && this.path !== null
        ? this.path
        : await host.save(WORKSPACE_FILE, this.#start, offered);
    if (target === null) return;
    this.#lastFolder = folderOf(target);
    const current = this.store.view;
    const snapshot = this.store.snapshot();
    const moved = this.#relocated(snapshot.view.settings.manifests, folderOf(target));
    const written =
      moved === null
        ? snapshot
        : {
            ...snapshot,
            view: {
              ...snapshot.view,
              settings: {
                ...snapshot.view.settings,
                manifests: { ...snapshot.view.settings.manifests, ...moved },
              },
            },
          };
    await host.server.writeFile(target, writeWorkspace(written));
    const unchanged = this.store.view === current;
    if (moved !== null) {
      const configured = this.store.configure({ manifests: moved });
      if (configured !== null) throw new Error(`a location is refused: ${configured.message}`);
    }
    this.fileName = baseName(target);
    this.handle = null;
    this.path = target;
    // Changes made while the file was written are not in it, so they stay unsaved.
    this.#saved(unchanged ? this.store.view : current);
  }

  /**
   * The entries of `manifests` whose stated location changes when the
   * workspace file lies in `folder` instead of its own folder, each with
   * the location relative to `folder` (one leading out of the root is
   * kept as it is); `null` when none changes.
   */
  #relocated(
    manifests: View["settings"]["manifests"],
    folder: string,
  ): { [block: string]: ManifestFile } | null {
    const changed: { [block: string]: ManifestFile } = {};
    for (const [block, file] of Object.entries(manifests)) {
      if (file.location === undefined) continue;
      const path = resolvedPath(this.#folder, file.location);
      if (path === null) continue;
      const location = relativePath(folder, path);
      if (location !== file.location) changed[block] = { ...file, location };
    }
    return Object.keys(changed).length === 0 ? null : changed;
  }

  /** The view `current` is now the file's: no changes are unsaved, and its name is the saved one. */
  #saved(current: View): void {
    this.savedView = current;
    this.#savedName = current.name;
    this.#notify();
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
   * Import the manifest files the viewer picks, each as one new block: one
   * chosen in the file dialog through the server (`importPath`), else those
   * picked in the browser, with the MatchClaim tables picked beside them
   * (`importPicked`).
   */
  async importManifest(canvas: ImportTarget, metrics: FontMetrics): Promise<void> {
    try {
      const host = this.files;
      if (host === null) {
        await this.importPicked(
          await openFiles(withMatchClaimTable(MANIFEST_FILE), true),
          canvas,
          metrics,
        );
        return;
      }
      const path = await this.#chosen(host, [MANIFEST_FILE], null);
      if (path !== null) await this.importPath(host, path, canvas, metrics);
    } catch (error) {
      this.#options.warn(`The file could not be imported: ${messageOf(error)}`);
    }
  }

  /**
   * Import the manifest file at `path` on the server as one new block
   * (`#add`), the workspace keeping where it lies (`location`); the new
   * block, `null` when the file is no manifest.
   */
  async importPath(
    host: FileHost,
    path: string,
    canvas: ImportTarget,
    metrics: FontMetrics,
  ): Promise<string | null> {
    const text = await (await host.server.readFile(path)).text();
    const block = this.#add(baseName(path), text, canvas, metrics);
    if (block !== null) this.#locate(block, path);
    return block;
  }

  /**
   * Let the user choose a workspace or a manifest file in the file dialog
   * (Open… through the server); its path, `null` when cancelled.
   */
  async chooseOpened(host: FileHost): Promise<string | null> {
    return this.#chosen(host, OPENED_KINDS, null);
  }

  /** Open the workspace file at `path` on the server as saved; the reader's refusal, or `null` when it opened. */
  async openPath(host: FileHost, path: string): Promise<LoadError | null> {
    const text = await (await host.server.readFile(path)).text();
    return this.open(text, baseName(path), null, path);
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
   * Read the tables among `picked` as tables of `blocks`: every one is a
   * MatchClaim table, read through the server as the table of the block
   * whose manifest names a MatchClaim table of its file name, else of the
   * only block; a table no block takes is reported. A block whose table is
   * not among them says nothing: Show matches loads it.
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
  }

  /**
   * Load the MatchClaim table every block's manifest names where it is not
   * loaded (what turning Show matches on asks), block after block in
   * the canvas's one order of blocks (the arranger's `blocksInOrder`): from
   * beside the manifest's file (or where an example came from), silently,
   * else as the user chooses it (`MatchClaimTables.loadNamed`); what each
   * load says goes to the message bar. A call while one is under way is
   * ignored.
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
      if (block !== null && example.source !== undefined) this.tables.locate(block, example.source);
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
      addCommand(this.store.view, id, manifest, visible, metrics, this.#options.pane),
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
   * or closed, a setting): an editor that opened selects its edited
   * element (`editedSelection`), every other change keeps of the selection
   * what the view keeps under the innermost open editor (`existing`); then
   * tell the listeners.
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
