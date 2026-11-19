<script lang="ts">
/**
 * The Metadata tab: the statements of the shown element (`shownOf`: the
 * selected bundle, timeline or region, the edited element in an editor, the
 * one bundle at the top level) as rectangles, one verb about one thing
 * each, "is a" first; "＋ Add statement" and the composer; the drawers of
 * what is stated around it, proposed and rejected. Each action is one
 * `set` of the statements and provenance it changes, built on the
 * manifest's statement skeleton by TimeToShare's functions; their throws
 * and the store's refusals are posted to the message bar as warnings. The
 * user who states comes from the editor's user; lookups from its lookup.
 */
import type { Editing, Subject } from "@timetoalign/tilie-arranger";
import type { PathSegment, Skeleton, Store, View } from "@timetoalign/tilie-core";
import { isJsonObject, samePair } from "@timetoalign/timetoshare";
import { tick } from "svelte";
import type { Attachment } from "svelte/attachments";
import { lookupOf } from "../lookup/index.ts";
import { informOf, warnOf } from "../messages.svelte.ts";
import { userOf } from "../user.svelte.ts";
import Composer from "./metadata/Composer.svelte";
import { CATALOGUE } from "./metadata/catalogue.ts";
import { ComposerState } from "./metadata/composer.svelte.ts";
import Drawers from "./metadata/Drawers.svelte";
import type { EntryFields } from "./metadata/edits.ts";
import {
  added,
  commandOf,
  confirmed,
  dayOf,
  rejected,
  rejectedRectangle,
  removedRectangle,
} from "./metadata/edits.ts";
import type { DrawerRow, Frame, Pair, RectangleView } from "./metadata/frame.ts";
import { drawersOf, entryPair, rectanglesOf, rectangleWords, shownOf } from "./metadata/frame.ts";
import Rectangle from "./metadata/Rectangle.svelte";
import { provideThumbnails, Thumbnails } from "./metadata/thumbnails.svelte.ts";

let {
  view,
  store,
  subjects,
  editing,
}: {
  view: View;
  store: Store;
  /** The selection, resolved. */
  subjects: readonly Subject[];
  /** The innermost open editor; `null` at the top level. */
  editing: Editing | null;
} = $props();

const ADD_BUTTON = '[data-testid="metadata-add-statement"]';
const REJECTED_SUMMARY = '[data-testid="metadata-drawer-rejected"] summary';

const inform = informOf();
const warn = warnOf();
const user = userOf();
provideThumbnails(new Thumbnails(lookupOf()));

const composer = new ComposerState();

const shown = $derived(shownOf(view, subjects, editing));
const frame = $derived(shown.kind === "none" ? null : shown);
const rectangles = $derived(frame === null ? [] : rectanglesOf(frame, CATALOGUE, user.state.user));
const drawers = $derived(
  frame === null ? null : drawersOf(view, frame, CATALOGUE, user.state.user),
);
/** The user line: who states what is added here. */
const userLine = $derived(
  user.state.orcid === null
    ? `You state as ${user.state.name}.`
    : `You state as ${user.state.name} (ORCID iD ${user.state.orcid}).`,
);

/** The panel's element, where focus moves after an action; held by an attachment, not state. */
let root: HTMLElement | undefined;
const held: Attachment<HTMLElement> = (element) => {
  root = element;
  return () => {
    root = undefined;
  };
};
/** The selector of the button that opened the composer, which Cancel gives the focus back to. */
let opener: string = ADD_BUTTON;

/** The element in the panel `selector` names, once the DOM has followed the store. */
async function focusAfter(selector: () => string | null): Promise<void> {
  await tick();
  const found = selector();
  const element = found === null ? null : root?.querySelector<HTMLElement>(found);
  element?.focus();
}

/** The selector of the rectangle keyed `key`. */
function rectangleSelector(key: string): string {
  return `[data-testid="metadata-rectangle"][data-key="${CSS.escape(key)}"]`;
}

/**
 * Dispatch the change from `frame`'s skeleton to the one `change` builds;
 * a throw of the statement functions and a refusal are posted. Whether the
 * store took it.
 */
function edit(at: Frame, change: () => Skeleton): boolean {
  let after: Skeleton;
  try {
    after = change();
  } catch (error) {
    warn(
      `The statement could not be changed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
  const command = commandOf(at, after);
  if (command === null) return false;
  const refusal = store.dispatch(command);
  if (refusal === null) return true;
  warn(refusal.message);
  return false;
}

/** The key of the rectangle now holding `pair` in the shown element, once the store has it. */
function holderOf(pair: Pair): string | null {
  if (frame === null) return null;
  const context = frame.skeleton["@context"];
  return (
    rectanglesOf(frame, CATALOGUE, user.state.user).find((rectangle) =>
      rectangle.pairs.some((stated) => samePair(context, stated, pair)),
    )?.key ?? null
  );
}

/** The rectangle after `key`, else the one before, else the Add button. */
function neighbourOf(key: string): string {
  const index = rectangles.findIndex((rectangle) => rectangle.key === key);
  const next = rectangles[index + 1] ?? rectangles[index - 1];
  return next === undefined || index < 0 ? ADD_BUTTON : rectangleSelector(next.key);
}

function remove(at: Frame, rectangle: RectangleView): void {
  const after = neighbourOf(rectangle.key);
  if (edit(at, () => removedRectangle(at, rectangle))) void focusAfter(() => after);
}

/** Reject a rectangle's pairs; the focus moves to the next rectangle, else to the Rejected drawer. */
function reject(at: Frame, rectangle: RectangleView): void {
  const index = rectangles.findIndex((item) => item.key === rectangle.key);
  const next = index < 0 ? undefined : rectangles[index + 1];
  const after = next === undefined ? REJECTED_SUMMARY : rectangleSelector(next.key);
  if (edit(at, () => rejectedRectangle(at, rectangle, user.state.user, dayOf(new Date())))) {
    inform(`Rejected “${rectangleWords(rectangle)}”: it is listed under Rejected.`);
    void focusAfter(() => after);
  }
}

/** Open the composer: to add a statement, to state "is a", or to state a rectangle in another vocabulary. */
function openComposer(at: Frame, rectangle?: RectangleView): void {
  if (rectangle === undefined) {
    opener = ADD_BUTTON;
    composer.open(at.key);
  } else if (rectangle.pairs.length === 0) {
    opener = `${rectangleSelector(rectangle.key)} [data-testid="metadata-state"]`;
    composer.open(at.key, { verb: { id: "is_a", inverse: false, label: rectangle.heading } });
  } else {
    opener = `${rectangleSelector(rectangle.key)} [data-testid="metadata-add-vocabulary"]`;
    composer.open(at.key, {
      verb: { id: rectangle.verb ?? "", inverse: rectangle.inverse, label: rectangle.heading },
      mode: "vocabulary",
      rectangle: rectangle.key,
    });
  }
}

function cancel(): void {
  composer.close();
  const back = opener;
  void focusAfter(() => (root?.querySelector(back) === null ? ADD_BUTTON : back));
}

function add(at: Frame, pairs: readonly Pair[], fields: EntryFields): void {
  if (!edit(at, () => added(at, pairs, fields))) return;
  composer.close();
  const [first] = pairs;
  if (first !== undefined) {
    void focusAfter(() => {
      const key = holderOf(first);
      return key === null ? null : rectangleSelector(key);
    });
  }
}

/** The next row of a drawer after `row`, else its summary. */
function afterRow(row: DrawerRow, list: readonly DrawerRow[], drawer: string): () => string {
  const index = list.findIndex((candidate) => candidate.key === row.key);
  const next = list[index + 1] ?? list[index - 1];
  return () =>
    next === undefined
      ? `[data-testid="${drawer}"] summary`
      : `[data-key="${CSS.escape(next.key)}"] button`;
}

/** The pair stated of the shown element that `subject` lies in: `own` itself, or the pair holding the value node. */
function topPair(at: Frame, subject: readonly PathSegment[], own: Pair): Pair | null {
  if (subject.length === at.path.length) return own;
  const [, key, index] = subject.slice(at.path.length);
  const values = valuesAt(at, key);
  const value = Array.isArray(values) && typeof index === "number" ? values[index] : undefined;
  return typeof key === "string" && value !== undefined ? [key, value] : null;
}

/** The values the shown element states for `key`. */
function valuesAt(at: Frame, key: PathSegment | undefined): unknown {
  let value: unknown = at.skeleton;
  for (const step of at.path) {
    if (Array.isArray(value) && typeof step === "number") value = value[step];
    else if (isJsonObject(value) && typeof step === "string") value = value[step];
  }
  const statements = isJsonObject(value) ? value.statements : undefined;
  return isJsonObject(statements) && typeof key === "string" ? statements[key] : undefined;
}

function confirm(at: Frame, row: DrawerRow): void {
  const pair = topPair(at, row.subject, entryPair(at.skeleton["@context"], { ...row.entry }));
  const proposed = drawers?.proposed.includes(row) ?? false;
  const fallback = afterRow(
    row,
    (proposed ? drawers?.proposed : drawers?.rejected) ?? [],
    proposed ? "metadata-drawer-proposed" : "metadata-drawer-rejected",
  );
  if (!edit(at, () => confirmed(at, row, user.state.user, dayOf(new Date())))) return;
  void focusAfter(() => {
    const key = pair === null ? null : holderOf(pair);
    return key === null ? fallback() : rectangleSelector(key);
  });
}

function rejectRow(at: Frame, row: DrawerRow): void {
  const after = afterRow(row, drawers?.proposed ?? [], "metadata-drawer-proposed");
  if (edit(at, () => rejected(at, row, user.state.user, dayOf(new Date())))) {
    void focusAfter(after);
  }
}
</script>

<div class="metadata" {@attach held}>
  {#if frame === null}
    <p class="hint">{shown.kind === "none" ? shown.hint : ""}</p>
  {:else}
    <p class="subject">This {frame.words}.</p>
    <p class="user" data-testid="metadata-user">
      {userLine}
      <button type="button" onclick={() => void user.ask()}>Change…</button>
    </p>
    <ol aria-label="Statements">
      {#each rectangles as rectangle (rectangle.key)}
        <li>
          <Rectangle
            {rectangle}
            {frame}
            onremove={() => remove(frame, rectangle)}
            onreject={() => reject(frame, rectangle)}
            onvocabulary={() => openComposer(frame, rectangle)}
            onstate={() => openComposer(frame, rectangle)}
          />
        </li>
      {/each}
    </ol>
    <p>
      <button
        type="button"
        data-testid="metadata-add-statement"
        onclick={() => openComposer(frame)}>＋ Add statement</button
      >
    </p>
    {#if composer.isOpenOn(frame.key)}
      <Composer
        {frame}
        state={composer}
        {rectangles}
        onadd={(pairs, fields) => add(frame, pairs, fields)}
        oncancel={cancel}
      />
    {/if}
    {#if drawers !== null}
      <Drawers
        {drawers}
        onconfirm={(row) => confirm(frame, row)}
        onreject={(row) => rejectRow(frame, row)}
      />
    {/if}
  {/if}
</div>

<style>
  .metadata {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  p {
    margin: 0;
  }

  .hint,
  .user {
    color: #595959;
  }

  .user {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.8rem;
  }

  ol {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  button {
    padding: 0.15rem 0.5rem;
    border: 1px solid #bdbdbd;
    border-radius: 3px;
    background: #fafafa;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  button:hover {
    background: #f0f0f0;
  }

  button:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
