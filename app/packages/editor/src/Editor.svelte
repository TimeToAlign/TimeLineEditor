<script lang="ts">
/**
 * The TimeLineEditor: header, canvas, inspector and dialogs, for one
 * workspace. It styles only its own root, takes keys only inside its root
 * unless `shortcuts` is `"window"`, names every DOM id per instance, and
 * reaches outside itself only through its options: the server it asks, the
 * storage it keeps the autosave, the drawer's state, the user and the type
 * profiles in, the lookups it may make, and the callbacks. It holds the one
 * user of the editor (the journal's author, who states in the Metadata tab)
 * and its type profiles, and gives the user, the profiles and the lookup to
 * every part through context.
 */
import type {
  LivePlacement,
  ResizeMode,
  TransientCommand,
  Viewport,
} from "@timetoalign/tilie-arranger";
import { Canvas, isTextInput, Pane, selectionOf, within } from "@timetoalign/tilie-arranger";
import type { Health, Server } from "@timetoalign/tilie-client";
import { connect } from "@timetoalign/tilie-client";
import type { Address, LoadError, Problem, Store } from "@timetoalign/tilie-core";
import { emptyWorkspace, isCommandError, readAddress } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import type { Snippet } from "svelte";
import { onMount, tick, untrack } from "svelte";
import { on } from "svelte/events";
import AboutDialog from "./AboutDialog.svelte";
import { NOTICES_FILE } from "./attributions.ts";
import type { Autosaving } from "./autosaving.ts";
import { startAutosave } from "./autosaving.ts";
import ConfirmDialog from "./ConfirmDialog.svelte";
import type { Example } from "./examples.ts";
import { EXAMPLES } from "./examples.ts";
import FileDialog from "./FileDialog.svelte";
import type { MenuItem } from "./FileMenu.svelte";
import FileMenu from "./FileMenu.svelte";
import type { Opened } from "./files.ts";
import {
  baseName,
  isMatchClaimTable,
  isWorkspaceFile,
  OPENABLE_FILE,
  openFiles,
  UNTITLED,
} from "./files.ts";
import InspectorDrawer from "./InspectorDrawer.svelte";
import { blockIndexes, matchInputs, pinnedMatchStampOf } from "./inspector/matchstamps.ts";
import { createLookup, NO_LOOKUP, provideLookup } from "./lookup/index.ts";
import MessageBar from "./MessageBar.svelte";
import { measureMapsOf } from "./measureMaps.ts";
import { type MessageLevel, Messages, messageOf, providePost } from "./messages.svelte.ts";
import type { TimeLineEditorOptions } from "./options.ts";
import { providePane } from "./pane.ts";
import { Picking, providePicking } from "./pick.svelte.ts";
import ProfilesDialog from "./profiles/ProfilesDialog.svelte";
import { ProfilesState, provideProfiles } from "./profiles/profiles.svelte.ts";
import TablesDialog from "./TablesDialog.svelte";
import type { TestHook } from "./testHook.ts";
import { bandsOf, boxesOf, installTestHook, TEST_HOOK } from "./testHook.ts";
import { provideTransient } from "./transient.ts";
import UserDialog from "./UserDialog.svelte";
import { provideUser, UserState } from "./user.svelte.ts";
import WorkspaceTitle from "./WorkspaceTitle.svelte";
import type { FileHost } from "./workspaceSession.svelte.ts";
import { WorkspaceRefusedError, WorkspaceSession } from "./workspaceSession.svelte.ts";

type Props = TimeLineEditorOptions & {
  /** Install the test hook and the fixture menu; only a build carrying them has them. */
  readonly testHook?: boolean;
  /** Show the Examples menu. */
  readonly examples?: boolean;
  /**
   * The title the header shows: the page's own heading where the editor is
   * the page; without one, the editor's name as plain text, so a host page
   * keeps its own headings.
   */
  readonly title?: Snippet;
};

let {
  workspace,
  server = null,
  storage = null,
  shortcuts = "editor",
  autofocus = false,
  noticesUrl = NOTICES_FILE,
  lookup = true,
  onchange,
  onselect,
  testHook = false,
  examples = false,
  title,
}: Props = $props();

/** How long a change waits for a later one before the autosave writes it. */
const AUTOSAVE_DELAY_MS = 1000;

let root: HTMLElement | undefined = $state();
let arranger: HTMLElement | undefined = $state();
let canvas: ReturnType<typeof Canvas> | undefined = $state();
let confirm: ReturnType<typeof ConfirmDialog> | undefined = $state();
let tablesDialog: ReturnType<typeof TablesDialog> | undefined = $state();
let fileDialog: ReturnType<typeof FileDialog> | undefined = $state();
let about: ReturnType<typeof AboutDialog> | undefined = $state();
let drawer: ReturnType<typeof InspectorDrawer> | undefined = $state();
let userDialog: ReturnType<typeof UserDialog> | undefined = $state();
let profilesDialog: ReturnType<typeof ProfilesDialog> | undefined = $state();

// --- Messages ---------------------------------------------------------------

const messages = new Messages();

/** Show a message in the message bar, the editor's one place for them; editing goes on. */
function post(level: MessageLevel, text: string, problems: readonly Problem[] = []): void {
  messages.post(level, text, problems);
}

// Every component below posts its messages through this one function.
providePost(post);

/** What a control below shows on the canvas before committing it (the wedge rotation's drag). */
let transient: TransientCommand | null = $state.raw(null);
provideTransient((shown) => (transient = shown));

/**
 * The canvas's pane, which the canvas measures: every drawing the editor reads
 * beside the canvas (the inspector's, an import's place) is drawn at it.
 */
const pane = new Pane();
providePane(pane);

// --- The user, the type profiles and the lookup ---------------------------------

/** The one user: the viewer's own, read from storage once, at mount; never written to the workspace. */
const user = new UserState(untrack(() => storage?.userKey ?? null));

/** Ask for the user's name and iD; a saved answer becomes the user and the open store's author. */
async function askUser(): Promise<void> {
  const answer = (await userDialog?.ask(user.user)) ?? null;
  if (answer === null) return;
  user.set(answer);
  session.store.setAuthor(answer.name);
}

provideUser({ state: user, ask: askUser });

/** The viewer's type profiles and lookup services, kept only where the host's storage options say. */
const profiles = new ProfilesState(untrack(() => storage?.profilesKey ?? null));
provideProfiles(profiles);

// Lookups leave the browser only where the host allows them; the services are the profiles' own.
provideLookup(
  untrack(() =>
    lookup
      ? createLookup({ server: server ?? null, services: () => profiles.profiles.services })
      : NO_LOOKUP,
  ),
);

/** A panel's question for an element on the canvas, which the canvas answers while it is asked. */
const picking = new Picking();
providePicking(picking);

// --- The workspace ----------------------------------------------------------

/** The server's calls; `null` without a server. */
const client = untrack(() => (server === null ? null : connect(server)));

/** The server's health, kept for the About pane; `null` until it answers. */
let health: Health | null = $state.raw(null);

/**
 * The user's files through the server, once it answered its health check:
 * from then on Open…, Import manifest… and Save as… use the editor's file
 * dialog; before, and without a server, the browser's pickers.
 */
const fileHost: FileHost | null = $derived(
  client === null || health === null
    ? null
    : {
        server: client,
        open: async (kinds, start) => (await fileDialog?.open(kinds, start)) ?? null,
        save: async (kind, start, suggested) =>
          (await fileDialog?.save(kind, start, suggested)) ?? null,
      },
);

const session = new WorkspaceSession({
  author: () => user.name,
  post,
  matchClaims: client,
  askTables: (request) => tablesDialog?.ask(request) ?? Promise.resolve(null),
  // Read when matches are asked for, after the health check below was started;
  // the tables read through the server once `fileHost` is given, after it answered.
  healthFailure: () => (offline === "" ? null : offline),
  files: () => fileHost,
  pane,
  // Never take the focus from the host page: only the page asks for it, or
  // a viewer already working in the editor.
  replaced: () => {
    if (autofocus || within(root, document.activeElement)) canvas?.focus();
  },
  selected: (selection) => {
    onselect?.(selection);
    drawer?.selected(selection);
  },
});

// The viewer's own state: never written to the workspace.
/** The placement a drag or resize on the canvas shows before release, for the inspector. */
let placement: LivePlacement | null = $state.raw(null);
let locked = $state(false);
let mode: ResizeMode = $state("scale");
let viewport: Viewport = $state.raw({ x: 0, y: 0, zoom: 1 });

/** The store the editing path was last followed in, and how many editors were open then. */
let followed: Store = session.store;
let depth = followed.editing.length;

/**
 * Open the drawer when the first editor opens (the viewer may close it
 * again while editing), and after one closes give the focus back to the
 * arranger when it was on a control that went with the editor. The session
 * keeps the selection to what the innermost editor holds.
 */
function followEditing(): void {
  const current = session.store;
  if (current !== followed) {
    followed = current;
    depth = current.editing.length;
    return;
  }
  const count = current.editing.length;
  if (count > 0 && depth === 0 && drawer?.isOpen() === false) drawer.setOpen(true);
  if (count < depth) {
    void tick().then(() => {
      if (document.activeElement === null || document.activeElement === document.body) {
        canvas?.focus();
      }
    });
  }
  depth = count;
}

session.listen(followEditing);
session.listen(() =>
  onchange?.({
    fileName: session.fileName,
    dirty: session.store.view !== session.savedView,
  }),
);

const initial = untrack(() => workspace);
if (initial !== undefined) {
  const refusal = session.open(initial);
  if (refusal !== null) post("error", "The workspace could not be opened.", refusal.problems);
}

// --- Files ------------------------------------------------------------------

/**
 * Whether the open workspace, and with it the MatchClaim tables held for
 * it, may be replaced: nothing is unsaved (the workspace, a table a belief
 * changed), or the viewer saves all of it (and every save is made) or
 * discards it. One question for New, Open and a workspace example (or
 * fixture).
 */
async function mayReplace(): Promise<boolean> {
  const question = session.unsaved();
  if (question === null) return true;
  const answer = await confirm?.ask(question, ["Save", "Discard", "Cancel"], "Cancel");
  if (answer === "Discard") return true;
  if (answer !== "Save") return false;
  return session.saveUnsaved();
}

async function newWorkspace(): Promise<void> {
  if (await mayReplace()) session.replace(emptyWorkspace(), UNTITLED, null, true);
}

/**
 * Open `example`: a manifest is imported as one more block, as Import adds
 * a file; a workspace replaces the open one (`mayReplace`), opened as saved
 * under no file.
 */
async function openExample(example: Example): Promise<void> {
  if (example.kind === "manifest") {
    if (canvas !== undefined) await session.importExample(example, canvas, fontMetrics);
    return;
  }
  if (!(await mayReplace())) return;
  try {
    const refusal = session.open(await example.text(), UNTITLED);
    if (refusal !== null)
      post("error", `The example ${example.label} could not be opened.`, refusal.problems);
  } catch (error) {
    post("error", `The example ${example.label} could not be opened: ${messageOf(error)}`);
  }
}

/**
 * Open the files the viewer picks: a workspace file replaces the open
 * workspace (`openWorkspace`), manifest files are imported (`openManifests`),
 * each with the MatchClaim tables picked beside it. Through the server the
 * viewer chooses one file in the file dialog (`openOnServer`).
 */
async function openFromFile(): Promise<void> {
  try {
    const host = session.files;
    if (host !== null) {
      await openOnServer(host);
      return;
    }
    const picked = await openFiles(OPENABLE_FILE, true);
    if (picked.length === 0) return;
    if (picked.some(({ name }) => isWorkspaceFile(name))) await openWorkspace(picked);
    else if (picked.some(({ name }) => !isMatchClaimTable(name))) await openManifests(picked);
    else
      post(
        "warning",
        "No workspace or manifest was picked: a MatchClaim table opens with one of them.",
      );
  } catch (error) {
    post("error", `The file could not be opened: ${messageOf(error)}`);
  }
}

/**
 * Open the file the viewer chooses in the file dialog: a workspace replaces
 * the open one (`mayReplace`); a manifest is imported as Import manifest…
 * imports it, after the question `openManifests` asks.
 */
async function openOnServer(host: FileHost): Promise<void> {
  const path = await session.chooseOpened(host);
  if (path === null) return;
  const name = baseName(path);
  if (isWorkspaceFile(name)) {
    if (!(await mayReplace())) return;
    const refusal = await session.openPath(host, path);
    if (refusal !== null)
      post("error", `${name} is not a workspace file TimeLineEditor can open.`, refusal.problems);
    return;
  }
  if (canvas === undefined || !(await mayAdd([name]))) return;
  await session.importPath(host, path, canvas, fontMetrics);
}

/** Replace the open workspace (`mayReplace`) by the workspace file among `picked`. */
async function openWorkspace(picked: readonly Opened[]): Promise<void> {
  if (!(await mayReplace())) return;
  const refusal = await session.openPicked(picked);
  if (refusal !== null) {
    const name = picked.find((opened) => isWorkspaceFile(opened.name))?.name ?? "The file";
    post("error", `${name} is not a workspace file TimeLineEditor can open.`, refusal.problems);
  }
}

/**
 * Import the manifest files among `picked`, as Import manifest… does: into
 * an empty workspace at once; otherwise the viewer is asked whether to add
 * them to the open workspace or to open them in a new, empty one, before
 * which the open workspace, if unsaved, is saved (the save dialog, then
 * each changed MatchClaim table's); a save not made keeps it open and
 * imports nothing.
 */
async function openManifests(picked: readonly Opened[]): Promise<void> {
  if (canvas === undefined) return;
  const names = picked.filter(({ name }) => !isMatchClaimTable(name)).map(({ name }) => name);
  if (!(await mayAdd(names))) return;
  await session.importPicked(picked, canvas, fontMetrics);
}

/**
 * Whether the manifests `names` are to be imported: at once into an empty
 * workspace; otherwise the viewer is asked whether to add them to the open
 * workspace or to open them in a new, empty one, before which the open
 * workspace, if unsaved, is saved; a save not made keeps it open and
 * imports nothing.
 */
async function mayAdd(names: readonly string[]): Promise<boolean> {
  if (Object.keys(session.store.view.blocks).length === 0) return true;
  const them = names.length === 1 ? "it" : "them";
  const answer = await confirm?.ask(
    `Add ${names.join(", ")} to the open workspace, or open ${them} in a new, empty workspace?`,
    ["Add", "New workspace", "Cancel"],
    "Add",
  );
  if (answer !== "Add" && answer !== "New workspace") return false;
  if (answer === "New workspace") {
    if (session.unsaved() !== null && !(await session.saveUnsaved())) return false;
    session.replace(emptyWorkspace(), UNTITLED, null, true);
  }
  return true;
}

// --- Shortcuts --------------------------------------------------------------

const MAC = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

/** A key shortcut: its keys in `aria-keyshortcuts` form, how the menu shows it, and its action. */
interface Shortcut {
  readonly keys: string;
  readonly label: string;
  /** Whether it applies in a text field, which otherwise keeps the key for itself. */
  readonly inText: boolean;
  readonly run: () => void;
}

const SHORTCUTS = {
  open: {
    keys: "Control+O Meta+O",
    label: MAC ? "⌘O" : "Ctrl+O",
    inText: true,
    run: () => void openFromFile(),
  },
  save: {
    keys: "Control+S Meta+S",
    label: MAC ? "⌘S" : "Ctrl+S",
    inText: true,
    run: () => void session.save(false),
  },
  saveAs: {
    keys: "Control+Shift+S Meta+Shift+S",
    label: MAC ? "⇧⌘S" : "Ctrl+Shift+S",
    inText: true,
    run: () => void session.save(true),
  },
  undo: {
    keys: "Control+Z Meta+Z",
    label: MAC ? "⌘Z" : "Ctrl+Z",
    inText: false,
    run: () => session.step(true),
  },
  redo: {
    keys: "Control+Shift+Z Meta+Shift+Z Control+Y",
    label: MAC ? "⇧⌘Z" : "Ctrl+Y",
    inText: false,
    run: () => session.step(false),
  },
} as const satisfies Record<string, Shortcut>;

/** Whether `event` presses one of the combinations of `keys`, exactly these modifiers held. */
function presses(keys: string, event: KeyboardEvent): boolean {
  return keys.split(" ").some((combination) => {
    const parts = combination.split("+");
    return (
      event.key.toLowerCase() === parts.at(-1)?.toLowerCase() &&
      event.ctrlKey === parts.includes("Control") &&
      event.metaKey === parts.includes("Meta") &&
      event.shiftKey === parts.includes("Shift") &&
      event.altKey === parts.includes("Alt")
    );
  });
}

/**
 * The shortcuts, wherever the focus is in their scope outside a dialog:
 * open, save and save as (the browser's own actions prevented), and undo
 * and redo except in a text field, where the browser's own undo applies.
 */
function onkeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if (event.target instanceof Element && event.target.closest("dialog") !== null) return;
  const shortcut = Object.values(SHORTCUTS).find(({ keys }) => presses(keys, event));
  if (shortcut === undefined || (!shortcut.inText && isTextInput(event.target))) return;
  event.preventDefault();
  shortcut.run();
}

/** Listen for the shortcuts on the editor's root, or on the window when the page asks. */
function listenKeys(element: HTMLElement): () => void {
  return shortcuts === "window"
    ? on(window, "keydown", onkeydown)
    : on(element, "keydown", onkeydown);
}

/**
 * A click outside the canvas's area goes to the drawer, which clears a
 * pinned timestamp unless the click lies in the inspector's tabs or the
 * shown panel; the canvas pins and clears on its own clicks.
 */
function listenClicks(element: HTMLElement): () => void {
  return on(element, "click", (event) => {
    if (!within(arranger, event.target)) drawer?.clickedAt(event.target);
  });
}

const fileItems: readonly MenuItem[] = $derived([
  { label: "New workspace", run: newWorkspace },
  { label: "Open…", shortcut: SHORTCUTS.open.label, keys: SHORTCUTS.open.keys, run: openFromFile },
  {
    label: "Save",
    shortcut: SHORTCUTS.save.label,
    keys: SHORTCUTS.save.keys,
    run: SHORTCUTS.save.run,
  },
  {
    label: "Save as…",
    shortcut: SHORTCUTS.saveAs.label,
    keys: SHORTCUTS.saveAs.keys,
    run: SHORTCUTS.saveAs.run,
  },
  {
    label: "Import manifest…",
    run: () => {
      if (canvas !== undefined) void session.importManifest(canvas, fontMetrics);
    },
  },
  {
    label: "Export manifest…",
    disabled: session.exportable === null,
    run: () => session.exportManifest(),
  },
  { label: "Your name…", run: () => void askUser() },
  { label: "Type profiles…", run: () => profilesDialog?.open() },
]);

const exampleItems: readonly MenuItem[] = EXAMPLES.map((example) => ({
  label: example.label,
  run: () => void openExample(example),
}));

// --- Matches ------------------------------------------------------------------

/**
 * The anchor indexes of block `block`'s table under its MatchClaim filter,
 * for the user and under the block's manifest's context; `null` without a
 * table. The canvas, the drawer and the Matchstamp tab read this one.
 */
const indexesOf = (block: string) =>
  blockIndexes(session.live.view, block, session.tables.of(block)?.table ?? null, user.statedBy);

/**
 * What the canvas's match overlay draws: for every block holding a
 * MatchClaim table, the potential MatchStamps of that table under the
 * block's filter over that block, and its named MatchStamps compared with
 * the table; nothing without a table.
 */
const matches = $derived(matchInputs(session.live.view, session.tables.blocks, indexesOf));
/** The potential MatchStamp the Matchstamp tab shows, with its block, drawn blue. */
const pinnedMatchStamp = $derived(pinnedMatchStampOf(drawer?.shownMatch() ?? null, indexesOf));

// --- The server and the autosave ---------------------------------------------

/** Why the health check failed, the offline mark's title and hidden text; empty while it has not failed. */
let offline = $state("");

/**
 * Whether Show matches is on, as the canvas last said (`onmatches`): what
 * the health check's answer loads the named tables for. Not state.
 */
let matchesShown = false;

/**
 * Ask the server's health check. With Show matches already on (turned on
 * while it had not answered yet, so nothing was asked or said), its
 * outcome is followed as a press now would be: answered, the named tables
 * are loaded; failed, the message bar says once, as information, that
 * matches need a running server (`WorkspaceSession.loadNamedTables`).
 */
async function checkHealth(calls: Server): Promise<void> {
  try {
    health = await calls.health();
  } catch (error) {
    offline = `The server did not answer the health check (${messageOf(error)}).`;
  }
  if (matchesShown) void session.loadNamedTables();
}

let autosaving: Autosaving | null = null;

onMount(() => {
  if (autofocus) canvas?.focus();
  if (storage !== null) {
    autosaving = startAutosave(session, {
      slot: storage.slot,
      delayMs: AUTOSAVE_DELAY_MS,
      post,
      ask: async (question, answers, focused) =>
        (await confirm?.ask(question, answers, focused)) ?? null,
    });
  }
  if (client !== null) void checkHealth(client);
  return () => {
    autosaving?.stop();
    session.dispose();
    messages.dispose();
  };
});

// --- What a host calls ------------------------------------------------------

/** The open workspace as Save writes it. */
export function text(): string {
  return session.text();
}

/** Open the workspace file `text` without asking; the reader's refusal, or `null` when it opened. */
export function load(text: string, name: string = UNTITLED): LoadError | null {
  return session.open(text, name);
}

/** The selected addresses. */
export function selection(): Address[] {
  return [...session.selection.values()];
}

/**
 * Select `addresses`, each read at this boundary (core's `readAddress`): an
 * address that is not one is left out, and the message bar names its
 * problem.
 */
export function select(addresses: readonly Address[]): void {
  const problems: Problem[] = [];
  const read: Address[] = [];
  addresses.forEach((value, index) => {
    const address = readAddress(value, ["addresses", index]);
    if (isCommandError(address)) problems.push(address);
    else read.push(address);
  });
  if (problems.length > 0) post("warning", "Some addresses could not be selected.", problems);
  session.selection = selectionOf(read);
}

/** Move the focus to the canvas. */
export function focus(): void {
  canvas?.focus();
}

/** Write the pending autosave now and wait for it; at once without autosave. */
export function flush(): Promise<void> {
  return autosaving?.flush() ?? Promise.resolve();
}

/** Open `text`, throwing the reader's refusal: the test hook's load. */
function loadOrThrow(text: string): void {
  const refusal = load(text);
  if (refusal !== null) throw new WorkspaceRefusedError(refusal.problems);
}

const withTestHook = TEST_HOOK && untrack(() => testHook);

// The build flag is spelled out here rather than read from `TEST_HOOK`, so
// the bundler sees a constant condition and leaves the menu out of a
// production build.
const fixtureMenu =
  import.meta.env.DEV || import.meta.env.VITE_TILIE_TEST_HOOK === "1"
    ? import("./FixtureMenu.svelte")
    : null;

if (withTestHook) {
  /** What the end-to-end tests drive the editor through (`window.__tilie`). */
  const hook: TestHook = {
    load: loadOrThrow,
    store: () => session.store,
    selection,
    select,
    viewport: () => ({ x: viewport.x, y: viewport.y, zoom: viewport.zoom }),
    setViewport(next) {
      canvas?.setViewport(next);
    },
    locked: () => locked,
    mode: () => mode,
    health: () => health,
    text,
    editing: () => [...session.store.editing],
    open: (address) => session.store.open(address),
    done: () => session.store.done(),
    cancel: () => session.store.cancel(),
    bands: (block) => bandsOf(session.store.view, block, pane),
    boxes: (block) => boxesOf(session.store.view, block, pane),
  };
  $effect(() => installTestHook(hook));
}
</script>

<div class="editor" bind:this={root} {@attach listenKeys} {@attach listenClicks}>
  <header>
    {#if title}{@render title()}{:else}<span class="title">TimeLineEditor</span>{/if}
    <FileMenu label="File" items={fileItems} />
    {#if examples}<FileMenu label="Examples" items={exampleItems} />{/if}
    <WorkspaceTitle
      name={session.live.view.name}
      fileName={session.fileName}
      dirty={session.dirty}
      onrename={(name) => session.rename(name)}
    />
    <span class="server" aria-live="polite">
      {#if offline}<span class="offline" title={offline}
          >offline<span class="visually-hidden">: {offline}</span></span
        >{/if}
    </span>
    <span class="spacer"></span>
    {#if withTestHook && fixtureMenu !== null}
      {#await fixtureMenu then { default: FixtureMenu }}<FixtureMenu onopen={openExample} />{/await}
    {/if}
    <button type="button" class="about-button" onclick={() => about?.open()}>About</button>
  </header>

  <main>
    <div class="arranger" bind:this={arranger}>
      <Canvas
        bind:this={canvas}
        live={session.live}
        metrics={fontMetrics}
        {pane}
        bind:selection={session.selection}
        bind:locked
        bind:mode
        bind:viewport
        onlive={(next) => (placement = next)}
        {transient}
        pinned={drawer?.shownPin() ?? null}
        oncoordinatepin={(pin, line) => drawer?.pinTimestamp(pin, line)}
        measureMaps={client === null ? undefined : measureMapsOf(client)}
        picking={picking.active ? picking.take : null}
        {matches}
        {pinnedMatchStamp}
        onrefuse={(text) => post("info", text)}
        onmatchstamppin={(pin) => drawer?.pinMatchStamp(pin)}
        onmatches={(shown) => {
          matchesShown = shown;
          if (shown) void session.loadNamedTables();
        }}
      />
      <MessageBar messages={messages.shown} ondismiss={(id) => messages.dismiss(id)} />
    </div>
    <InspectorDrawer
      bind:this={drawer}
      live={session.live}
      selection={session.selection}
      {placement}
      storageKey={storage?.inspectorKey ?? null}
      knotsOf={(manifest) => canvas?.knotsOf(manifest)}
      tables={session.tables}
      {indexesOf}
      onselect={(address) => (session.selection = selectionOf([address]))}
      {locked}
    />
  </main>

  <ConfirmDialog bind:this={confirm} />
  <TablesDialog bind:this={tablesDialog} />
  {#if client !== null}<FileDialog bind:this={fileDialog} server={client} />{/if}
  <UserDialog bind:this={userDialog} />
  <ProfilesDialog bind:this={profilesDialog} />
  <AboutDialog bind:this={about} connected={server !== null} {health} {offline} {noticesUrl} />
</div>

<style>
  /* The whole editor fills the element the host gives it; its parts are sized by its width. */
  .editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    height: 100%;
    font-family: system-ui, sans-serif;
    color: #1a1a1a;
    background: #fafafa;
    container-type: inline-size;
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

  /* The editor's name without the page's title: no heading, the host page owns its headings. */
  .title {
    font-size: 0.95rem;
    font-weight: bold;
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

  .spacer {
    flex: 1;
  }

  .about-button {
    padding: 0.1rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
    font: inherit;
    font-size: 0.85rem;
    color: inherit;
    cursor: pointer;
  }

  .about-button:hover {
    background: #ececec;
  }

  .about-button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  /* The drawer's closed tab is placed against this box's right edge. */
  main {
    position: relative;
    display: flex;
    min-height: 0;
  }

  .arranger {
    position: relative;
    flex: 1;
    min-width: 0;
    background: #fff;
  }
</style>
