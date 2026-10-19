/**
 * What the built editor ships besides its own code: every npm package the
 * bundle contains, the canvas control icons copied from Svelte Flow and the
 * two bundled fonts, with their licences, shown in the About pane; the full
 * texts are in `THIRD_PARTY_NOTICES.txt` (`notices.ts`).
 * `tests/attributions.test.ts` builds the editor and requires this list and
 * that file to name exactly the packages found in the bundle.
 */

/** The file beside the built editor holding the full licence texts (`notices.ts` writes it). */
export const NOTICES_FILE = "THIRD_PARTY_NOTICES.txt";

export interface Attribution {
  /** The npm package name, or the name of a bundled asset. */
  readonly name: string;
  /** An SPDX licence expression, or the licence's own name for the drawing font. */
  readonly licence: string;
  /** The copyright lines of the licence file, every one of them. */
  readonly copyright: readonly string[];
  /** Whether `name` is an npm package (checked against the bundle) rather than an asset. */
  readonly package: boolean;
}

/** The licence of the bundled DejaVu Sans, the drawing font. */
export const FONT_LICENCE =
  "Bitstream Vera Fonts licence and Arev Fonts licence; DejaVu changes are in the public domain";

/** The licence of the bundled IBM Plex Mono, the inspector's title font. */
export const TITLE_FONT_LICENCE = "OFL-1.1";

const MIKE_BOSTOCK = "Copyright 2010-2021 Mike Bostock";
const WEBKID = "Copyright (c) 2019-2025 webkid GmbH";
const POBEREZKIN = "Copyright (c) 2017 Evgeny Poberezkin";

export const ATTRIBUTIONS: readonly Attribution[] = [
  {
    name: "@decimalturn/toml-patch",
    licence: "MIT",
    copyright: ["Copyright (c) 2019–2025 Tim Hall", "Copyright (c) 2025 Martin Leduc"],
    package: true,
  },
  {
    name: "@svelte-put/shortcut",
    licence: "MIT",
    copyright: ["Copyright (c) 2023-2024 Quang Phan"],
    package: true,
  },
  {
    name: "@timetoalign/timeskeleton",
    licence: "MIT",
    copyright: ["Copyright (c) 2026 Time to Align!"],
    package: true,
  },
  { name: "@xyflow/svelte", licence: "MIT", copyright: [WEBKID], package: true },
  { name: "@xyflow/system", licence: "MIT", copyright: [WEBKID], package: true },
  {
    name: "ajv",
    licence: "MIT",
    copyright: ["Copyright (c) 2015-2021 Evgeny Poberezkin"],
    package: true,
  },
  {
    name: "clsx",
    licence: "MIT",
    copyright: ["Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)"],
    package: true,
  },
  {
    name: "d3-color",
    licence: "ISC",
    copyright: ["Copyright 2010-2022 Mike Bostock"],
    package: true,
  },
  { name: "d3-dispatch", licence: "ISC", copyright: [MIKE_BOSTOCK], package: true },
  { name: "d3-drag", licence: "ISC", copyright: [MIKE_BOSTOCK], package: true },
  {
    name: "d3-ease",
    licence: "BSD-3-Clause",
    copyright: [MIKE_BOSTOCK, "Copyright 2001 Robert Penner"],
    package: true,
  },
  { name: "d3-interpolate", licence: "ISC", copyright: [MIKE_BOSTOCK], package: true },
  { name: "d3-selection", licence: "ISC", copyright: [MIKE_BOSTOCK], package: true },
  { name: "d3-timer", licence: "ISC", copyright: [MIKE_BOSTOCK], package: true },
  { name: "d3-transition", licence: "ISC", copyright: [MIKE_BOSTOCK], package: true },
  { name: "d3-zoom", licence: "ISC", copyright: [MIKE_BOSTOCK], package: true },
  { name: "esm-env", licence: "MIT", copyright: ["Copyright 2022 Benjamin McCann"], package: true },
  { name: "fast-deep-equal", licence: "MIT", copyright: [POBEREZKIN], package: true },
  {
    name: "fast-uri",
    licence: "BSD-3-Clause",
    copyright: [
      "Copyright (c) 2011-2021, Gary Court until https://github.com/garycourt/uri-js/commit/a1acf730b4bba3f1097c9f52e7d9d3aba8cdcaae",
      "Copyright (c) 2021-present The Fastify team <https://github.com/fastify/fastify#team>",
    ],
    package: true,
  },
  { name: "json-schema-traverse", licence: "MIT", copyright: [POBEREZKIN], package: true },
  {
    name: "svelte",
    licence: "MIT",
    copyright: [
      "Copyright (c) 2016-2025 [Svelte Contributors](https://github.com/sveltejs/svelte/graphs/contributors)",
    ],
    package: true,
  },
  {
    name: "yaml",
    licence: "ISC",
    copyright: ["Copyright Eemeli Aro <eemeli@gmail.com>"],
    package: true,
  },
  {
    name: "Icons of the canvas controls, from @xyflow/svelte",
    licence: "MIT",
    copyright: [WEBKID],
    package: false,
  },
  {
    name: "DejaVu Sans 2.37",
    licence: FONT_LICENCE,
    copyright: [
      "Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved.",
      "Copyright (c) 2006 by Tavmjong Bah. All Rights Reserved.",
    ],
    package: false,
  },
  {
    name: "IBM Plex Mono 2.5.0",
    licence: TITLE_FONT_LICENCE,
    copyright: ['Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"'],
    package: false,
  },
];
