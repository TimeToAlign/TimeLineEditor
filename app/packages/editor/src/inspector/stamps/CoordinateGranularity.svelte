<script lang="ts">
/**
 * The Timestamp tab's Coordinate granularity: the workspace's two settings
 * on one discreet line at the pane's bottom, stated outside the journal
 * (`configure`) as they are typed; a refusal shows beside its field, and
 * leaving the field shows what is stated again.
 */
import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { Granularity } from "@timetoalign/tilie-core";

/** The open workspace's store, read as Svelte state. */
let { live }: { live: LiveStore } = $props();

const uid = $props.id();

type Kind = keyof Granularity;

/** One granularity setting: its label and its hover hint. */
const SETTINGS: readonly { readonly kind: Kind; readonly label: string; readonly hint: string }[] =
  [
    {
      kind: "denominator",
      label: "Denominator",
      hint: "A fraction position is never finer than 1 / denominator.",
    },
    {
      kind: "decimals",
      label: "Decimals",
      hint: "A float position has at most this many decimal places, and floats are shown with them.",
    },
  ];

const granularity = $derived(live.view.settings.granularity);

/** The text typed into a setting while it differs from what is stated, and the store's refusal of it. */
const settingDrafts: { [kind in Kind]?: string } = $state({});
const settingProblems: { [kind in Kind]?: string } = $state({});

/** A field's text as the setting's number; text that is no integer gives NaN, which the store refuses. */
function numberOf(text: string): number {
  return /^\s*\d+\s*$/.test(text) ? Number(text) : Number.NaN;
}

function configure(kind: Kind, text: string): void {
  settingDrafts[kind] = text;
  const value = numberOf(text);
  const change = kind === "denominator" ? { denominator: value } : { decimals: value };
  const refusal = live.store.configure({ granularity: change });
  if (refusal === null) delete settingProblems[kind];
  else settingProblems[kind] = refusal.message;
}

/** Leaving a setting shows what is stated again. */
function leave(kind: Kind): void {
  delete settingDrafts[kind];
  delete settingProblems[kind];
}
</script>

<section class="area granularity" aria-labelledby="{uid}-granularity">
  <h3 id="{uid}-granularity">Coordinate granularity</h3>
  <div class="settings">
    {#each SETTINGS as setting (setting.kind)}
      <label class="setting" title={setting.hint}>
        {setting.label}
        <input
          type="text"
          inputmode="numeric"
          size="5"
          value={settingDrafts[setting.kind] ?? String(granularity[setting.kind])}
          aria-invalid={settingProblems[setting.kind] !== undefined}
          aria-describedby="{uid}-{setting.kind}-problem"
          oninput={(event) => configure(setting.kind, event.currentTarget.value)}
          onchange={() => leave(setting.kind)}
        />
      </label>
      <span class="problem" id="{uid}-{setting.kind}-problem" role="status"
        >{settingProblems[setting.kind] ?? ""}</span
      >
    {/each}
  </div>
</section>

<style>
  /* One discreet line at the pane's bottom. */
  .granularity {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    padding: 0.3rem 0;
    border-top: 1px solid #e4e4e4;
    background: #fff;
  }

  .settings {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
    color: #595959;
    font-size: 0.75rem;
  }

  .setting input {
    width: 4.5em;
    margin-left: 0.3rem;
    padding: 0 0.2rem;
    font: inherit;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
</style>
