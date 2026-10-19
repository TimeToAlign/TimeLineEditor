<script lang="ts">
/**
 * The Properties tab for a selection in one block: the read-only rows of
 * one band, or the form of the selected containers' geometry, or the hint
 * that the selection has none. Typed text is the inspector's
 * `PropertyDrafts`; a commit or a step is one `set`.
 */
import type { Level, LivePlacement, PlaceProperty, Subject } from "@timetoalign/tilie-arranger";
import { drawingOf } from "@timetoalign/tilie-arranger";
import type { Block, Store, View } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timeskeleton";
import type { Attachment } from "svelte/attachments";
import type { Shown } from "./properties.ts";
import { bandRows, fieldLabel, geometryOf } from "./properties.ts";
import type { PropertyDrafts } from "./propertyDrafts.svelte.ts";

let {
  view,
  store,
  block,
  subjects,
  level,
  placement,
  drafts,
}: {
  view: View;
  store: Store;
  /** The block the whole selection lies in. */
  block: Block;
  /** The selection, resolved. */
  subjects: readonly Subject[];
  /** The level of the canvas: the arranger, or the innermost editor's kind. */
  level: Level;
  /** The placement a canvas gesture shows before release; the form shows it for its block. */
  placement: LivePlacement | null;
  drafts: PropertyDrafts;
} = $props();

const uid = $props.id();

/**
 * The gesture's placement while it shows the selected block, else `null`:
 * a gesture on another block changes nothing the form reads.
 */
const live = $derived(placement?.id === block.id ? placement : null);

/** What the canvas shows of the block: the gesture's placement and drawing, else the stored ones. */
const shown: Shown = $derived(
  live ?? { ...block, drawing: drawingOf(block, view.settings, fontMetrics) },
);

/** The geometry the form edits: containers of one role in the block; else `null`. */
const geometry = $derived(geometryOf(block, subjects, shown, level));

/** The read-only rows of the one band selected; else `null`. */
const band = $derived(bandRows(subjects, shown));

/** What the tab shows for a selection in one block without one role of geometry. */
const GEOMETRY_HINT = "Select a block, a frame or a card to edit its geometry.";

/**
 * The field a pointer is pressed on. An input while it is pressed, of a
 * kind spin buttons send (Chromium and WebKit no `inputType`, Firefox
 * `insertReplacementText`), comes from the field's spin buttons; typing
 * needs no press, and a paste or a drop with the pointer has a kind of its own.
 */
let pressed: EventTarget | null = null;

const SPIN_INPUTS: ReadonlySet<string> = new Set(["", "insertReplacementText"]);

/**
 * A wheel turn over the focused field steps it, as a stepping key does.
 * Listened to actively: Svelte's own wheel listeners are passive, and the
 * browser's own wheel stepping would start from the shown text.
 */
function wheelSteps(property: PlaceProperty): Attachment<HTMLInputElement> {
  return (input) => {
    const onwheel = (event: WheelEvent) => {
      if (geometry === null || document.activeElement !== input || event.deltaY === 0) return;
      event.preventDefault();
      drafts.step(geometry, property, event.deltaY < 0 ? 1 : -1, store);
    };
    input.addEventListener("wheel", onwheel, { passive: false });
    return () => input.removeEventListener("wheel", onwheel);
  };
}

function onInput(
  event: Event & { currentTarget: HTMLInputElement },
  property: PlaceProperty,
): void {
  if (geometry === null) return;
  const input = event.currentTarget;
  const kind = event instanceof InputEvent ? event.inputType : "";
  if (pressed === input && SPIN_INPUTS.has(kind)) {
    // The browser stepped from the shown text; the step is applied to the exact value instead.
    const direction = Math.sign(Number(input.value) - Number(drafts.value(geometry, property)));
    if (direction === 1 || direction === -1) {
      drafts.step(geometry, property, direction, store);
      input.value = drafts.value(geometry, property);
      return;
    }
  }
  drafts.type(geometry, property, input.value);
}

function onKey(event: KeyboardEvent, property: PlaceProperty): void {
  if (geometry === null) return;
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    drafts.step(geometry, property, event.key === "ArrowUp" ? 1 : -1, store);
  } else if (event.key === "Enter") {
    event.preventDefault();
    drafts.commit(geometry, property, store);
  } else if (event.key === "Escape") {
    drafts.discard(geometry, property);
  }
}
</script>

<svelte:window onpointerup={() => (pressed = null)} onpointercancel={() => (pressed = null)} />

{#if band !== null}
  <dl class="properties">
    {#each band as row (row.label)}
      <div>
        <dt>{row.label}</dt>
        <dd>{row.value}</dd>
      </div>
    {/each}
  </dl>
{:else if geometry === null}
  <p class="hint">{GEOMETRY_HINT}</p>
{:else}
  {@const edited = geometry}
  <form class="properties" aria-label={edited.label} onsubmit={(event) => event.preventDefault()}>
    {#each edited.fields as field (field.property)}
      {@const property = field.property}
      {@const problem = drafts.problem(edited, property)}
      <label>
        <span>{fieldLabel(edited.role, field)}</span>
        <input
          type="number"
          step="any"
          name={property}
          disabled={!field.offered}
          value={drafts.value(edited, property)}
          placeholder={drafts.placeholder(edited, property)}
          aria-invalid={problem !== undefined}
          aria-describedby={problem !== undefined ? `${uid}-problem-${property}` : undefined}
          onpointerdown={(event) => (pressed = event.currentTarget)}
          oninput={(event) => onInput(event, property)}
          {@attach wheelSteps(property)}
          onkeydown={(event) => onKey(event, property)}
          onblur={() => drafts.commit(edited, property, store)}
        />
      </label>
      {#if problem !== undefined}
        <p class="problem" id="{uid}-problem-{property}">{problem}</p>
      {/if}
    {/each}
  </form>
{/if}

<style>
  .hint {
    margin: 0;
    color: #595959;
  }

  .properties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem 0.5rem;
  }

  .properties label,
  .properties > div {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .properties span,
  .properties dt {
    color: #595959;
  }

  /* A band's rows, without the browser's margins of a description list. */
  dl.properties,
  .properties dd {
    margin: 0;
  }

  .properties input {
    min-width: 0;
    font: inherit;
  }

  .properties .problem {
    grid-column: 1 / -1;
    margin: 0;
    color: #b00020;
  }
</style>
