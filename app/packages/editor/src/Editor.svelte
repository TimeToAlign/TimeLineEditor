<script lang="ts">
/**
 * The TimeLineEditor: header, canvas, inspector and dialogs, for one
 * workspace. It styles only its own root, takes keys only inside its root
 * unless `shortcuts` is `"window"`, names every DOM id per instance, and
 * reaches outside itself only through its options: the server it asks, the
 * storage it keeps the autosave and the drawer's state in, and the
 * callbacks.
 */
import type { LivePlacement, ResizeMode, Viewport } from "@timetoalign/tilie-arranger";
import { Canvas, isTextInput, within } from "@timetoalign/tilie-arranger";
import type { Health } from "@timetoalign/tilie-client";
import { connect } from "@timetoalign/tilie-client";
import type { LoadError, Problem, Store } from "@timetoalign/tilie-core";
import { emptyWorkspace } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import type { Snippet } from "svelte";
import { onMount, tick, untrack } from "svelte";
import { on } from "svelte/events";
import AboutDialog from "./AboutDialog.svelte";
import { NOTICES_FILE } from "./attributions.ts";
import type { Autosaving } from "./autosaving.ts";
import { startAutosave } from "./autosaving.ts";
import ConfirmDialog from "./ConfirmDialog.svelte";
import type { MenuItem } from "./FileMenu.svelte";
import FileMenu from "./FileMenu.svelte";
import FixtureMenu from "./FixtureMenu.svelte";
import { openFile, UNTITLED, WORKSPACE_FILE } from "./files.ts";
import InspectorDrawer from "./InspectorDrawer.svelte";
import MessageArea from "./MessageArea.svelte";
import type { Message } from "./messages.ts";
import { messageOf } from "./messages.ts";
import type { ServerOptions, TimeLineEditorOptions } from "./options.ts";
import type { TestHook } from "./testHook.ts";
import { bandsOf, boxesOf, installTestHook, TEST_HOOK } from "./testHook.ts";
import { WorkspaceRefusedError, WorkspaceSession } from "./workspaceSession.svelte.ts";

type Props = TimeLineEditorOptions & {
  /** Install the test hook and the fixture menu; only a build carrying them has them. */
  readonly testHook?: boolean;
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
  onchange,
  onselect,
  testHook = false,
  title,
}: Props = $props();

/** How long a change waits for a later one before the autosave writes it. */
const AUTOSAVE_DELAY_MS = 1000;

let root: HTMLElement | undefined = $state();
let canvas: ReturnType<typeof Canvas> | undefined = $state();
let confirm: ReturnType<typeof ConfirmDialog> | undefined = $state();
let about: ReturnType<typeof AboutDialog> | undefined = $state();
let drawer: ReturnType<typeof InspectorDrawer> | undefined = $state();

// --- Messages ---------------------------------------------------------------

let messages: readonly Message[] = $state.raw([]);
let messageCount = 0;

/** Show a dismissible message; editing goes on. */
function say(text: string, problems: readonly Problem[] = []): void {
  messageCount += 1;
  messages = [...messages, { id: messageCount, text, problems }];
}

// --- The workspace ----------------------------------------------------------

const session = new WorkspaceSession({
  say,
  // Never take the focus from the host page: only the page asks for it, or
  // a viewer already working in the editor.
  replaced: () => {
    if (autofocus || within(root, document.activeElement)) canvas?.focus();
  },
  selected: (selection) => onselect?.(selection),
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
  if (refusal !== null) say("The workspace could not be opened.", refusal.problems);
}

// --- Files ------------------------------------------------------------------

/** Whether the open workspace may be replaced: it is saved, or the viewer discards it. */
async function mayReplace(): Promise<boolean> {
  if (!session.dirty) return true;
  const answer = await confirm?.ask(
    `${session.fileName} has unsaved changes. Discard them?`,
    "Discard",
    "Cancel",
    "second",
  );
  return answer === true;
}

async function newWorkspace(): Promise<void> {
  if (await mayReplace()) session.replace(emptyWorkspace(), UNTITLED, null, true);
}

async function openFromFile(): Promise<void> {
  if (!(await mayReplace())) return;
  try {
    const opened = await openFile(WORKSPACE_FILE);
    if (opened === null) return;
    const refusal = session.open(opened.text, opened.name, opened.handle);
    if (refusal !== null) {
      say(`${opened.name} is not a workspace file TimeLineEditor can open.`, refusal.problems);
    }
  } catch (error) {
    say(`The file could not be opened: ${messageOf(error)}`);
  }
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
      if (canvas !== undefined) void session.importManifest(canvas);
    },
  },
  {
    label: "Export manifest…",
    disabled: session.exportable === null,
    run: () => session.exportManifest(false),
  },
  {
    label: "Export minimal manifest…",
    disabled: session.exportable === null,
    run: () => session.exportManifest(true),
  },
]);

// --- The server and the autosave ---------------------------------------------

/** The server's health, kept for the About pane; `null` until it answers. */
let health: Health | null = $state.raw(null);
/** Why the health check failed, the offline mark's title and hidden text; empty while it has not failed. */
let offline = $state("");

async function checkHealth(options: ServerOptions): Promise<void> {
  try {
    health = await connect(options).health();
  } catch (error) {
    offline = `The server did not answer the health check (${messageOf(error)}).`;
  }
}

let autosaving: Autosaving | null = null;

onMount(() => {
  if (autofocus) canvas?.focus();
  if (storage !== null) {
    autosaving = startAutosave(session, {
      slot: storage.slot,
      delayMs: AUTOSAVE_DELAY_MS,
      say,
      ask: async (question, first, second, focused) =>
        (await confirm?.ask(question, first, second, focused)) ?? null,
    });
  }
  if (server !== null) void checkHealth(server);
  return () => {
    autosaving?.stop();
    session.dispose();
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
export function selection(): string[] {
  return [...session.selection];
}

/** Select `addresses`. */
export function select(addresses: readonly string[]): void {
  session.selection = new Set(addresses);
}

/** Move the focus to the canvas. */
export function focus(): void {
  canvas?.focus();
}

/** Write the pending autosave now and wait for it; at once without autosave. */
export function flush(): Promise<void> {
  return autosaving?.flush() ?? Promise.resolve();
}

/** Open `text`, throwing the reader's refusal: the test hook's and the fixture menu's load. */
function loadOrThrow(text: string): void {
  const refusal = load(text);
  if (refusal !== null) throw new WorkspaceRefusedError(refusal.problems);
}

const withTestHook = TEST_HOOK && untrack(() => testHook);

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
    bands: (block) => bandsOf(session.store.view, block),
    boxes: (block) => boxesOf(session.store.view, block),
  };
  $effect(() => installTestHook(hook));
}
</script>

<div class="editor" bind:this={root} {@attach listenKeys}>
  <header>
    {#if title}{@render title()}{:else}<span class="title">TimeLineEditor</span>{/if}
    <FileMenu label="File" items={fileItems} />
    <span class="file" data-testid="file-name">{session.dirty ? "• " : ""}{session.fileName}</span>
    <span class="server" aria-live="polite">
      {#if offline}<span class="offline" title={offline}
          >offline<span class="visually-hidden">: {offline}</span></span
        >{/if}
    </span>
    <span class="spacer"></span>
    {#if withTestHook}
      <FixtureMenu onload={loadOrThrow} />
    {/if}
    <button type="button" class="about-button" onclick={() => about?.open()}>About</button>
  </header>

  <main>
    <div class="arranger">
      <Canvas
        bind:this={canvas}
        live={session.live}
        metrics={fontMetrics}
        bind:selection={session.selection}
        bind:locked
        bind:mode
        bind:viewport
        onlive={(next) => (placement = next)}
      />
      <MessageArea
        {messages}
        ondismiss={(id) => (messages = messages.filter((message) => message.id !== id))}
      />
    </div>
    <InspectorDrawer
      bind:this={drawer}
      live={session.live}
      selection={session.selection}
      {placement}
      storageKey={storage?.inspectorKey ?? null}
    />
  </main>

  <ConfirmDialog bind:this={confirm} />
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

  /* A long name, or the unsaved marker, is cut rather than widening the editor on a phone. */
  .file {
    min-width: 0;
    overflow: hidden;
    font-size: 0.85rem;
    color: #3d3d3d;
    text-overflow: ellipsis;
    white-space: nowrap;
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
