import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import { stubEditor } from "./dom.ts";

const health = { name: "tilie-server", version: "0.1.0", timetoalign: "1.2.0" };

/** The page's path, query and fragment, as the address bar shows them. */
function address(): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

/** Stub `fetch`; each call also records the address at the time of the call. */
function stubFetch(response: Response) {
  const addresses: string[] = [];
  const fetchStub = vi.fn(async (_input: string, _init: RequestInit) => {
    addresses.push(address());
    return response;
  });
  vi.stubGlobal("fetch", fetchStub);
  return { fetchStub, addresses };
}

function hook() {
  const installed = window.__tilie;
  if (installed === undefined) throw new Error("window.__tilie is not installed");
  return installed;
}

/** The page's text as shown: outside its dialogs and visually hidden text. */
function pageText(): string {
  const page = document.body.cloneNode(true) as HTMLElement;
  for (const hidden of page.querySelectorAll("dialog, .visually-hidden")) hidden.remove();
  return page.textContent ?? "";
}

function text(selector: string): string[] {
  return Array.from(document.querySelectorAll(selector), (element) => element.textContent ?? "");
}

describe("App", () => {
  let app: ReturnType<typeof mount>;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    stubEditor();
  });

  afterEach(() => {
    unmount(app);
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("renders the header and the arranger, focused, and nothing else", () => {
    stubFetch(Response.json(health));
    app = mount(App, { target: document.body });
    flushSync();

    expect(text("header h1")).toEqual(["TimeLineEditor"]);
    expect(text("h2")).toEqual(["Inspector", "About TimeLineEditor"]);
    expect(document.querySelectorAll("footer").length).toBe(0);
    const arranger = document.querySelector('[role="application"][aria-label="Arranger"]');
    expect(arranger?.getAttribute("tabindex")).toBe("0");
    expect(document.activeElement).toBe(arranger);
  });

  it("takes the token from the fragment, clears it and shows the health", async () => {
    window.history.replaceState({}, "", "/?view=a#token=abc");
    const entries = history.length;
    const { fetchStub, addresses } = stubFetch(Response.json(health));
    app = mount(App, { target: document.body });

    await vi.waitFor(() => {
      expect(fetchStub.mock.calls.length).toBe(1);
    });
    expect(fetchStub.mock.calls).toEqual([
      ["/api/health", { headers: { Authorization: "Bearer abc" } }],
    ]);
    expect(addresses).toEqual(["/?view=a"]);
    expect(location.hash).toBe("");
    expect(history.length).toBe(entries);
  });

  it("sends no token and leaves the URL alone without a fragment token", async () => {
    window.history.replaceState({}, "", "/?token=abc");
    const { fetchStub, addresses } = stubFetch(Response.json(health));
    app = mount(App, { target: document.body });

    await vi.waitFor(() => {
      expect(fetchStub.mock.calls).toEqual([
        ["/api/health", { headers: { Authorization: "Bearer " } }],
      ]);
    });
    expect(addresses).toEqual(["/?token=abc"]);
    expect(address()).toBe("/?token=abc");
  });

  it("shows nothing while the server is healthy and keeps the health", async () => {
    stubFetch(Response.json(health));
    app = mount(App, { target: document.body });

    await vi.waitFor(() => {
      expect(hook().health()).toEqual(health);
    });
    flushSync();
    expect(document.querySelectorAll("header .offline").length).toBe(0);
    const page = pageText();
    for (const shown of ["tilie-server", "0.1.0", "1.2.0"])
      expect(page.includes(shown)).toBe(false);
  });

  /** The offline marks once the health check has failed, as [text, title] pairs. */
  /** The offline marks: their shown text, `title` and visually hidden text. */
  async function offlineMarks(): Promise<[string, string | null, string][]> {
    await vi.waitFor(() => {
      expect(document.querySelectorAll("header .offline").length).toBe(1);
    });
    return Array.from(document.querySelectorAll("header .offline"), (mark) => {
      const hidden = mark.querySelector(".visually-hidden")?.textContent ?? "";
      return [mark.firstChild?.textContent ?? "", mark.getAttribute("title"), hidden];
    });
  }

  it("marks the editor offline on an HTTP error, never showing the raw status", async () => {
    stubFetch(new Response(null, { status: 502, statusText: "Bad Gateway" }));
    app = mount(App, { target: document.body });

    expect(await offlineMarks()).toEqual([
      [
        "offline",
        "The server did not answer the health check (502 Bad Gateway).",
        ": The server did not answer the health check (502 Bad Gateway).",
      ],
    ]);
    expect(
      document.querySelector("header .offline")?.parentElement?.getAttribute("aria-live"),
    ).toBe("polite");
    expect(hook().health()).toBe(null);
    const page = pageText();
    expect(page.includes("HTTP 502")).toBe(false);
    expect(page.includes("502")).toBe(false);
  });

  it("marks the editor offline when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    app = mount(App, { target: document.body });

    expect(await offlineMarks()).toEqual([
      [
        "offline",
        "The server did not answer the health check (Failed to fetch).",
        ": The server did not answer the health check (Failed to fetch).",
      ],
    ]);
    expect(hook().health()).toBe(null);
  });
});

describe("the inspector drawer", () => {
  let app: ReturnType<typeof mount>;

  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    localStorage.clear();
    stubEditor();
    stubFetch(Response.json(health));
  });

  afterEach(() => {
    unmount(app);
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function drawer(): HTMLElement {
    const element = document.getElementById("inspector");
    if (element === null) throw new Error("the drawer is missing");
    return element;
  }

  /** The inspector's controls, as [label, text, aria-expanded, aria-controls]. */
  function controls(): (string | null)[][] {
    return Array.from(document.querySelectorAll('button[aria-controls="inspector"]'))
      .filter((button) => button.closest("[hidden]") === null)
      .map((button) => [
        button.getAttribute("aria-label"),
        button.textContent,
        button.getAttribute("aria-expanded"),
        button.getAttribute("aria-controls"),
      ]);
  }

  function press(label: string): void {
    const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (button === null) throw new Error(`no button ${label}`);
    button.click();
    flushSync();
  }

  it("is closed by default, opens and closes through its buttons and remembers the choice", async () => {
    app = mount(App, { target: document.body });
    flushSync();
    expect(drawer().hidden).toBe(true);
    expect(controls()).toEqual([["Open inspector", "«", "false", "inspector"]]);

    press("Open inspector");
    expect(drawer().hidden).toBe(false);
    expect(controls()).toEqual([["Close inspector", "»", "true", "inspector"]]);
    expect(localStorage.getItem("tilie.inspector.open")).toBe("true");
    await vi.waitFor(() => {
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Close inspector");
    });

    press("Close inspector");
    expect(drawer().hidden).toBe(true);
    expect(controls()).toEqual([["Open inspector", "«", "false", "inspector"]]);
    expect(localStorage.getItem("tilie.inspector.open")).toBe("false");
  });

  for (const [remembered, open] of [
    ["true", true],
    ["false", false],
    ["yes", false],
  ] as const) {
    it(`starts ${open ? "open" : "closed"} when "${remembered}" is remembered`, () => {
      localStorage.setItem("tilie.inspector.open", remembered);
      app = mount(App, { target: document.body });
      flushSync();
      expect(drawer().hidden).toBe(!open);
    });
  }

  it("starts closed and still opens and closes when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("storage is blocked");
      },
      setItem() {
        throw new Error("storage is blocked");
      },
    });
    app = mount(App, { target: document.body });
    flushSync();
    expect(drawer().hidden).toBe(true);
    press("Open inspector");
    expect(drawer().hidden).toBe(false);
    press("Close inspector");
    expect(drawer().hidden).toBe(true);
  });
});
