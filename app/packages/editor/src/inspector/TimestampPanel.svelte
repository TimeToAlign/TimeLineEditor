<script lang="ts">
/**
 * The Timestamp tab, its areas one below the other, each a section of
 * `stamps/`: while a timestamp is shown, the **name header** first (naming
 * an unnamed timestamp stores it; it stays in view while the pane
 * scrolls); **Coordinates** (`StampCoordinates`, the Matchstamp tab's
 * too): a hint while no timestamp is shown, else its values, edited and
 * copied, or its text in a format; **Properties** (`TimestampProperties`):
 * what it displays, the MatchStamps a match timestamp belongs to, and
 * Delete, inactive until it is named; **Coordinate granularity** at the
 * pane's bottom. An edit of an unnamed timestamp moves its pin; every
 * change of a named one is a command. Every value, row, position and text
 * is core's; the tab reads typed text and sends commands.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { Pin } from "@timetoalign/tilie-core";
import { parseAxisValue, pinAt, positionFor } from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { Format } from "./formats.svelte.ts";
import CoordinateGranularity from "./stamps/CoordinateGranularity.svelte";
import { StampDrafts } from "./stamps/drafts.svelte.ts";
import StampCoordinates from "./stamps/StampCoordinates.svelte";
import StampName from "./stamps/StampName.svelte";
import StampPane from "./stamps/StampPane.svelte";
import TimestampProperties from "./stamps/TimestampProperties.svelte";
import type { ValueRow } from "./timestamp.ts";
import {
  addedTimestamp,
  moveCommand,
  nameCommand,
  timelineRows,
  timestampText,
} from "./timestamp.ts";

interface Props {
  /** The open workspace's store, read as Svelte state. */
  live: LiveStore;
  /** The timestamp shown; `null` while none is. */
  pin: Pin | null;
  /** The timestamp shown is now `next`: an unnamed one moved, or named. */
  onpin: (next: Pin) => void;
}

let { live, pin, onpin }: Props = $props();

const uid = $props.id();

const HINT =
  "Turn on Show coordinates (C) and click a timeline to pin a timestamp. With Show coordinates off, click a timestamp to edit it.";
const EMPTY_NAME = "A named timestamp keeps a name; Delete removes it.";
const UNNAMED =
  "Naming the timestamp stores it; then its display can be set and it can be deleted.";

/** The texts typed and the refusals, held for the pin they were typed for. */
const drafts = new StampDrafts(() => pin);

const groups = $derived(pin === null ? null : timelineRows(pin));
/** The hint's ID while the timestamp is unnamed: it describes the controls that wait for a name. */
const unnamedHint = $derived(pin !== null && pin.named === null ? `${uid}-unnamed` : undefined);

function textOf(format: Format) {
  return pin === null ? null : timestampText(format, pin);
}

/** Enter or leaving a value field: the position that gives the typed value, as the pin or as a `set`. */
function commitValue(row: ValueRow): void {
  const text = drafts.drafts[row.key];
  if (pin === null || text === undefined || !row.editable || row.numberType === null) return;
  const value = parseAxisValue(text, row.numberType);
  const position = value instanceof Rational ? positionFor(pin, row.row, value) : value;
  if (!(position instanceof Rational)) {
    drafts.refused(row.key, position.message);
    return;
  }
  const moved = pinAt(pin, position);
  if (pin.named === null) {
    drafts.settled(row.key);
    onpin(moved);
    return;
  }
  const command = moveCommand(pin, moved);
  if (command === null) drafts.settled(row.key);
  else drafts.send(row.key, () => live.store.dispatch(command));
}

/** Enter or leaving the name field: name an unnamed timestamp, storing it, or rename a named one. */
function commitName(): void {
  const name = drafts.drafts.name;
  if (pin === null || name === undefined) return;
  const { named } = pin;
  if (named === null) {
    if (name === "") {
      drafts.settled("name");
      return;
    }
    const before = live.store.view;
    const shown = pin;
    if (!drafts.send("name", () => live.store.dispatch(nameCommand(shown, name)))) return;
    const added = addedTimestamp(before, live.store.view, shown.spec.block);
    if (added !== null) onpin({ ...shown, named: added });
  } else if (name === "") drafts.reverted("name", EMPTY_NAME);
  else if (name === named.name) drafts.settled("name");
  else {
    const shown = pin;
    drafts.send("name", () => live.store.dispatch(nameCommand(shown, name)));
  }
}
</script>

<StampPane>
  {#if pin !== null}
    <StampName
      kind="timestamp"
      name={pin.named?.name ?? null}
      {drafts}
      describedby={unnamedHint}
      oncommit={commitName}
    >
      {#if unnamedHint !== undefined}
        <p class="hint" id={unnamedHint}>{UNNAMED}</p>
      {/if}
    </StampName>
  {/if}

  <StampCoordinates
    kind="timestamp"
    {groups}
    hint={HINT}
    {textOf}
    edit={{ drafts, commit: commitValue }}
  />

  {#if pin !== null}
    <TimestampProperties {live} {pin} {drafts} describedby={unnamedHint} />
  {/if}

  <CoordinateGranularity {live} />
</StampPane>
