<script lang="ts">
/**
 * The Properties tab: first the name of what is inspected (with nothing
 * selected, the workspace's at the top level, the edited element's in an
 * editor), and the Edit button opening the editor a double-click on the
 * one selected address opens (`EditButton`). Then, for a selection in one block, the read-only rows of
 * one band, or the form of the selected containers' geometry, or the hint
 * that the selection has none; the stored lock of the inspected timelines
 * stands right of the container size, read-only. Typed text is the
 * inspector's `PropertyDrafts`; a commit or a step is one `set`. Below, the
 * group memberships of the selected timelines or group, and the New group
 * button (`groups.ts`), each click one command. One selected flow-control
 * element shows, below its name, its read-only rows, its display controls,
 * a jump's destinations and its provenance with the user's belief
 * (`FlowControlDetails`); the jump stays inspected while a destination's
 * marks are selected with it. A selected band shows its display controls
 * below its rows, and a region its start, end and length. A selected chunk
 * of a virtual or switched card (by its label, leader or boundary) shows its
 * facts: its entry of the FlowMap, its source, where it is written and
 * played, its occurrence (`chunkRows`); it has no display switch of its
 * own, the sources being turned on per band in its virtual timeline's band
 * list ("From the sources"). Every display
 * control is declared once (`display.ts`): one that changes nothing drawn
 * now is disabled with its reason. A selected timeline, every timeline
 * alike (a root, a child, a virtual timeline; its card, its line, or one
 * of its bands alone), lists its bands with a Visible checkbox each
 * (`BandList`). A selected bundle lists its cards (`TimelineList`), a
 * virtual timeline's with a Visible checkbox, so a hidden card can be shown
 * again. One selected virtual timeline, or its card, offers "Delete
 * virtual timeline", which removes it (Delete on the canvas only hides its
 * card); where other virtual timelines are made from it, the editor's
 * deletion dialog asks first (`askDeletion`), as Delete on the canvas does.
 */
import type {
  Editing,
  LivePlacement,
  PlaceField,
  PlaceProperty,
  Subject,
} from "@timetoalign/tilie-arranger";
import { deleteQuestion, liveStore } from "@timetoalign/tilie-arranger";
import type {
  AddCommand,
  Address,
  Block,
  RemoveCommand,
  SetCommand,
  Store,
  View,
} from "@timetoalign/tilie-core";
import { sameAddress } from "@timetoalign/tilie-core";
import type { Attachment } from "svelte/attachments";
import { askOf, hasAsk } from "../ConfirmDialog.svelte";
import { postOf } from "../messages.svelte.ts";
import { paneOf } from "../pane.ts";
import BandList from "./BandList.svelte";
import DisplayGroups from "./DisplayGroups.svelte";
import { bandControls, bandList } from "./display.ts";
import EditButton from "./EditButton.svelte";
import FlowControlDetails from "./FlowControlDetails.svelte";
import { flowOf } from "./flow.ts";
import { groupsOf, membersOf, newGroupOf } from "./groups.ts";
import { indeterminate } from "./indeterminate.ts";
import type { Geometry, NameField, Shown } from "./properties.ts";
import {
  askDeletion,
  bandRows,
  chunkRows,
  fieldLabel,
  geometryOf,
  isSize,
  lockOf,
  nameOf,
  regionRows,
  shownOf,
  virtualDeletionOf,
} from "./properties.ts";
import type { PropertyDrafts } from "./propertyDrafts.svelte.ts";
import TimelineList from "./TimelineList.svelte";
import { timelineList } from "./timelineList.ts";

let {
  view,
  store,
  block,
  subjects,
  editing,
  placement,
  drafts,
  onselect = () => {},
  opens = true,
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
  /** Select `addresses` on the canvas: the marks of a jump's destination, what an editor opened by Edit shows chosen. */
  onselect?: (addresses: readonly Address[]) => void;
  /** Whether the canvas opens editors (its rules' `open`): the Edit button is shown only then. */
  opens?: boolean;
} = $props();

const uid = $props.id();
/** Posts what a commit wrote other than what was typed (a size below its minimum) to the message bar. */
const post = postOf();
/** The canvas's pane, which every drawing read here is drawn at. */
const pane = paneOf();

/** Post `notice`, if there is one. */
function notify(notice: string | null): void {
  if (notice !== null) post("info", notice);
}

/** The store's editing path, followed as it changes. */
const live = $derived(liveStore(store));

/** The one flow-control element selected, itself or by its label, with its destinations' marks; else `null`. */
const flow = $derived(flowOf(subjects));

/** What the tab inspects: the flow-control element alone where one is selected with its marks, else the selection. */
const inspected = $derived(flow === null ? subjects : [flow.subject]);

/** The name field: the workspace's, the edited element's or the inspected thing's where it has a name; else `null`. */
const name = $derived(nameOf(view, inspected, live.editing.at(-1) ?? null));

/**
 * What the canvas shows of the block: the gesture's placement and drawing
 * while a gesture shows it, else the stored ones; `null` without a block.
 */
const shown: Shown | null = $derived(block === null ? null : shownOf(view, block, placement, pane));

/** The geometry the form edits: containers of one role in the block; else `null`. */
const geometry = $derived(
  block === null || shown === null ? null : geometryOf(block, inspected, shown, editing, pane),
);

/** The read-only rows of the one band selected; else `null`. */
const band = $derived(shown === null ? null : bandRows(inspected, shown));

/** The display controls of the one band selected; else `null`. */
const controls = $derived(band === null ? null : bandControls(view, inspected));

/** The bands of the selected timeline, each with its Visible checkbox; else `null`. */
const bands = $derived(block === null ? null : bandList(view, inspected, pane));

/** The cards of the selected bundle, a virtual timeline's with its Visible checkbox; else `null`. */
const timelines = $derived(block === null ? null : timelineList(view, inspected));

/** The start, end and length of the one region selected; else `null`. */
const region = $derived(regionRows(inspected));

/** The facts of the one chunk selected; else `null`. */
const chunk = $derived(chunkRows(view, inspected));

/** The stored lock of the inspected timelines; `null` unless every subject is one. */
const lock = $derived(block === null ? null : lockOf(inspected));

/**
 * The memberships offered: the selected timelines' groups, or the selected
 * group's members; else `null`. Their refusals are read with a copy of the
 * store's minter, so a message names the IDs the dispatch would store.
 */
const memberships = $derived(
  block === null
    ? null
    : (groupsOf(view, inspected, editing, store.minter()) ??
        membersOf(view, inspected, editing, store.minter())),
);

/** The New group button's command, for selected timelines or the selected block; else `null`. */
const newGroup = $derived(
  block === null ? null : newGroupOf(view, inspected, editing, store.minter()),
);

/** The `remove` deleting the one selected virtual timeline; else `null`. */
const virtualDeletion = $derived(virtualDeletionOf(subjects));

/** The editor's deletion dialog; a panel mounted alone (in tests) has none and deletes all where core admits it. */
const ask = hasAsk() ? askOf() : null;

/**
 * Delete the selected virtual timeline, asking first where other virtual
 * timelines are made from it (`deleteQuestion`), posting the store's refusal.
 */
async function deleteVirtual(command: RemoveCommand): Promise<void> {
  const question = deleteQuestion(view, command);
  const chosen =
    question === null ? command : ask === null ? question.remove : await askDeletion(ask, question);
  if (chosen === null) return;
  const refusal = store.dispatch(chosen);
  if (refusal !== null) post("info", refusal.message);
}

/** A refusal of the store, and the selection it was refused for. */
interface MembershipRefusal {
  readonly selected: readonly Address[];
  readonly message: string;
}

/** The store's refusal of the last membership command: shown until the next command or another selection. */
let refusal = $state<MembershipRefusal | null>(null);
const membershipProblem = $derived.by(() => {
  if (refusal === null || refusal.selected.length !== subjects.length) return null;
  const { selected, message } = refusal;
  return subjects.every((subject, index) => sameAddress(subject.address, selected[index] ?? {}))
    ? message
    : null;
});

/** Dispatch a membership command, keeping the store's refusal to show below them. */
function dispatchMembership(command: SetCommand | AddCommand): void {
  const message = store.dispatch(command)?.message;
  const selected = subjects.map((subject) => subject.address);
  refusal = message === undefined ? null : { selected, message };
}

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
      notify(drafts.step(geometry, property, event.deltaY < 0 ? 1 : -1, store));
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
      notify(drafts.step(geometry, property, direction, store));
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

function onKey(event: KeyboardEvent, property: PlaceProperty): void {
  if (geometry === null) return;
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    notify(drafts.step(geometry, property, event.key === "ArrowUp" ? 1 : -1, store));
  } else if (event.key === "Enter") {
    event.preventDefault();
    notify(drafts.commit(geometry, property, store));
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
<EditButton {view} {store} {subjects} {editing} {opens} {onselect} />

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

{#snippet rows(values: readonly { readonly label: string; readonly value: string }[], testid: string)}
  <dl class="properties" data-testid={testid}>
    {#each values as row (row.label)}
      <div>
        <dt>{row.label}</dt>
        <dd>{row.value}</dd>
      </div>
    {/each}
  </dl>
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
      onblur={() => notify(drafts.commit(edited, property, store))}
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
  {@render rows(band, "band-rows")}
  <DisplayGroups {view} {store} {block} groups={controls ?? []} />
{:else if region !== null}
  {@render rows(region, "region-rows")}
{:else if chunk !== null}
  {@render rows(chunk, "chunk-rows")}
{:else if flow !== null}
  <FlowControlDetails
    {view}
    {store}
    {flow}
    selected={subjects.map((subject) => subject.address)}
    {onselect}
  />
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
{/if}

{#if block !== null && bands !== null}
  <BandList {view} {store} {block} rows={bands} />
{/if}
{#if timelines !== null}
  <TimelineList {store} rows={timelines} />
{/if}

{#if memberships !== null}
  <fieldset class="memberships">
    <legend>{memberships.legend}</legend>
    {#each memberships.rows as row (row.id)}
      <label
        class={{ refused: row.refusal !== null }}
        title={row.refusal ?? undefined}
        style:padding-inline-start="{row.depth * 1.25}rem"
      >
        <input
          type="checkbox"
          name="{memberships.legend.toLowerCase()}"
          value={row.id}
          checked={row.checked}
          disabled={row.refusal !== null}
          {@attach indeterminate(row.mixed)}
          onchange={(event) => {
            // The box shows the stored membership until the store has taken the command.
            event.currentTarget.checked = row.checked;
            dispatchMembership(row.command);
          }}
        />
        {row.label}
      </label>
    {/each}
  </fieldset>
{/if}
{#if newGroup !== null}
  {@const add = newGroup}
  <button
    type="button"
    class="new-group"
    disabled={add.refusal !== null}
    title={add.refusal ?? undefined}
    onclick={() => dispatchMembership(add.command)}>New group</button
  >
{/if}
{#if memberships !== null || newGroup !== null}
  <p class="problem" role="status">{membershipProblem ?? ""}</p>
{/if}
{#if virtualDeletion !== null}
  {@const remove = virtualDeletion}
  <button type="button" class="delete-virtual" onclick={() => void deleteVirtual(remove)}
    >Delete virtual timeline</button
  >
{/if}

<style>
  .hint {
    margin: 0;
    color: #595959;
  }

  /*
   * Two columns that share the panel's width whatever the fields' own width:
   * `minmax(0, 1fr)`, since a bare `1fr` never shrinks a column below its
   * number field's intrinsic width, which differs between browsers and
   * would make the panel scroll sideways at the drawer's least width.
   */
  .properties {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
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

  .memberships {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin: 0.5rem 0 0;
    padding: 0.25rem 0.5rem 0.5rem;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
  }

  .memberships legend {
    color: #595959;
  }

  .memberships label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  /* A membership core refuses: offered, greyed, its reason in the tooltip. */
  .memberships label.refused {
    color: #595959;
    cursor: not-allowed;
  }

  .new-group,
  .delete-virtual {
    display: block;
    margin-top: 0.5rem;
    font: inherit;
  }

</style>
