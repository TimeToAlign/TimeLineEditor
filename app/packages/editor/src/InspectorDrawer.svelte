<script lang="ts">
/**
 * The inspector drawer at the canvas's right edge: the `«` tab opens it, its
 * `»` button closes it, and the choice is remembered under `storageKey`
 * when one is given. Beside its heading it names what is selected; below,
 * the inspector, rendered only while the drawer is open. What the inspector
 * holds between showings (unapplied text, drafts, the tab chosen) is kept
 * here, so closing the drawer loses none of it.
 */
import type { LivePlacement, LiveStore, Selection } from "@timetoalign/tilie-arranger";
import { tick, untrack } from "svelte";
import Inspector from "./inspector/Inspector.svelte";
import { ManifestText } from "./inspector/manifestText.svelte.ts";
import { PropertyDrafts } from "./inspector/propertyDrafts.svelte.ts";
import type { Picked } from "./inspector/tabs.ts";
import { initialPick } from "./inspector/tabs.ts";
import { inspectedSubject } from "./inspector/words.ts";

interface Props {
  live: LiveStore;
  selection: Selection;
  /** The placement a gesture on the canvas shows before release. */
  placement: LivePlacement | null;
  /** Where the open or closed state is remembered (`localStorage`); `null` remembers nothing. */
  storageKey: string | null;
}

let { live, selection, placement, storageKey }: Props = $props();

const id = $props.id();

/** The remembered state; closed when nothing is remembered or storage is unavailable. */
function remembered(key: string | null): boolean {
  if (key === null) return false;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

/** The viewer's own state, never written to the workspace; read from storage once, at mount. */
let open = $state(untrack(() => remembered(storageKey)));
let tab: HTMLButtonElement | undefined = $state();
let close: HTMLButtonElement | undefined = $state();
/** What the selection names, shown beside the heading. */
const subject = $derived(inspectedSubject(live.view, selection));

/** The inspector's state between showings: its typed text, its drafts and the tab chosen. */
const manifest = new ManifestText();
const drafts = new PropertyDrafts();
let picked: Picked = $state.raw(untrack(() => initialPick(live.editing.length, live.openings)));

/** Whether the drawer is open. */
export function isOpen(): boolean {
  return open;
}

/** Open or close the drawer and remember the choice; the focus stays where it is. */
export function setOpen(next: boolean): void {
  open = next;
  if (storageKey === null) return;
  try {
    localStorage.setItem(storageKey, String(next));
  } catch {
    // Without storage the choice holds until the editor goes.
  }
}

/** Open or close the drawer and move the focus to the control that undoes it. */
async function show(next: boolean): Promise<void> {
  setOpen(next);
  await tick();
  (next ? close : tab)?.focus();
}
</script>

{#if !open}
  <button
    type="button"
    class="tab"
    aria-expanded="false"
    aria-controls="{id}-drawer"
    aria-label="Open inspector"
    title="Open inspector"
    bind:this={tab}
    onclick={() => show(true)}>«</button
  >
{/if}
<aside
  id="{id}-drawer"
  class="inspector"
  data-testid="inspector"
  aria-labelledby="{id}-heading"
  aria-describedby={subject === null ? undefined : `${id}-subject`}
  hidden={!open}
>
  <div class="head">
    <div class="title">
      <h2 id="{id}-heading">Inspector</h2>
      {#if subject !== null}
        <p id="{id}-subject" class="subject" data-testid="inspector-subject">
          {#if subject.name !== null}
            {subject.words} {subject.name}
          {:else if subject.id !== null}
            {subject.words} <code>{subject.id}</code>
          {:else}
            {subject.words}
          {/if}
        </p>
      {/if}
    </div>
    <button
      type="button"
      aria-expanded={open}
      aria-controls="{id}-drawer"
      aria-label="Close inspector"
      title="Close inspector"
      bind:this={close}
      onclick={() => show(false)}>»</button
    >
  </div>
  {#if open}
    <Inspector {live} {selection} {placement} {manifest} {drafts} bind:picked />
  {/if}
</aside>

<style>
  button {
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }

  /* The closed drawer's tab, protruding from the canvas's right edge near the top. */
  .tab {
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

  .tab:hover,
  .head button:hover {
    background: #f4f4f4;
  }

  /* A share of the editor's width; the arranger takes the rest. */
  .inspector {
    flex: none;
    width: clamp(22rem, 32cqw, 40rem);
    max-width: 60cqw;
    border-left: 1px solid #d0d0d0;
    background: #fff;
    overflow: auto;
  }

  .inspector[hidden] {
    display: none;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem 0.25rem 0.75rem;
  }

  /* The heading, and beside it what is being inspected. */
  .title {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
  }

  h2 {
    flex: none;
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #595959;
  }

  .subject {
    margin: 0;
    overflow: hidden;
    font-size: 0.8rem;
    color: #1a1a1a;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .subject code {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
  }

  .head button {
    padding: 0.2rem 0.45rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
  }
</style>
