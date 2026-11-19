/** The type profiles dialogue in jsdom; the expected values are stated in `README.md` ("Type profiles"). */

import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfilesDialog from "../src/profiles/ProfilesDialog.svelte";
import { profilesState, resetProfiles } from "../src/profiles/profiles.svelte.ts";
import type { Profile } from "../src/profiles/profiles.ts";
import { PROFILES_KEY, profilesText } from "../src/profiles/profiles.ts";
import { stubEditor } from "./dom.ts";

/** What the stubbed file picker hands over next, and what was saved. */
const files = vi.hoisted(() => ({
  next: null as { name: string; text: string } | null,
  saved: [] as { text: string; name: string; description: string }[],
}));

vi.mock("../src/files.ts", () => ({
  openFile: async () =>
    files.next === null ? null : { name: files.next.name, text: files.next.text, handle: null },
  saveFile: async (text: string, kind: { description: string }, name: string) => {
    files.saved.push({ text, name, description: kind.description });
    return { name, handle: null };
  },
}));

const LECTURE: Profile = {
  id: "lecture_recording",
  label: "lecture recording",
  is_a: { fallback: [{ pattern: { type: ["schema:AudioObject"] } }] },
  verbs: ["performed_by", "recorded_at_on"],
  lookup: ["wikidata"],
};
const FILM: Profile = { ...LECTURE, id: "film", label: "film", verbs: [], lookup: [] };

let mounted: ReturnType<typeof mount> | undefined;

beforeEach(() => {
  stubEditor();
  localStorage.clear();
  resetProfiles();
  files.next = null;
  files.saved = [];
});

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  localStorage.clear();
  resetProfiles();
  vi.unstubAllGlobals();
});

/** Mount the dialogue and open it on the page's profiles. */
async function opened() {
  const target = document.createElement("div");
  document.body.append(target);
  const dialog = mount(ProfilesDialog, { target });
  mounted = dialog;
  flushSync();
  dialog.open();
  await tick();
  await tick();
  const element = one<HTMLDialogElement>(target, "dialog");
  return { dialog, element };
}

function one<E extends Element>(within: ParentNode, selector: string): E {
  const found = within.querySelector<E>(selector);
  if (found === null) throw new Error(`nothing matches ${selector}`);
  return found;
}

/** The button of `within` whose text or accessible label is `name`. */
function button(within: ParentNode, name: string): HTMLButtonElement {
  const found = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === name || candidate.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
}

/** The control a `<label for>` with text `name` labels. */
function labelled<E extends HTMLElement>(within: ParentNode, name: string): E {
  const label = [...within.querySelectorAll("label")].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  const id = label?.getAttribute("for");
  if (id == null) throw new Error(`no label ${name}`);
  return one<E>(within, `#${CSS.escape(id)}`);
}

/** The checkbox in the fieldset with legend `legend` whose label holds `text`. */
function checkbox(within: ParentNode, legend: string, text: string): HTMLInputElement {
  const set = [...within.querySelectorAll("fieldset")].find(
    (candidate) => candidate.querySelector(":scope > legend")?.textContent?.trim() === legend,
  );
  const label = [...(set?.querySelectorAll(":scope > label") ?? [])].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  const input = label?.querySelector<HTMLInputElement>("input[type=checkbox]");
  if (input == null) throw new Error(`no checkbox ${text} in ${legend}`);
  return input;
}

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  flushSync();
}

function toggle(input: HTMLInputElement): void {
  input.click();
  flushSync();
}

async function press(target: HTMLButtonElement): Promise<void> {
  target.click();
  flushSync();
  await tick();
  await tick();
}

const alerts = (element: HTMLElement) =>
  [...element.querySelectorAll("[role=alert]")].map((alert) => alert.textContent?.trim());

describe("editing profiles", () => {
  it("opens on the page's profiles, the first selected and focused", async () => {
    profilesState().set({ profiles: [LECTURE, FILM], services: [] });
    const { element } = await opened();
    expect(element.open).toBe(true);
    const listed = [...element.querySelectorAll<HTMLButtonElement>("[data-profile]")];
    expect(listed.map((entry) => [entry.textContent, entry.getAttribute("aria-pressed")])).toEqual([
      ["lecture recording lecture_recording", "true"],
      ["film film", "false"],
    ]);
    expect(document.activeElement).toBe(listed[0]);
    expect(element.querySelector("legend")?.textContent).toBe("Profile lecture recording");
  });

  it("builds a profile and saves it", async () => {
    const { element } = await opened();
    expect(element.textContent).toContain("No profile yet.");
    await press(button(element, "Add profile"));
    const id = labelled<HTMLInputElement>(element, "ID");
    expect(document.activeElement).toBe(id);
    expect(id.value).toBe("type_1");
    type(id, "lecture_recording");
    type(labelled<HTMLInputElement>(element, "Label"), "lecture recording");
    toggle(checkbox(element, "Other vocabularies", "type schema:AudioObject"));
    const verb = labelled<HTMLSelectElement>(element, "Verb");
    choose(verb, "performed_by");
    await press(button(element, "Add verb"));
    choose(verb, "recorded_at_on");
    await press(button(element, "Add verb"));
    const up = button(element, "Move recorded at, recorded on up");
    await press(up);
    expect(
      [...element.querySelectorAll("[data-verb] > span")].map((item) => item.textContent),
    ).toEqual(["recorded at, recorded on", "performed by"]);
    expect(document.activeElement).toBe(button(element, "Move recorded at, recorded on down"));
    await press(button(element, "Move recorded at, recorded on down"));
    toggle(checkbox(element, "Look values up in", "Wikidata"));
    await press(button(element, "Save"));
    expect(element.open).toBe(false);
    expect(profilesState().profiles).toEqual({ profiles: [LECTURE], services: [] });
    expect(localStorage.getItem(PROFILES_KEY)).toBe(
      profilesText({ profiles: [LECTURE], services: [] }),
    );
  });

  it("adds a copy of a catalogue type", async () => {
    const { element } = await opened();
    choose(labelled<HTMLSelectElement>(element, "New profile from"), "video");
    await press(button(element, "Add profile"));
    expect(labelled<HTMLInputElement>(element, "ID").value).toBe("video");
    expect(checkbox(element, "Other vocabularies", "type schema:VideoObject").checked).toBe(true);
    expect(
      [...element.querySelectorAll("[data-verb] > span")].map((item) => item.textContent),
    ).toEqual([
      "same as",
      "is a recording of",
      "performed by",
      "recorded at, recorded on",
      "released on, published in",
    ]);
  });

  it("drops the draft on Cancel and on Escape", async () => {
    profilesState().set({ profiles: [LECTURE], services: [] });
    const { dialog, element } = await opened();
    type(labelled<HTMLInputElement>(element, "Label"), "talk");
    await press(button(element, "Cancel"));
    expect(element.open).toBe(false);
    dialog.open();
    await tick();
    expect(labelled<HTMLInputElement>(element, "Label").value).toBe("lecture recording");
    type(labelled<HTMLInputElement>(element, "Label"), "talk");
    element.close();
    flushSync();
    expect(profilesState().profiles).toEqual({ profiles: [LECTURE], services: [] });
  });

  it("deletes a profile and focuses the next", async () => {
    profilesState().set({ profiles: [LECTURE, FILM], services: [] });
    const { element } = await opened();
    await press(button(element, "Delete lecture recording"));
    const listed = [...element.querySelectorAll<HTMLButtonElement>("[data-profile]")];
    expect(listed.map((entry) => entry.textContent)).toEqual(["film film"]);
    expect(document.activeElement).toBe(listed[0]);
    await press(button(element, "Save"));
    expect(profilesState().profiles).toEqual({ profiles: [FILM], services: [] });
  });

  it("refuses to save a draft with a problem", async () => {
    profilesState().set({ profiles: [LECTURE], services: [] });
    const { element } = await opened();
    type(labelled<HTMLInputElement>(element, "Label"), "");
    await press(button(element, "Save"));
    expect(element.open).toBe(true);
    expect(alerts(element)).toEqual(["profiles/0/label: a label is a non-empty text"]);
    expect(profilesState().profiles).toEqual({ profiles: [LECTURE], services: [] });
  });
});

describe("files and services", () => {
  it("imports a profile file into the draft", async () => {
    const { element } = await opened();
    files.next = {
      name: "lecture.yaml",
      text: profilesText({ profiles: [LECTURE], services: [] }),
    };
    await press(button(element, "Import YAML…"));
    expect(labelled<HTMLInputElement>(element, "ID").value).toBe("lecture_recording");
    expect(profilesState().profiles).toEqual({ profiles: [], services: [] });
    await press(button(element, "Save"));
    expect(profilesState().profiles).toEqual({ profiles: [LECTURE], services: [] });
  });

  it("keeps the draft when the file holds no profiles", async () => {
    profilesState().set({ profiles: [FILM], services: [] });
    const { element } = await opened();
    files.next = { name: "other.yaml", text: "profiles: []\n" };
    await press(button(element, "Import YAML…"));
    expect(alerts(element)).toEqual(["other.yaml holds no type profiles: 'services' is missing"]);
    expect(labelled<HTMLInputElement>(element, "ID").value).toBe("film");
  });

  it("exports the draft as profiles.yaml, and refuses a draft with a problem", async () => {
    profilesState().set({ profiles: [LECTURE], services: [] });
    const { element } = await opened();
    await press(button(element, "Export YAML…"));
    expect(files.saved).toEqual([
      {
        text: profilesText({ profiles: [LECTURE], services: [] }),
        name: "profiles.yaml",
        description: "TimeLineEditor type profiles",
      },
    ]);
    type(labelled<HTMLInputElement>(element, "ID"), "Lecture");
    await press(button(element, "Export YAML…"));
    expect(files.saved).toHaveLength(1);
    expect(alerts(element)).toEqual([
      "profiles/0/id: 'Lecture' is no profile id: use a–z, 0–9 and _ only",
    ]);
  });

  it("adds, edits and deletes services, offered as lookup systems once saved", async () => {
    profilesState().set({ profiles: [LECTURE], services: [] });
    const first = await opened();
    await press(button(first.element, "Add service"));
    const fields = [...first.element.querySelectorAll<HTMLInputElement>("[data-service] input")];
    expect(fields.map((field) => field.value)).toEqual(["service_1", "service 1", "https://"]);
    expect(document.activeElement).toBe(fields[0]);
    const [id, name, endpoint] = fields as [HTMLInputElement, HTMLInputElement, HTMLInputElement];
    type(id, "mb");
    type(name, "MusicBrainz route");
    type(endpoint, "http://127.0.0.1:8000/api/reconcile/musicbrainz");
    await press(button(first.element, "Add service"));
    await press(button(first.element, "Delete service 1"));
    expect(document.activeElement).toBe(button(first.element, "Delete MusicBrainz route"));
    await press(button(first.element, "Save"));
    expect(profilesState().profiles.services).toEqual([
      {
        id: "mb",
        name: "MusicBrainz route",
        endpoint: "http://127.0.0.1:8000/api/reconcile/musicbrainz",
      },
    ]);
    first.dialog.open();
    await tick();
    expect(checkbox(first.element, "Look values up in", "MusicBrainz route").checked).toBe(false);
  });
});
