<script lang="ts">
/**
 * The editor's own file dialog over the server's files (`GET folders`):
 * where the browser hands over no paths, the user opens and saves files by
 * their path from the server's root folder through it. `open` resolves the
 * path of the file chosen, `save` the path to write; `null` when the dialog
 * is dismissed (Cancel, Escape). A path is POSIX, `""` the root.
 *
 * The dialog shows where it is as a row of buttons from the root (the
 * breadcrumb), then the folder's contents as one list box: its folders,
 * then its files of the kinds asked for, in the order the server lists
 * them. The list takes the focus once: the arrow keys, Home and End move
 * the choice, Enter or a double-click opens a folder or takes a file,
 * Backspace goes up a folder. Saving offers a name field (a file chosen in
 * the list fills it) and asks before a file is replaced. It is the editor's
 * one dialog shell (`ModalDialog`) holding a form.
 */
import type { FolderEntry, FolderListing } from "@timetoalign/tilie-client";
import type { Attachment } from "svelte/attachments";
import ConfirmDialog from "./ConfirmDialog.svelte";
import type { FileKind } from "./files.ts";
import { isWorkspaceFile, WORKSPACE_FILE } from "./files.ts";
import ModalDialog from "./ModalDialog.svelte";
import { messageOf } from "./messages.svelte.ts";

interface Props {
  /** The server whose folders the dialog lists. */
  server: { listFolder(path: string): Promise<FolderListing> };
}

let { server }: Props = $props();

const id = $props.id();
let shell: ReturnType<typeof ModalDialog> | undefined = $state();
let confirm: ReturnType<typeof ConfirmDialog> | undefined = $state();
/** The list box, held by an attachment; not state. */
let list: HTMLElement | undefined;
const heldList: Attachment<HTMLElement> = (element) => {
  list = element;
  return () => {
    list = undefined;
  };
};

let saving = $state(false);
let kinds: readonly FileKind[] = $state.raw([]);
/** The folder shown, from the root. */
let folder = $state("");
/** Its entries as the server listed them; `null` while they are asked for. */
let entries = $state.raw<readonly FolderEntry[] | null>(null);
/** The entry chosen in the list, by its index among those shown; `null` for none. */
let chosen: number | null = $state(null);
/** The name field's text, when saving. */
let name = $state("");
/** Why the folder could not be listed or the name not taken; empty while there is no problem. */
let problem = $state("");
/** The listing asked for last: an answer to an earlier one is dropped. */
let asked = 0;
/** The path that answered the question shown. */
let answer: string | null = null;

/** The extensions of the kinds asked for, lower case. */
const extensions = $derived(
  kinds.flatMap((kind) => Object.values(kind.accept).flat()).map((item) => item.toLowerCase()),
);

/** Whether the file `entry` names is of a kind asked for (a workspace only where workspaces are). */
function offered(entry: FolderEntry): boolean {
  if (entry.kind === "folder") return true;
  const lower = entry.name.toLowerCase();
  if (isWorkspaceFile(lower) && !kinds.includes(WORKSPACE_FILE)) return false;
  return extensions.some((extension) => lower.endsWith(extension));
}

/** The entries shown: the folders, then the files of the kinds asked for. */
const shown = $derived((entries ?? []).filter(offered));

/** The folders from the root to the one shown: their names and paths. */
const crumbs = $derived(
  folder === ""
    ? []
    : folder.split("/").map((segment, index, all) => ({
        name: segment,
        path: all.slice(0, index + 1).join("/"),
      })),
);

const chosenEntry = $derived(chosen === null ? undefined : shown[chosen]);

/** The path of `entryName` in the folder shown. */
function inFolder(entryName: string): string {
  return folder === "" ? entryName : `${folder}/${entryName}`;
}

/** Show the folder `path`; one that is gone shows the root instead. */
async function go(path: string): Promise<void> {
  const ask = ++asked;
  folder = path;
  entries = null;
  chosen = null;
  problem = "";
  try {
    const listing = await server.listFolder(path);
    if (ask !== asked) return;
    entries = listing.entries;
  } catch (error) {
    if (ask !== asked) return;
    if (path !== "") {
      await go("");
      problem = `The folder ${path} could not be shown: ${messageOf(error)}`;
      return;
    }
    entries = [];
    problem = `The folder could not be shown: ${messageOf(error)}`;
  }
}

/** Open the dialog; resolves the path answered, `null` when dismissed. */
async function showDialog(start: string): Promise<string | null> {
  answer = null;
  void go(start);
  const answered = await shell?.show(null, () => list);
  return answered ? answer : null;
}

/** Let the user choose a file of one of `kinds`, starting in the folder `start`. */
export function open(asked: readonly FileKind[], start: string): Promise<string | null> {
  saving = false;
  kinds = asked;
  name = "";
  return showDialog(start);
}

/** Let the user choose where to save a file of `kind`, starting in `start`, named `suggested`. */
export function save(kind: FileKind, start: string, suggested: string): Promise<string | null> {
  saving = true;
  kinds = [kind];
  name = suggested;
  return showDialog(start);
}

function finish(path: string): void {
  answer = path;
  shell?.accept();
}

function choose(index: number): void {
  chosen = index;
  const entry = shown[index];
  if (saving && entry?.kind === "file") name = entry.name;
}

/** Open the folder of the entry at `index`, or take its file. */
function activate(index: number): void {
  const entry = shown[index];
  if (entry === undefined) return;
  if (entry.kind === "folder") void go(inFolder(entry.name));
  else if (saving) void take(entry.name);
  else finish(inFolder(entry.name));
}

/** The folder above the one shown. */
function up(): void {
  if (folder !== "") void go(crumbs.at(-2)?.path ?? "");
}

/** The index of the option a pointer event in the list fell on; `null` for none. */
function optionAt(event: MouseEvent): number | null {
  const option = event.target instanceof Element ? event.target.closest("[data-index]") : null;
  const index = Number(option?.getAttribute("data-index") ?? Number.NaN);
  return Number.isInteger(index) ? index : null;
}

/** The list's keys: the choice moves with the arrows, Home and End; Enter opens or takes it; Backspace goes up. */
function onlistkeydown(event: KeyboardEvent): void {
  const last = shown.length - 1;
  const at = chosen;
  let next: number | null = null;
  if (event.key === "ArrowDown") next = at === null ? 0 : Math.min(at + 1, last);
  else if (event.key === "ArrowUp") next = at === null ? last : Math.max(at - 1, 0);
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = last;
  else if (event.key === "Enter") {
    // Enter in the list opens or takes the entry; it never submits the form.
    event.preventDefault();
    if (at !== null) activate(at);
    return;
  } else if (event.key === "Backspace") {
    event.preventDefault();
    up();
    return;
  } else return;
  event.preventDefault();
  if (next >= 0 && last >= 0) {
    choose(next);
    document.getElementById(`${id}-entry-${next}`)?.scrollIntoView({ block: "nearest" });
  }
}

/**
 * Take `fileName` in the folder shown as where to save, its kind's
 * extension added where it lacks one, after asking whether a file there
 * is to be replaced; a folder of that name, or a name holding `/`, is
 * refused.
 */
async function take(fileName: string): Promise<void> {
  const trimmed = fileName.trim();
  if (trimmed === "") return;
  if (trimmed.includes("/")) {
    problem = "A file name holds no /.";
    return;
  }
  const [extension = ""] = extensions;
  const full = extensions.some((item) => trimmed.toLowerCase().endsWith(item))
    ? trimmed
    : `${trimmed}${extension}`;
  const existing = (entries ?? []).find((entry) => entry.name === full);
  if (existing?.kind === "folder") {
    problem = `${full} is a folder.`;
    return;
  }
  if (existing !== undefined) {
    const replace = await confirm?.ask(`Replace ${full}?`, ["Replace", "Cancel"], "Cancel");
    if (replace !== "Replace") return;
  }
  finish(inFolder(full));
}

function onsubmit(event: SubmitEvent): void {
  event.preventDefault();
  if (saving) void take(name);
  else if (chosenEntry !== undefined && chosen !== null) activate(chosen);
}
</script>

<ModalDialog bind:this={shell} labelledby="{id}-title" wide>
  <form {onsubmit}>
    <h2 id="{id}-title">{saving ? "Save as" : "Open"}</h2>
    <p class="hint" id="{id}-hint">
      {kinds.map((kind) => kind.description).join(", ")}: the files on the server.
    </p>
    <nav aria-label="Folder">
      <ol class="crumbs">
        <li>
          <button
            type="button"
            aria-current={crumbs.length === 0 ? "location" : undefined}
            onclick={() => go("")}>Root</button
          >
        </li>
        {#each crumbs as crumb, index (crumb.path)}
          <li>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              aria-current={index === crumbs.length - 1 ? "location" : undefined}
              onclick={() => go(crumb.path)}>{crumb.name}</button
            >
          </li>
        {/each}
      </ol>
    </nav>
    <ul
      class="entries"
      role="listbox"
      tabindex="0"
      aria-label={folder === "" ? "Contents of the root folder" : `Contents of ${folder}`}
      aria-describedby="{id}-hint"
      aria-busy={entries === null}
      aria-activedescendant={chosen === null ? undefined : `${id}-entry-${chosen}`}
      onkeydown={onlistkeydown}
      onclick={(event) => {
        const index = optionAt(event);
        if (index === null) return;
        choose(index);
        list?.focus();
      }}
      ondblclick={(event) => {
        const index = optionAt(event);
        if (index !== null) activate(index);
      }}
      {@attach heldList}
    >
      {#each shown as entry, index (entry.name)}
        <li
          id="{id}-entry-{index}"
          role="option"
          tabindex="-1"
          class={entry.kind}
          aria-selected={chosen === index}
          data-index={index}
        >
          {entry.kind === "folder" ? `${entry.name}/` : entry.name}
        </li>
      {:else}
        <li class="empty" role="presentation">{entries === null ? "Loading…" : "Nothing to show here."}</li>
      {/each}
    </ul>
    {#if saving}
      <label class="line">
        <span>File name</span>
        <input type="text" bind:value={name} oninput={() => (problem = "")} />
      </label>
    {/if}
    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
    <div class="answers">
      {#if saving}
        <button type="submit" disabled={name.trim() === ""}>Save</button>
      {:else}
        <button type="submit" disabled={chosenEntry === undefined}
          >{chosenEntry?.kind === "folder" ? "Open folder" : "Open"}</button
        >
      {/if}
      <button type="button" onclick={() => shell?.dismiss()}>Cancel</button>
    </div>
  </form>
</ModalDialog>

<ConfirmDialog bind:this={confirm} />

<style>
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }

  .hint {
    margin: 0 0 0.5rem;
    color: #595959;
  }

  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    margin: 0 0 0.5rem;
    padding: 0;
    list-style: none;
  }

  .crumbs li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .crumbs button {
    padding: 0.1rem 0.4rem;
  }

  .entries {
    height: 14rem;
    margin: 0 0 0.75rem;
    padding: 0;
    overflow: auto;
    list-style: none;
    border: 1px solid #d4d4d4;
    border-radius: 4px;
  }

  .entries:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  .entries li {
    padding: 0.2rem 0.5rem;
    cursor: default;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .entries .folder {
    font-weight: 600;
  }

  .entries [aria-selected="true"] {
    background: #dbeafe;
  }

  .entries .empty {
    color: #595959;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.75rem;
  }

  input {
    flex: 1;
    min-width: 0;
    font: inherit;
  }

  .problem {
    margin: 0 0 0.75rem;
    color: #b00020;
  }
</style>
