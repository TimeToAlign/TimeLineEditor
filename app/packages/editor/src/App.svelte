<script lang="ts">
import type { LivePlacement, ResizeMode, Selection } from "@timetoalign/tilie-arranger";
import { addCommand, blockOf, Canvas, existing } from "@timetoalign/tilie-arranger";
import type { Problem, Store, View, Workspace } from "@timetoalign/tilie-core";
import {
  createStore,
  createView,
  isLoadError,
  loadManifest,
  mintBlockId,
  readWorkspace,
  saveManifest,
  writeWorkspace,
} from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timeskeleton";
import { onMount, tick } from "svelte";
import AboutDialog from "./AboutDialog.svelte";
import type { Snapshot } from "./autosave.ts";
import { AutosaveError, createAutosave, recoverWorkspace } from "./autosave.ts";
import ConfirmDialog from "./ConfirmDialog.svelte";
import type { MenuItem } from "./FileMenu.svelte";
import FileMenu from "./FileMenu.svelte";
import {
  lastChanged,
  MANIFEST_FILE,
  manifestFileName,
  openFile,
  saveFile,
  UNTITLED,
  WORKSPACE_FILE,
} from "./files.ts";
import { FIXTURES } from "./fixtures.ts";
import Inspector from "./inspector/Inspector.svelte";
import type { Message } from "./MessageArea.svelte";
import MessageArea from "./MessageArea.svelte";
import type { Health, TestHook, ViewportValue } from "./testHook.ts";
import { installTestHook, TEST_HOOK, WorkspaceRefusedError } from "./testHook.ts";

/** The server's health, kept for the About pane; `null` until it answers. */
let health: Health | null = $state.raw(null);
/** Why the health check failed, the offline mark's title and hidden text; empty while it has not failed. */
let offline = $state("");

/** The empty workspace a new store starts from. */
const EMPTY: Workspace = { view: createView(), journal: [] };
/** The autosave slot of the open workspace; one, whichever workspace is open. */
const AUTOSAVE_KEY = "current";
const AUTOSAVE_DELAY_MS = 1000;

const initial = createStore(EMPTY);
/** The open workspace. */
let store: Store = $state.raw(initial);
/** The store's current view, followed through its subscription. */
let view: View = $state.raw(initial.view);
/** The view as last opened or saved; `null` for a workspace never saved (a restored one). */
let savedView: View | null = $state.raw(initial.view);
/** The file the workspace was opened from or last saved to. */
let fileName = $state(UNTITLED);
/** Where Save writes back to, when the browser handed over a file handle. */
let fileHandle: FileSystemFileHandle | null = null;
const dirty = $derived(view !== savedView);

// The viewer's own state: never written to the workspace.
let selection: Selection = $state.raw(new Set());
/** The placement a drag or resize on the canvas shows before release, for the inspector. */
let live: LivePlacement | null = $state.raw(null);
let locked = $state(false);
let mode: ResizeMode = $state("scale");
let viewport: ViewportValue = $state.raw({ x: 0, y: 0, zoom: 1 });

let canvas: ReturnType<typeof Canvas> | undefined = $state();
let confirm: ReturnType<typeof ConfirmDialog> | undefined = $state();
let about: ReturnType<typeof AboutDialog> | undefined = $state();

// --- Messages ---------------------------------------------------------------

let messages: readonly Message[] = $state.raw([]);
let messageCount = 0;

/** Show a dismissible message; editing goes on. */
function say(text: string, problems: readonly Problem[] = []): void {
  messageCount += 1;
  messages = [...messages, { id: messageCount, text, problems }];
}

function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// --- Autosave ---------------------------------------------------------------

let autosaveFailed = false;

/** Show the first autosave failure of the session; later ones would only repeat it. */
function autosaveFailure(error: unknown): void {
  if (autosaveFailed) return;
  autosaveFailed = true;
  const reason = error instanceof AutosaveError ? error.message : failure(error);
  say(`Autosave is not working, so unsaved changes cannot be recovered: ${reason}`);
}

const autosave = createAutosave({
  key: AUTOSAVE_KEY,
  delayMs: AUTOSAVE_DELAY_MS,
  onError: autosaveFailure,
});

/** Write the pending autosave now: when the page is hidden, and when the editor goes away. */
function flushAutosave(): void {
  autosave.flush().catch(autosaveFailure);
}

$effect(() => () => {
  // Nothing is shown any more, so a failure here has nowhere to go.
  autosave.flush().catch(() => {});
});

/** The Web Lock a tab holds on the autosave slot while it autosaves. */
const AUTOSAVE_LOCK = `tilie-autosave/${AUTOSAVE_KEY}`;
/**
 * Whether this tab autosaves: it holds the slot's lock, or the browser has
 * no Web Locks. False until that is known, so nothing is written before.
 */
let autosaving = false;
let releaseLock: (() => void) | undefined;

$effect(() => () => releaseLock?.());

/**
 * Keep the slot in step with the open workspace: while it is unsaved, its
 * snapshot (written once the delay has passed); once it is saved (opened,
 * new, saved, or undone back to the saved view), nothing.
 */
function track(): void {
  if (!autosaving) return;
  const current = store;
  if (current.view === savedView) {
    autosave.discard();
    return;
  }
  const workspace: Workspace = { view: current.view, journal: [...current.journal] };
  const name = fileName;
  autosave.schedule(() => ({ text: writeWorkspace(workspace), name }));
}

/** Hold the slot's lock for as long as the editor lives; `false` when another tab holds it. */
function claimAutosave(): Promise<boolean> {
  if (!("locks" in navigator) || navigator.locks === undefined) return Promise.resolve(true);
  return new Promise((resolve) => {
    void navigator.locks.request(AUTOSAVE_LOCK, { ifAvailable: true }, (lock) => {
      if (lock === null) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise<void>((release) => {
        releaseLock = release;
      });
    });
  });
}

/** Autosave in this tab if no other tab does, and offer what an earlier session left. */
async function startAutosave(): Promise<void> {
  if (!(await claimAutosave())) {
    say(
      "Autosave is active in another TimeLineEditor tab, so changes in this tab are not autosaved.",
    );
    return;
  }
  autosaving = true;
  await offerRecovery();
  // Changes made meanwhile; a saved workspace leaves an unanswered slot alone.
  if (store.view !== savedView) track();
}

// `replace` sets the view of a new store; its later views arrive here.
$effect(() => {
  const current = store;
  return current.subscribe((next) => {
    view = next;
    track();
  });
});

// --- Workspaces and files ---------------------------------------------------

/** Make `workspace` the open one, in a new store; `saved` when it equals its file. */
function replace(
  workspace: Workspace,
  name: string,
  handle: FileSystemFileHandle | null,
  saved: boolean,
): void {
  const next = createStore(workspace);
  selection = new Set();
  store = next;
  view = next.view;
  savedView = saved ? next.view : null;
  fileName = name;
  fileHandle = handle;
  track();
  canvas?.focus();
}

/** Open the workspace file `text` in a new store; throws when the file is refused. */
function openWorkspace(
  text: string,
  name = UNTITLED,
  handle: FileSystemFileHandle | null = null,
): void {
  const workspace = readWorkspace(text);
  if (isLoadError(workspace)) throw new WorkspaceRefusedError(workspace.problems);
  replace(workspace, name, handle, true);
}

/** Whether the open workspace may be replaced: it is saved, or the viewer discards it. */
async function mayReplace(): Promise<boolean> {
  if (!dirty) return true;
  const answer = await confirm?.ask(
    `${fileName} has unsaved changes. Discard them?`,
    "Discard",
    "Cancel",
    "second",
  );
  return answer === true;
}

async function newWorkspace(): Promise<void> {
  if (await mayReplace()) replace(EMPTY, UNTITLED, null, true);
}

async function openFromFile(): Promise<void> {
  if (!(await mayReplace())) return;
  try {
    const opened = await openFile(WORKSPACE_FILE);
    if (opened === null) return;
    const workspace = readWorkspace(opened.text);
    if (isLoadError(workspace)) {
      say(`${opened.name} is not a workspace file TimeLineEditor can open.`, workspace.problems);
      return;
    }
    replace(workspace, opened.name, opened.handle, true);
  } catch (error) {
    say(`The file could not be opened: ${failure(error)}`);
  }
}

/** Whether a save is under way; a second request meanwhile is ignored. */
let saving = false;

/**
 * Save the open workspace: back into its file, or, with `as` or without a
 * file handle (a new or restored workspace), to a file picked now, offered
 * under the workspace's file name.
 */
async function save(as: boolean): Promise<void> {
  if (saving) return;
  saving = true;
  const current = store.view;
  const text = writeWorkspace({ view: current, journal: store.journal });
  try {
    const saved = await saveFile(text, WORKSPACE_FILE, fileName, as ? null : fileHandle);
    if (saved === null) return;
    fileName = saved.name;
    fileHandle = saved.handle;
    savedView = current;
    track();
  } catch (error) {
    say(`The workspace could not be saved: ${failure(error)}`);
  } finally {
    saving = false;
  }
}

async function importManifest(): Promise<void> {
  try {
    const opened = await openFile(MANIFEST_FILE);
    if (opened === null) return;
    const manifest = loadManifest(opened.text);
    if (isLoadError(manifest)) {
      say(`${opened.name} is not a manifest TimeLineEditor can import.`, manifest.problems);
      return;
    }
    if (canvas === undefined) return;
    const id = mintBlockId();
    const refusal = store.dispatch(addCommand(store.view, id, manifest, canvas.visible()));
    if (refusal !== null) {
      say(`${opened.name} could not be added.`, [refusal]);
      return;
    }
    selection = new Set([id]);
    canvas.focus();
  } catch (error) {
    say(`The file could not be imported: ${failure(error)}`);
  }
}

/** The block the whole selection lies in, if it lies in exactly one. */
const exportable = $derived.by(() => {
  const blocks = new Set([...selection].map(blockOf));
  const [only] = blocks;
  return blocks.size === 1 && only !== undefined ? view.blocks[only] : undefined;
});

/** Export the selected block's manifest: the complete form, or every default left out. */
async function exportManifest(minimal: boolean): Promise<void> {
  const block = exportable;
  if (block === undefined) return;
  try {
    const text = saveManifest(block.manifest, { minimal });
    await saveFile(text, MANIFEST_FILE, manifestFileName(block.manifest));
  } catch (error) {
    say(`The manifest could not be exported: ${failure(error)}`);
  }
}

/** Undo or redo, then drop what the selection names that no longer exists. */
function step(back: boolean): void {
  if (back) store.undo();
  else store.redo();
  selection = existing(store.view, selection);
}

const MAC = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
const MOD = MAC ? "⌘" : "Ctrl+";

const fileItems: readonly MenuItem[] = $derived([
  { label: "New workspace", run: newWorkspace },
  { label: "Open…", shortcut: `${MOD}O`, keys: "Control+O Meta+O", run: openFromFile },
  { label: "Save", shortcut: `${MOD}S`, keys: "Control+S Meta+S", run: () => save(false) },
  {
    label: "Save as…",
    shortcut: MAC ? "⇧⌘S" : "Ctrl+Shift+S",
    keys: "Control+Shift+S Meta+Shift+S",
    run: () => save(true),
  },
  { label: "Import manifest…", run: importManifest },
  {
    label: "Export manifest…",
    disabled: exportable === undefined,
    run: () => exportManifest(false),
  },
  {
    label: "Export minimal manifest…",
    disabled: exportable === undefined,
    run: () => exportManifest(true),
  },
]);

function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement)
  );
}

/**
 * The page's own shortcuts, wherever the focus is outside a dialog: open,
 * save and save as (the browser's own actions prevented), and undo and redo
 * except in a text input, where the browser's own undo applies.
 */
function onkeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return;
  if (event.target instanceof Element && event.target.closest("dialog") !== null) return;
  const key = event.key.toLowerCase();
  if (key === "o" && !event.shiftKey) void openFromFile();
  else if (key === "s") void save(event.shiftKey);
  else if (key === "z" && !isTextInput(event.target)) step(!event.shiftKey);
  else if (key === "y" && event.ctrlKey && !event.shiftKey && !isTextInput(event.target))
    step(false);
  else return;
  event.preventDefault();
}

/** Offer the autosaved workspace when it holds more than an empty new one. */
async function offerRecovery(): Promise<void> {
  let snapshot: Snapshot | null;
  try {
    snapshot = await recoverWorkspace(AUTOSAVE_KEY);
  } catch (error) {
    autosaveFailure(error);
    return;
  }
  if (snapshot === null || snapshot.text === writeWorkspace(EMPTY)) return;
  const workspace = readWorkspace(snapshot.text);
  if (isLoadError(workspace)) {
    say("The autosaved workspace cannot be restored.", workspace.problems);
    return;
  }
  const when = lastChanged(workspace.journal);
  const answer = await confirm?.ask(
    `Restore the unsaved workspace${when === null ? "" : ` from ${when}`}?`,
    "Restore",
    "Discard",
    "first",
  );
  // A restored workspace has its file's name but no handle: its first Save asks where.
  if (answer === true) replace(workspace, snapshot.name, null, false);
  else if (answer === false) autosave.discard();
}

/** Where the viewer's choice of an open or closed inspector is remembered, per browser. */
const INSPECTOR_KEY = "tilie.inspector.open";

/** The remembered inspector state; closed when nothing is remembered or storage is unavailable. */
function rememberedInspector(): boolean {
  try {
    return localStorage.getItem(INSPECTOR_KEY) === "true";
  } catch {
    return false;
  }
}

/** The viewer's own state, never written to the workspace. */
let inspectorOpen = $state(rememberedInspector());
let inspectorTab: HTMLButtonElement | undefined = $state();
let inspectorClose: HTMLButtonElement | undefined = $state();

/** Open or close the inspector, remember the choice, and move the focus to the control that undoes it. */
async function showInspector(open: boolean): Promise<void> {
  inspectorOpen = open;
  try {
    localStorage.setItem(INSPECTOR_KEY, String(open));
  } catch {
    // Without storage the choice holds until the page is left.
  }
  await tick();
  (open ? inspectorClose : inspectorTab)?.focus();
}

let fixture = $state(FIXTURES[0]?.name ?? "");
let fixtureProblem = $state("");

/** Open the fixture chosen in the header's menu. */
async function loadFixture(): Promise<void> {
  const chosen = FIXTURES.find(({ name }) => name === fixture);
  if (chosen === undefined) return;
  try {
    openWorkspace(await chosen.text());
    fixtureProblem = "";
  } catch (error) {
    fixtureProblem = error instanceof Error ? error.message : String(error);
  }
}

if (TEST_HOOK) {
  /** What the end-to-end tests drive the editor through (`window.__tilie`). */
  const hook: TestHook = {
    load: (text) => openWorkspace(text),
    store: () => store,
    selection: () => [...selection],
    select(addresses) {
      selection = new Set(addresses);
    },
    viewport: () => ({ x: viewport.x, y: viewport.y, zoom: viewport.zoom }),
    setViewport(next) {
      canvas?.setViewport(next);
    },
    locked: () => locked,
    mode: () => mode,
    health: () => health,
    text: () => writeWorkspace({ view: store.view, journal: store.journal }),
  };
  $effect(() => installTestHook(hook));
}

/**
 * Take the run's token from the fragment `tilie` opens the editor with
 * (`/#token=…`) and remove it from the address bar and the history entry.
 * The fragment never reaches the server, so the token stays out of its logs.
 */
function takeToken(): string {
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  if (token === null) {
    return "";
  }
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  return token;
}

/** Mark the editor offline, for `reason`. */
function goOffline(reason: string): void {
  offline = `The server did not answer the health check (${reason}).`;
}

onMount(async () => {
  canvas?.focus();
  void startAutosave();
  const token = takeToken();
  try {
    const response = await fetch("/api/health", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      goOffline(`${response.status} ${response.statusText}`.trim());
      return;
    }
    health = (await response.json()) as Health;
  } catch (error) {
    goOffline(error instanceof Error ? error.message : String(error));
  }
});
</script>

<svelte:window {onkeydown} />
<svelte:document
  onvisibilitychange={() => {
    if (document.visibilityState === "hidden") flushAutosave();
  }}
/>

<svelte:head>
  <title>{dirty ? "• " : ""}{fileName} – TimeLineEditor</title>
</svelte:head>

<header>
  <h1>TimeLineEditor</h1>
  <FileMenu label="File" items={fileItems} />
  <span class="file" data-testid="file-name">{dirty ? "• " : ""}{fileName}</span>
  <span class="server" aria-live="polite">
    {#if offline}<span class="offline" title={offline}
        >offline<span class="visually-hidden">: {offline}</span></span
      >{/if}
  </span>
  <span class="spacer"></span>
  {#if TEST_HOOK && FIXTURES.length > 0}
    <div class="fixtures">
      <label>
        Fixture
        <select data-testid="fixture-select" bind:value={fixture}>
          {#each FIXTURES as item (item.name)}
            <option value={item.name}>{item.name}</option>
          {/each}
        </select>
      </label>
      <button type="button" data-testid="fixture-load" onclick={loadFixture}>Load</button>
      <span class="problem" role="status">{fixtureProblem}</span>
    </div>
  {/if}
  <button type="button" class="about-button" onclick={() => about?.open()}>About</button>
</header>

<main>
  <div class="arranger">
    <Canvas
      bind:this={canvas}
      {store}
      metrics={fontMetrics}
      bind:selection
      bind:locked
      bind:mode
      bind:viewport
      onlive={(placement) => (live = placement)}
    />
    <MessageArea
      {messages}
      ondismiss={(id) => (messages = messages.filter((message) => message.id !== id))}
    />
    {#if !inspectorOpen}
      <button
        type="button"
        class="inspector-tab"
        aria-expanded="false"
        aria-controls="inspector"
        aria-label="Open inspector"
        title="Open inspector"
        bind:this={inspectorTab}
        onclick={() => showInspector(true)}>«</button
      >
    {/if}
  </div>
  <aside id="inspector" class="inspector" aria-labelledby="inspector-heading" hidden={!inspectorOpen}>
    <div class="inspector-head">
      <h2 id="inspector-heading">Inspector</h2>
      <button
        type="button"
        aria-expanded={inspectorOpen}
        aria-controls="inspector"
        aria-label="Close inspector"
        title="Close inspector"
        bind:this={inspectorClose}
        onclick={() => showInspector(false)}>»</button
      >
    </div>
    <Inspector {store} {selection} {live} />
  </aside>
</main>

<ConfirmDialog bind:this={confirm} />
<AboutDialog bind:this={about} {health} {offline} />

<style>
  :global(html, body, #app) {
    margin: 0;
    height: 100%;
  }

  :global(#app) {
    display: grid;
    grid-template-rows: auto 1fr;
    font-family: system-ui, sans-serif;
    color: #1a1a1a;
    background: #fafafa;
  }

  /* A whole number of pixels high, so the canvas below starts on a pixel boundary. */
  header {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 32px;
    padding: 0 0.75rem;
    border-bottom: 1px solid #d0d0d0;
  }

  h1 {
    margin: 0;
    font-size: 0.95rem;
  }

  /* Read by assistive technology, not shown: the About pane shows the reason to everyone. */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .offline {
    font-size: 0.8rem;
    color: #666;
  }

  .file {
    font-size: 0.85rem;
    color: #3d3d3d;
    white-space: nowrap;
  }

  .spacer {
    flex: 1;
  }

  .fixtures {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
  }

  .about-button {
    padding: 0.1rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
    font-size: 0.85rem;
  }

  .about-button:hover {
    background: #ececec;
  }

  main {
    display: flex;
    min-height: 0;
  }

  .arranger {
    position: relative;
    flex: 1;
    min-width: 0;
    background: #fff;
  }

  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  /* The closed inspector's tab, protruding from the canvas's right edge near the top. */
  .inspector-tab {
    position: absolute;
    top: 0.75rem;
    right: 0;
    z-index: 10;
    padding: 0.4rem 0.35rem;
    border: 1px solid #d0d0d0;
    border-right: none;
    border-radius: 4px 0 0 4px;
    background: #fefefe;
    box-shadow: 0 0 2px 1px rgba(0, 0, 0, 0.08);
  }

  .inspector-tab:hover,
  .inspector-head button:hover {
    background: #f4f4f4;
  }

  /* A fixed share of the window; the arranger takes the rest. */
  .inspector {
    flex: none;
    width: clamp(22rem, 32vw, 40rem);
    border-left: 1px solid #d0d0d0;
    background: #fff;
    overflow: auto;
  }

  .inspector[hidden] {
    display: none;
  }

  .inspector-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem 0.25rem 0.75rem;
  }

  .inspector-head h2 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #595959;
  }

  .inspector-head button {
    padding: 0.2rem 0.45rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
  }
</style>
