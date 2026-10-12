/** Loading the YAML and TOML codecs on demand; derived in `README.md` ("The inspector"). */

import { expect, it } from "vitest";
import { FORMATS, isLoaded, loadCodec, writeText } from "../src/inspector/formats.ts";

it("has JSON at once and loads YAML and TOML on demand, once each", async () => {
  expect(FORMATS.map(isLoaded)).toEqual([true, false, false]);
  expect(() => writeText("yaml", null)).toThrow("the yaml codec is not loaded; await loadCodec");
  const [yaml, again] = await Promise.all([loadCodec("yaml"), loadCodec("yaml")]);
  expect(yaml).toBe(again);
  expect(FORMATS.map(isLoaded)).toEqual([true, true, false]);
  await loadCodec("toml");
  expect(FORMATS.map(isLoaded)).toEqual([true, true, true]);
});
