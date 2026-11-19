<script lang="ts">
/**
 * The type profiles dialogue: a native modal dialog over a draft of the
 * page's profiles and services. It lists the profiles, adds one (empty, or
 * a copy of a catalogue type, which then replaces that type), edits the
 * selected one (ID, label, its "is a" per system from the catalogue's
 * patterns, its verbs in order with Move up and Move down, its lookup
 * systems) and deletes one; it lists, adds, edits and deletes services.
 * "Import YAML…" replaces the draft with a profile file, "Export YAML…"
 * writes the draft as one. Save checks the draft and makes it the page's
 * profiles; Cancel and Escape drop it.
 */

import { defaultCatalogue } from "@timetoalign/timetoshare";
import { flushSync, tick } from "svelte";
import type { Attachment } from "svelte/attachments";
import { openFile, saveFile } from "../files.ts";
import type { Service } from "../lookup/services.ts";
import { profilesState } from "./profiles.svelte.ts";
import type { Profile, Profiles } from "./profiles.ts";
import {
  isAChoices,
  lookupChoices,
  movedVerb,
  NO_PROFILES,
  newProfile,
  PROFILES_FILE,
  PROFILES_FILE_NAME,
  parseProfiles,
  patternKey,
  patternText,
  profilesText,
  readProfiles,
  withLookup,
  withPattern,
} from "./profiles.ts";

/** A profile or a service of the draft, with a key that outlives edits of its ID. */
interface Entry<T> {
  readonly key: number;
  readonly value: T;
}

const id = $props.id();
const catalogue = defaultCatalogue();
const isA = isAChoices(catalogue);
const NEW_EMPTY = "";

/** The dialog, held by an attachment; not state. */
let dialog: HTMLDialogElement | undefined;
const heldDialog: Attachment<HTMLDialogElement> = (element) => {
  dialog = element;
  return () => {
    dialog = undefined;
  };
};

let nextKey = 0;
let profiles: readonly Entry<Profile>[] = $state.raw([]);
let services: readonly Entry<Service>[] = $state.raw([]);
/** The key of the profile shown for editing; `null` for none. */
let selected: number | null = $state(null);
/** The catalogue type a new profile copies; `NEW_EMPTY` for an empty one. */
let basis = $state(NEW_EMPTY);
/** The verb "Add verb" adds. */
let verbToAdd = $state("");
/** What Save, Import or Export found wrong; `null` while nothing is. */
let problem: string | null = $state(null);

const profile = $derived(profiles.find((entry) => entry.key === selected) ?? null);
const lookups = $derived(
  lookupChoices(
    catalogue,
    services.map((entry) => entry.value),
  ),
);
const addableVerbs = $derived(
  catalogue.verbs.filter(
    (verb) => verb.id !== "is_a" && profile !== null && !profile.value.verbs.includes(verb.id),
  ),
);

function entries<T>(values: readonly T[]): Entry<T>[] {
  return values.map((value) => ({ key: nextKey++, value }));
}

function draft(): Profiles {
  return {
    profiles: profiles.map((entry) => entry.value),
    services: services.map((entry) => entry.value),
  };
}

function load(from: Profiles): void {
  profiles = entries(from.profiles);
  services = entries(from.services);
  selected = profiles[0]?.key ?? null;
  verbToAdd = "";
}

/** Show the page's profiles for editing. */
export function open(): void {
  load(profilesState().profiles);
  basis = NEW_EMPTY;
  problem = null;
  flushSync();
  dialog?.showModal();
  focus(selected === null ? '[data-action="add-profile"]' : `[data-profile="${selected}"]`);
}

function close(): void {
  if (dialog?.open) dialog.close();
}

/** Focus, once the draft is drawn, the first element the first of `selectors` finding one finds. */
function focus(...selectors: readonly string[]): void {
  void tick().then(() => {
    for (const selector of selectors) {
      const found = dialog?.querySelector<HTMLElement>(selector);
      if (found != null) {
        found.focus();
        return;
      }
    }
  });
}

function verbLabel(verb: string): string {
  return catalogue.verbs.find((candidate) => candidate.id === verb)?.label ?? verb;
}

/** Replace the selected profile with `edit` of it. */
function edit(change: (value: Profile) => Profile): void {
  profiles = profiles.map((entry) =>
    entry.key === selected ? { key: entry.key, value: change(entry.value) } : entry,
  );
}

function addProfile(): void {
  const from = catalogue.types.find((type) => type.id === basis) ?? null;
  const [entry] = entries([
    newProfile(
      profiles.map((other) => other.value.id),
      from,
    ),
  ]);
  if (entry === undefined) return;
  profiles = [...profiles, entry];
  selected = entry.key;
  focus(`#${id}-profile-id`);
}

function deleteProfile(key: number): void {
  const at = profiles.findIndex((entry) => entry.key === key);
  profiles = profiles.filter((entry) => entry.key !== key);
  const next = profiles[at] ?? profiles[at - 1] ?? null;
  if (selected === key) selected = next?.key ?? null;
  focus(next === null ? '[data-action="add-profile"]' : `[data-profile="${next.key}"]`);
}

function moveVerb(index: number, by: -1 | 1): void {
  const verb = profile?.value.verbs[index];
  edit((value) => movedVerb(value, index, by));
  // The focus stays on the moved verb: on the same button, else (at an end) on the other one.
  if (verb !== undefined) {
    focus(
      `[data-verb="${verb}"] [data-move="${by}"]:not(:disabled)`,
      `[data-verb="${verb}"] [data-move="${-by}"]`,
    );
  }
}

function removeVerb(index: number): void {
  const verbs = profile?.value.verbs ?? [];
  const next = verbs[index + 1] ?? verbs[index - 1];
  edit((value) => ({ ...value, verbs: value.verbs.filter((_, at) => at !== index) }));
  focus(next === undefined ? `#${id}-add-verb` : `[data-verb="${next}"] [data-action="remove"]`);
}

function addVerb(): void {
  const verb = verbToAdd;
  if (verb === "") return;
  edit((value) => ({ ...value, verbs: [...value.verbs, verb] }));
  verbToAdd = "";
}

function addService(): void {
  const taken = services.map((entry) => entry.value.id);
  let n = 1;
  while (taken.includes(`service_${n}`)) n += 1;
  const [entry] = entries([{ id: `service_${n}`, name: `service ${n}`, endpoint: "https://" }]);
  if (entry === undefined) return;
  services = [...services, entry];
  focus(`[data-service="${entry.key}"] input`);
}

function editService(key: number, change: Partial<Service>): void {
  services = services.map((entry) =>
    entry.key === key ? { key, value: { ...entry.value, ...change } } : entry,
  );
}

function deleteService(key: number): void {
  const at = services.findIndex((entry) => entry.key === key);
  services = services.filter((entry) => entry.key !== key);
  const next = services[at] ?? services[at - 1];
  focus(
    next === undefined
      ? '[data-action="add-service"]'
      : `[data-service="${next.key}"] [data-action="remove"]`,
  );
}

function save(event: SubmitEvent): void {
  event.preventDefault();
  const read = readProfiles(draft(), catalogue);
  if (typeof read === "string") {
    problem = read;
    return;
  }
  profilesState().set(read);
  close();
}

async function importFile(): Promise<void> {
  problem = null;
  try {
    const opened = await openFile(PROFILES_FILE);
    if (opened === null) return;
    const read = parseProfiles(opened.text, catalogue);
    if (typeof read === "string") {
      problem = `${opened.name} holds no type profiles: ${read}`;
      return;
    }
    load(read);
  } catch (error) {
    problem = `The file could not be read: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function exportFile(): Promise<void> {
  const read = readProfiles(draft(), catalogue);
  if (typeof read === "string") {
    problem = read;
    return;
  }
  problem = null;
  try {
    await saveFile(profilesText(read), PROFILES_FILE, PROFILES_FILE_NAME);
  } catch (error) {
    problem = `The file could not be written: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Drop the draft when the dialog closes without Save (Cancel, Escape). */
function closed(): void {
  load(NO_PROFILES);
  problem = null;
}
</script>

<dialog {@attach heldDialog} aria-labelledby="{id}-title" onclose={closed}>
  <!-- The editor, not the browser, checks the fields: the form validates nothing itself. -->
  <form novalidate onsubmit={save}>
    <h2 id="{id}-title">Type profiles</h2>
    <p>
      A profile is a type of thing with its usual verbs, offered first when its “is a” is stated, and
      the systems its values are looked up in; a profile with the ID of a catalogue type replaces it.
      A service is a Reconciliation Service API endpoint to look values up in. Both are kept in this
      browser, never in a workspace or a manifest.
    </p>

    <section aria-labelledby="{id}-profiles">
      <h3 id="{id}-profiles">Profiles</h3>
      {#if profiles.length === 0}
        <p class="hint">No profile yet.</p>
      {:else}
        <ul class="profiles">
          {#each profiles as entry (entry.key)}
            <li>
              <button
                type="button"
                data-profile={entry.key}
                aria-pressed={entry.key === selected}
                onclick={() => (selected = entry.key)}
                >{entry.value.label} <code>{entry.value.id}</code></button
              >
              <button
                type="button"
                aria-label="Delete {entry.value.label}"
                onclick={() => deleteProfile(entry.key)}>Delete</button
              >
            </li>
          {/each}
        </ul>
      {/if}
      <div class="row">
        <label for="{id}-basis">New profile from</label>
        <select id="{id}-basis" bind:value={basis}>
          <option value={NEW_EMPTY}>an empty profile</option>
          {#each catalogue.types as type (type.id)}
            <option value={type.id}>{type.label}</option>
          {/each}
        </select>
        <button type="button" data-action="add-profile" onclick={addProfile}>Add profile</button>
      </div>
    </section>

    {#if profile !== null}
      {@const value = profile.value}
      <fieldset class="profile" data-testid="profile-editor">
        <legend>Profile {value.label}</legend>
        <label for="{id}-profile-id">ID</label>
        <input
          id="{id}-profile-id"
          type="text"
          value={value.id}
          oninput={(event) => edit((v) => ({ ...v, id: event.currentTarget.value }))}
        />
        <label for="{id}-profile-label">Label</label>
        <input
          id="{id}-profile-label"
          type="text"
          value={value.label}
          oninput={(event) => edit((v) => ({ ...v, label: event.currentTarget.value }))}
        />

        <fieldset>
          <legend>Is a</legend>
          {#each isA as choice (choice.system)}
            {@const own = (value.is_a[choice.system] ?? []).filter(
              (alternative) =>
                !choice.options.some((option) => option.key === patternKey(alternative.pattern)),
            )}
            <fieldset class="system">
              <legend>{choice.label}</legend>
              {#each choice.options as option (option.key)}
                <label class="check">
                  <input
                    type="checkbox"
                    checked={(value.is_a[choice.system] ?? []).some(
                      (alternative) => patternKey(alternative.pattern) === option.key,
                    )}
                    onchange={(event) =>
                      edit((v) =>
                        withPattern(v, choice.system, option.pattern, event.currentTarget.checked),
                      )}
                  />
                  <code>{option.text}</code>
                  <span class="hint">({option.types.join(", ")})</span>
                </label>
              {/each}
              {#each own as alternative (patternKey(alternative.pattern))}
                <label class="check">
                  <input
                    type="checkbox"
                    checked
                    onchange={(event) =>
                      edit((v) =>
                        withPattern(v, choice.system, alternative.pattern, event.currentTarget.checked),
                      )}
                  />
                  <code>{patternText(alternative.pattern)}</code>
                </label>
              {/each}
            </fieldset>
          {/each}
        </fieldset>

        <fieldset>
          <legend>Verbs</legend>
          {#if value.verbs.length === 0}
            <p class="hint">No verb yet: the catalogue's order holds.</p>
          {:else}
            <ol class="verbs">
              {#each value.verbs as verb, index (verb)}
                <li data-verb={verb}>
                  <span>{verbLabel(verb)}</span>
                  <button
                    type="button"
                    data-move="-1"
                    aria-label="Move {verbLabel(verb)} up"
                    disabled={index === 0}
                    onclick={() => moveVerb(index, -1)}>Move up</button
                  >
                  <button
                    type="button"
                    data-move="1"
                    aria-label="Move {verbLabel(verb)} down"
                    disabled={index === value.verbs.length - 1}
                    onclick={() => moveVerb(index, 1)}>Move down</button
                  >
                  <button
                    type="button"
                    data-action="remove"
                    aria-label="Remove {verbLabel(verb)}"
                    onclick={() => removeVerb(index)}>Remove</button
                  >
                </li>
              {/each}
            </ol>
          {/if}
          <div class="row">
            <label for="{id}-add-verb">Verb</label>
            <select id="{id}-add-verb" bind:value={verbToAdd}>
              <option value="">choose a verb</option>
              {#each addableVerbs as verb (verb.id)}
                <option value={verb.id}>{verb.label}</option>
              {/each}
            </select>
            <button type="button" disabled={verbToAdd === ""} onclick={addVerb}>Add verb</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Look values up in</legend>
          {#each lookups as choice (choice.id)}
            <label class="check">
              <input
                type="checkbox"
                checked={value.lookup.includes(choice.id)}
                onchange={(event) =>
                  edit((v) =>
                    withLookup(
                      v,
                      choice.id,
                      event.currentTarget.checked,
                      lookups.map((other) => other.id),
                    ),
                  )}
              />
              {choice.label}
            </label>
          {/each}
        </fieldset>
      </fieldset>
    {/if}

    <section aria-labelledby="{id}-services">
      <h3 id="{id}-services">Services</h3>
      {#if services.length === 0}
        <p class="hint">No service yet.</p>
      {:else}
        <ul class="services">
          {#each services as entry (entry.key)}
            <li data-service={entry.key}>
              <label>
                ID
                <input
                  type="text"
                  value={entry.value.id}
                  oninput={(event) => editService(entry.key, { id: event.currentTarget.value })}
                />
              </label>
              <label>
                Name
                <input
                  type="text"
                  value={entry.value.name}
                  oninput={(event) => editService(entry.key, { name: event.currentTarget.value })}
                />
              </label>
              <label>
                Endpoint
                <input
                  type="url"
                  value={entry.value.endpoint}
                  oninput={(event) => editService(entry.key, { endpoint: event.currentTarget.value })}
                />
              </label>
              <button
                type="button"
                data-action="remove"
                aria-label="Delete {entry.value.name}"
                onclick={() => deleteService(entry.key)}>Delete</button
              >
            </li>
          {/each}
        </ul>
      {/if}
      <button type="button" data-action="add-service" onclick={addService}>Add service</button>
    </section>

    {#if problem !== null}
      <p class="invalid" role="alert">{problem}</p>
    {/if}
    <div class="answers">
      <button type="button" onclick={() => void importFile()}>Import YAML…</button>
      <button type="button" onclick={() => void exportFile()}>Export YAML…</button>
      <span class="gap"></span>
      <button type="submit">Save</button>
      <button type="button" onclick={close}>Cancel</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(44rem, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    padding: 1rem 1.25rem;
    border: 1px solid #bdbdbd;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.25);
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }

  h3 {
    margin: 0.75rem 0 0.35rem;
    font-size: 0.9rem;
  }

  p {
    margin: 0 0 0.5rem;
  }

  ul,
  ol {
    display: grid;
    gap: 0.25rem;
    margin: 0 0 0.5rem;
    padding: 0;
    list-style: none;
  }

  li,
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  .verbs li > span {
    flex: 1;
  }

  fieldset {
    display: grid;
    gap: 0.25rem;
    margin: 0.5rem 0 0;
    padding: 0.4rem 0.6rem;
    border: 1px solid #d0d0d0;
    border-radius: 4px;
  }

  legend {
    font-weight: 600;
  }

  .system {
    border-style: dashed;
  }

  .check {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem;
  }

  .hint {
    color: #595959;
    font-size: 0.8rem;
  }

  code {
    font-family: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace;
    font-size: 0.78rem;
    overflow-wrap: anywhere;
  }

  input[type="text"],
  input[type="url"],
  select {
    padding: 0.2rem 0.35rem;
    border: 1px solid #b0b0b0;
    border-radius: 3px;
    font: inherit;
  }

  .invalid {
    margin: 0.5rem 0 0;
    color: #b00020;
  }

  .answers {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .gap {
    flex: 1;
  }

  button {
    padding: 0.2rem 0.7rem;
    border: 1px solid #bdbdbd;
    border-radius: 4px;
    background: #fafafa;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: #f0f0f0;
  }

  button:disabled {
    cursor: default;
    opacity: 0.6;
  }

  button[aria-pressed="true"] {
    border-color: #0a84ff;
    background: #e8f2ff;
  }

  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 1px;
  }
</style>
