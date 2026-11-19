/** The combobox's key table; the expected values are stated in `README.md` ("The combobox"). */

import { describe, expect, it } from "vitest";
import type { ComboboxAction, ComboboxState } from "../src/combobox/keys.ts";
import { announcement, keyed, typed } from "../src/combobox/keys.ts";

/**
 * A state written as a word: `closed`, `open` (no active option) or
 * `open@i` (option `i` active).
 */
type Word = "closed" | "open" | `open@${number}`;

function stateOf(word: Word): ComboboxState {
  if (word === "closed") return { open: false, active: null };
  if (word === "open") return { open: true, active: null };
  return { open: true, active: Number(word.slice("open@".length)) };
}

/** The expected answer: the next state, the action, and whether the key is handled. */
type Expected = readonly [Word, ComboboxAction, boolean];

/** Expected answers by count of options, then by the state the key is pressed in. */
type Rows = Readonly<Record<0 | 1 | 3, Readonly<Record<string, Expected>>>>;

/** Check every state of `rows` for `key` (with `alt`) over the field's `text`. */
function check(key: string, alt: boolean, rows: Rows, text = "Clara"): void {
  for (const count of [0, 1, 3] as const) {
    const expected = rows[count];
    const states: Word[] = [
      "closed",
      "open",
      ...Array.from({ length: count }, (_, index): Word => `open@${index}`),
    ];
    expect(Object.keys(expected).sort()).toEqual([...states].sort());
    for (const word of states) {
      const [next, action, handled] = expected[word] ?? ["closed", "none", false];
      expect([count, word, keyed(stateOf(word), key, alt, count, text)]).toEqual([
        count,
        word,
        { state: stateOf(next), action, handled },
      ]);
    }
  }
}

describe("the key table", () => {
  it("ArrowDown opens on the first option and moves to the next, wrapping", () => {
    check("ArrowDown", false, {
      0: { closed: ["open", "none", true], open: ["open", "none", true] },
      1: {
        closed: ["open@0", "none", true],
        open: ["open@0", "none", true],
        "open@0": ["open@0", "none", true],
      },
      3: {
        closed: ["open@0", "none", true],
        open: ["open@0", "none", true],
        "open@0": ["open@1", "none", true],
        "open@1": ["open@2", "none", true],
        "open@2": ["open@0", "none", true],
      },
    });
  });

  it("ArrowUp opens on the last option and moves to the previous, wrapping", () => {
    check("ArrowUp", false, {
      0: { closed: ["open", "none", true], open: ["open", "none", true] },
      1: {
        closed: ["open@0", "none", true],
        open: ["open@0", "none", true],
        "open@0": ["open@0", "none", true],
      },
      3: {
        closed: ["open@2", "none", true],
        open: ["open@2", "none", true],
        "open@0": ["open@2", "none", true],
        "open@1": ["open@0", "none", true],
        "open@2": ["open@1", "none", true],
      },
    });
  });

  it("Alt+ArrowDown opens with no active option and changes nothing while open", () => {
    check("ArrowDown", true, {
      0: { closed: ["open", "none", true], open: ["open", "none", true] },
      1: {
        closed: ["open", "none", true],
        open: ["open", "none", true],
        "open@0": ["open@0", "none", true],
      },
      3: {
        closed: ["open", "none", true],
        open: ["open", "none", true],
        "open@0": ["open@0", "none", true],
        "open@1": ["open@1", "none", true],
        "open@2": ["open@2", "none", true],
      },
    });
  });

  it("Alt+ArrowUp closes an open list and is not handled on a closed one", () => {
    check("ArrowUp", true, {
      0: { closed: ["closed", "none", false], open: ["closed", "none", true] },
      1: {
        closed: ["closed", "none", false],
        open: ["closed", "none", true],
        "open@0": ["closed", "none", true],
      },
      3: {
        closed: ["closed", "none", false],
        open: ["closed", "none", true],
        "open@0": ["closed", "none", true],
        "open@1": ["closed", "none", true],
        "open@2": ["closed", "none", true],
      },
    });
  });

  it("Enter picks the active option, else enters the text, and closes", () => {
    for (const alt of [false, true]) {
      check("Enter", alt, {
        0: { closed: ["closed", "enter", true], open: ["closed", "enter", true] },
        1: {
          closed: ["closed", "enter", true],
          open: ["closed", "enter", true],
          "open@0": ["closed", "pick", true],
        },
        3: {
          closed: ["closed", "enter", true],
          open: ["closed", "enter", true],
          "open@0": ["closed", "pick", true],
          "open@1": ["closed", "pick", true],
          "open@2": ["closed", "pick", true],
        },
      });
    }
  });

  it("Escape closes an open list, then clears the text, then is not handled", () => {
    for (const alt of [false, true]) {
      check("Escape", alt, {
        0: { closed: ["closed", "clear", true], open: ["closed", "none", true] },
        1: {
          closed: ["closed", "clear", true],
          open: ["closed", "none", true],
          "open@0": ["closed", "none", true],
        },
        3: {
          closed: ["closed", "clear", true],
          open: ["closed", "none", true],
          "open@0": ["closed", "none", true],
          "open@1": ["closed", "none", true],
          "open@2": ["closed", "none", true],
        },
      });
      check(
        "Escape",
        alt,
        {
          0: { closed: ["closed", "none", false], open: ["closed", "none", true] },
          1: {
            closed: ["closed", "none", false],
            open: ["closed", "none", true],
            "open@0": ["closed", "none", true],
          },
          3: {
            closed: ["closed", "none", false],
            open: ["closed", "none", true],
            "open@0": ["closed", "none", true],
            "open@1": ["closed", "none", true],
            "open@2": ["closed", "none", true],
          },
        },
        "",
      );
    }
  });

  it("Home, End, ArrowLeft and ArrowRight move the caret and leave no option active", () => {
    for (const key of ["Home", "End", "ArrowLeft", "ArrowRight"]) {
      check(key, false, {
        0: { closed: ["closed", "none", false], open: ["open", "none", false] },
        1: {
          closed: ["closed", "none", false],
          open: ["open", "none", false],
          "open@0": ["open", "none", false],
        },
        3: {
          closed: ["closed", "none", false],
          open: ["open", "none", false],
          "open@0": ["open", "none", false],
          "open@1": ["open", "none", false],
          "open@2": ["open", "none", false],
        },
      });
    }
  });

  it("Tab closes an open list and lets the focus move on", () => {
    check("Tab", false, {
      0: { closed: ["closed", "none", false], open: ["closed", "none", false] },
      1: {
        closed: ["closed", "none", false],
        open: ["closed", "none", false],
        "open@0": ["closed", "none", false],
      },
      3: {
        closed: ["closed", "none", false],
        open: ["closed", "none", false],
        "open@0": ["closed", "none", false],
        "open@1": ["closed", "none", false],
        "open@2": ["closed", "none", false],
      },
    });
  });

  it("leaves any other key alone", () => {
    for (const key of ["a", "Shift"]) {
      check(key, false, {
        0: { closed: ["closed", "none", false], open: ["open", "none", false] },
        1: {
          closed: ["closed", "none", false],
          open: ["open", "none", false],
          "open@0": ["open@0", "none", false],
        },
        3: {
          closed: ["closed", "none", false],
          open: ["open", "none", false],
          "open@0": ["open@0", "none", false],
          "open@1": ["open@1", "none", false],
          "open@2": ["open@2", "none", false],
        },
      });
    }
  });

  it("counts an active option outside the options as none", () => {
    const stale = stateOf("open@5");
    expect([
      keyed(stale, "ArrowDown", false, 3, "Clara"),
      keyed(stale, "ArrowUp", false, 3, "Clara"),
      keyed(stale, "Enter", false, 3, "Clara"),
    ]).toEqual([
      { state: stateOf("open@0"), action: "none", handled: true },
      { state: stateOf("open@2"), action: "none", handled: true },
      { state: stateOf("closed"), action: "enter", handled: true },
    ]);
  });
});

describe("typing", () => {
  it("opens with text and closes without, no option active either way", () => {
    expect([typed("C"), typed("Clara"), typed("")]).toEqual([
      stateOf("open"),
      stateOf("open"),
      stateOf("closed"),
    ]);
  });
});

describe("the announcement", () => {
  it("says what the list holds, or that a search runs", () => {
    expect([
      announcement(0, true),
      announcement(3, true),
      announcement(0, false),
      announcement(1, false),
      announcement(2, false),
      announcement(3, false),
    ]).toEqual(["Searching…", "Searching…", "No results", "1 result", "2 results", "3 results"]);
  });
});
