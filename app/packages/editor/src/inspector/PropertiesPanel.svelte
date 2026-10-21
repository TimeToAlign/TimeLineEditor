<script lang="ts">
/**
 * The Properties tab: first the name of what is inspected (with nothing
 * selected, the workspace's at the top level, the edited element's in an
 * editor), then, for a selection in one block, the read-only rows
 * of one band, or the form of the selected containers' geometry, or the
 * hint that the selection has none; the stored lock of the inspected
 * timelines stands right of the container size, read-only. Typed text is
 * the inspector's `PropertyDrafts`; a commit or a step is one `set`.
 */
import type {
  Editing,
  LivePlacement,
  PlaceField,
  PlaceProperty,
  Subject,
} from "@timetoalign/tilie-arranger";
import { drawingOf, liveStore } from "@timetoalign/tilie-arranger";
import type { Block, Store, View } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import type { Attachment } from "svelte/attachments";
import type { Geometry, NameField, Shown } from "./properties.ts";
import { bandRows, fieldLabel, geometryOf, isSize, lockOf, nameOf } from "./properties.ts";
import type { PropertyDrafts } from "./propertyDrafts.svelte.ts";

let {
  view,
  store,
  block,
  subjects,
  editing,
  placement,
  drafts,
}: {
  view: View;
  store: Store;
  /** The block the whole selection lies in; `null` for no selection or one in several blocks. */
  block: Block | null;
  /** The selection, resolved. */
  subjects: readonly Subject[];
  /** The innermost open editor, `null` on the arranger: the level and the frame the form edits in. */
  editing: Editing | null;
  /** The placement a canvas gesture shows before release; the form shows it for its block. */
  placement: LivePlacement | null;
  drafts: PropertyDrafts;
} = $props();

const uid = $props.id();

/** The store's editing path, followed as it changes. */
const live = $derived(liveStore(store));

/** The name field: the workspace's, the edited element's or the inspected thing's where it has a name; else `null`. */
const name = $derived(nameOf(view, subjects, live.editing.at(-1) ?? null));

/**
 * What the canvas shows of the block: the gesture's placement and drawing
 * while a gesture shows it, else the stored ones; `null` without a block.
 */
const shown: Shown | null = $derived.by(() => {
  if (block === null) return null;
  if (placement?.id === block.id) return placement;
  return { ...block, drawing: drawingOf(block, view.settings, fontMetrics) };
});

/** The geometry the form edits: containers of one role in the block; else `null`. */
const geometry = $derived(
  block === null || shown === null ? null : geometryOf(block, subjects, shown, editing),
);

/** The read-only rows of the one band selected; else `null`. */
const band = $derived(shown === null ? null : bandRows(subjects, shown));

/** The stored lock of the inspected timelines; `null` unless every subject is one. */
const lock = $derived(block === null ? null : lockOf(subjects));

/** The fields of the geometry before the size, and the size, which shares a row with Locked. */
const placeFields = $derived(geometry?.fields.filter((field) => !isSize(field.property)) ?? []);
const sizeFields = $derived(geometry?.fields.filter((field) => isSize(field.property)) ?? []);

/** What the Locked checkbox's tooltip says. */
const LOCK_TITLE = "Whether the timeline's length is fixed";

/** What the tab shows for a selection without one role of geometry. */
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

function onNameKey(event: KeyboardEvent, field: NameField): void {
  if (event.key === "Enter") {
    event.preventDefault();
    drafts.commitName(field, store);
  } else if (event.key === "Escape") {
    drafts.discardName(field);
  }
}

/** An indeterminate checkbox while the timelines' locks differ, a property no attribute sets. */
function indeterminate(mixed: boolean): Attachment<HTMLInputElement> {
  return (input) => {
    input.indeterminate = mixed;
  };
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

{#if name !== null}
  {@const field = name}
  {@const problem = drafts.nameProblem(field)}
  <label class="name">
    <span>Name</span>
    <input
      type="text"
      name="name"
      value={drafts.nameValue(field)}
      aria-invalid={problem !== undefined}
      aria-describedby={problem !== undefined ? `${uid}-problem-name` : undefined}
      oninput={(event) => drafts.typeName(field, event.currentTarget.value)}
      onkeydown={(event) => onNameKey(event, field)}
      onblur={() => drafts.commitName(field, store)}
    />
  </label>
  {#if problem !== undefined}
    <p class="problem" id="{uid}-problem-name">{problem}</p>
  {/if}
{/if}

{#snippet locked()}
  {#if lock !== null}
    <label class="locked" title={LOCK_TITLE}>
      <input
        type="checkbox"
        checked={lock.checked}
        disabled
        {@attach indeterminate(lock.mixed)}
      />
      Locked
    </label>
  {/if}
{/snippet}

{#snippet placeField(field: PlaceField, edited: Geometry)}
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
{/snippet}

{#if block === null}
  {#if subjects.length > 0}
    <p class="hint">{GEOMETRY_HINT}</p>
  {/if}
{:else if band !== null}
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
  {@render locked()}
{:else}
  {@const edited = geometry}
  <form class="properties" aria-label={edited.label} onsubmit={(event) => event.preventDefault()}>
    {#each placeFields as field (field.property)}
      {@render placeField(field, edited)}
    {/each}
    <div class="size">
      {#each sizeFields as field (field.property)}
        {@render placeField(field, edited)}
      {/each}
      {@render locked()}
    </div>
  </form>
  <p class="notice" role="status">{drafts.notice(edited) ?? ""}</p>
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

  .properties label:not(.locked),
  dl.properties > div {
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

  .properties .problem,
  .properties .size {
    grid-column: 1 / -1;
  }

  .problem {
    margin: 0;
    color: #b00020;
  }

  /* The container's width and height side by side, the Locked checkbox to their right. */
  .properties .size {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 0.25rem 0.5rem;
    align-items: end;
  }

  .size .problem {
    grid-column: 1 / -1;
  }

  .name {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .name span {
    color: #595959;
  }

  .name input {
    font: inherit;
  }

  /* Greyed out: the checkbox shows the stored value only. */
  .locked {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.25rem;
    color: #595959;
    cursor: not-allowed;
  }

  .notice {
    margin: 0;
    color: #595959;
  }

</style>
