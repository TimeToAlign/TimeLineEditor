<script lang="ts">
/**
 * The Metadata tab: the statements of the shown element (`shownOf`: the
 * selected bundle, timeline or region, the edited element in an editor, the
 * one bundle at the top level) as tiles, one verb about one thing each, "is
 * a" first, saying in a sentence what the element is; "＋ Add statement"
 * and the composer; the candidates offered to the user and those the user
 * believes false. Each action is one `set` of the statements and
 * provenance it changes, built on the manifest's statement skeleton by
 * TimeToShare's functions; their throws are posted to the message bar as
 * errors, the store's refusals as warnings. The user who states and believes (the
 * actor, an IRI) comes from the editor's user; the choices from its type
 * profiles' catalogue; lookups from its lookup, which also proposes matches
 * for the names stated without an identifier of the element and every
 * element below it.
 */
import type { Editing, Subject } from "@timetoalign/tilie-arranger";
import type { Skeleton, Store, View } from "@timetoalign/tilie-core";
import { addressWords } from "@timetoalign/tilie-core";
import type { Belief } from "@timetoalign/timetoshare";
import { samePair } from "@timetoalign/timetoshare";
import { onDestroy, tick } from "svelte";
import type { Attachment } from "svelte/attachments";
import { lookupOf } from "../lookup/index.ts";
import { postOf } from "../messages.svelte.ts";
import { profilesOf } from "../profiles/profiles.svelte.ts";
import { userOf } from "../user.svelte.ts";
import Candidates from "./metadata/Candidates.svelte";
import Composer from "./metadata/Composer.svelte";
import { systemChoice } from "./metadata/catalogue.ts";
import { ComposerState } from "./metadata/composer.svelte.ts";
import type { EntryFields } from "./metadata/edits.ts";
import { added, believed, commandOf, dayOf, removed, stated } from "./metadata/edits.ts";
import type { CandidateRow, Frame, Pair, RectangleView } from "./metadata/frame.ts";
import {
  candidatesOf,
  framePrefixes,
  rectanglesOf,
  shownOf,
  typeSentence,
} from "./metadata/frame.ts";
import type { Placed } from "./metadata/proposals.ts";
import {
  answersTo,
  frameIn,
  proposed,
  proposedText,
  questionsOf,
  statedForName,
  unreconciledOf,
} from "./metadata/proposals.ts";
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

const post = postOf();
const user = userOf();
const lookup = lookupOf();
const profiles = profilesOf();
/** The catalogue the editor's type profiles offer. */
const catalogue = $derived(profiles.catalogue);
provideThumbnails(new Thumbnails(lookup));

const composer = new ComposerState();

const shown = $derived(shownOf(view, subjects, editing));
const frame = $derived(shown.kind === "none" ? null : shown);
const rectangles = $derived(frame === null ? [] : rectanglesOf(frame, catalogue, user.state.user));
/** What the first tile says: the element is a … */
const sentence = $derived(
  frame === null || rectangles[0] === undefined
    ? null
    : typeSentence(frame, catalogue, rectangles[0]),
);
const candidates = $derived(
  frame === null ? null : candidatesOf(frame, catalogue, user.state.user),
);
/** The names below the shown element stated without an identifier that the lookup can look up. */
const unreconciled = $derived(frame === null ? [] : unreconciledOf(frame, catalogue, lookup));
/**
 * The key of the element whose names' matches are being looked up; `null`
 * while none are. The lookup belongs to the panel, so another element shown
 * meanwhile is not shown as looking them up.
 */
let proposingFor: string | null = $state(null);
/** Ends the lookups of the proposals when the panel goes. */
const proposals = new AbortController();
onDestroy(() => proposals.abort());
/** The user line: who states and believes what is done here. */
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
    post(
      "error",
      `The statement could not be changed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
  const command = commandOf(at, after);
  if (command === null) return false;
  const refusal = store.dispatch(command);
  if (refusal === null) return true;
  post("info", refusal.message);
  return false;
}

/** The key of the rectangle now holding `pair` in the shown element, once the store has it. */
function holderOf(pair: Pair): string | null {
  if (frame === null) return null;
  const context = frame.skeleton["@context"];
  return (
    rectanglesOf(frame, catalogue, user.state.user).find((rectangle) =>
      rectangle.pairs.some((held) => samePair(context, held, pair)),
    )?.key ?? null
  );
}

/** The rectangle after `key`, else the one before, else the Add button. */
function neighbourOf(key: string): string {
  const index = rectangles.findIndex((rectangle) => rectangle.key === key);
  const next = rectangles[index + 1] ?? rectangles[index - 1];
  return next === undefined || index < 0 ? ADD_BUTTON : rectangleSelector(next.key);
}

/**
 * Remove a stated pair; the focus moves to the tile still holding the
 * rectangle's other pairs, else to the next tile, else to the Add button.
 */
function remove(at: Frame, rectangle: RectangleView, pair: Pair): void {
  const context = at.skeleton["@context"];
  const other = rectangle.pairs.find((held) => !samePair(context, held, pair));
  const after = neighbourOf(rectangle.key);
  if (!edit(at, () => removed(at, pair))) return;
  void focusAfter(() => {
    const key = other === undefined ? null : holderOf(other);
    return key === null ? after : rectangleSelector(key);
  });
}

/** Record the user's belief in a stated pair; the pair stays stated whatever the belief. */
function believe(at: Frame, pair: Pair, belief: Belief): void {
  edit(at, () => believed(at, at.path, pair, user.state.statedBy, belief, dayOf(new Date())));
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

/** The Details button of the row after `row` in `list`, else of the one before, else the list's summary. */
function afterRow(row: CandidateRow, list: readonly CandidateRow[], testid: string): () => string {
  const index = list.findIndex((item) => item.key === row.key);
  const next = list[index + 1] ?? list[index - 1];
  return () =>
    next === undefined
      ? `[data-testid="${testid}"] summary`
      : `[data-key="${CSS.escape(next.key)}"] button`;
}

/**
 * Record the user's belief in a candidate. True states it (in place of
 * the one name it was found for, where it is such a candidate) and gives
 * the focus to the tile holding it; false sets it apart, unlikely keeps it
 * offered, the focus moving on in the list it leaves.
 */
function believeCandidate(at: Frame, row: CandidateRow, belief: Belief): void {
  if (candidates === null) return;
  const offered = candidates.offered.includes(row);
  const fallback = afterRow(
    row,
    offered ? candidates.offered : candidates.dismissed,
    offered ? "metadata-candidates" : "metadata-dismissed",
  );
  const actor = user.state.statedBy;
  const day = dayOf(new Date());
  if (belief === "true") {
    const change = () => statedForName(at, row, actor, day) ?? stated(at, row, actor, day);
    if (!edit(at, change)) return;
    void focusAfter(() => {
      const key = row.subject.length === at.path.length ? holderOf(row.pair) : null;
      return key === null ? fallback() : rectangleSelector(key);
    });
    return;
  }
  const leaves = offered === (belief === "false");
  if (edit(at, () => believed(at, row.subject, row.pair, actor, belief, day)) && leaves) {
    void focusAfter(fallback);
  }
}

/**
 * Propose matches for the names below `at` stated without an identifier:
 * each looked up once per system, the answers written as TiLiE's candidates
 * in one `set` on the element as it stands when they arrive; a system that
 * cannot be searched is named.
 */
async function propose(at: Frame): Promise<void> {
  if (proposingFor !== null) return;
  proposingFor = at.key;
  const found = unreconciledOf(at, catalogue, lookup);
  const { answers, failures } = await answersTo(lookup, questionsOf(found), proposals.signal);
  proposingFor = null;
  if (proposals.signal.aborted) return;
  for (const { system, message } of failures) {
    post("info", `${systemChoice(catalogue, system).label} could not be searched: ${message}`);
  }
  const now = frameIn(store.view, at);
  if (now === null) return;
  let count = 0;
  let placed: readonly Placed[] = [];
  const changed = edit(now, () => {
    const result = proposed(
      now,
      unreconciledOf(now, catalogue, lookup),
      answers,
      framePrefixes(now, catalogue),
      dayOf(new Date()),
    );
    count = result.count;
    placed = result.placed;
    return result.skeleton;
  });
  // A refusal or a throw is posted by `edit`.
  if (changed) {
    const block = now.block.id;
    post(
      "info",
      proposedText(placed, now.id, (id) =>
        addressWords(store.view, id === null ? { block } : { block, id }),
      ),
    );
  } else if (count === 0) {
    post(
      "info",
      `No new match was found for the ${found.length === 1 ? "name" : `${found.length} names`}.`,
    );
  }
}
</script>

<div class="metadata" {@attach held}>
  {#if frame === null}
    <p class="hint">{shown.kind === "none" ? shown.hint : ""}</p>
  {:else}
    <p class="user" data-testid="metadata-user">
      {userLine}
      <button type="button" onclick={() => void user.ask()}>Change…</button>
    </p>
    <ol aria-label="Statements of {frame.words}">
      {#each rectangles as rectangle, index (rectangle.key)}
        <li>
          <Rectangle
            {rectangle}
            {frame}
            sentence={index === 0 && sentence !== null ? sentence : undefined}
            onbelieve={(pair, belief) => believe(frame, pair, belief)}
            onremove={(pair) => remove(frame, rectangle, pair)}
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
    {#if candidates !== null}
      <Candidates
        {candidates}
        unreconciled={unreconciled.length}
        proposing={proposingFor === frame.key}
        onbelieve={(row, belief) => believeCandidate(frame, row, belief)}
        onpropose={() => void propose(frame)}
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
