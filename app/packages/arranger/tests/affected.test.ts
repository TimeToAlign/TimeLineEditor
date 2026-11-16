import type { ElementAddress, Part } from "@timetoalign/tilie-core";
import { addressKey, cardAddress, idAddress, TITLE_ADDRESS } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { affectedBy } from "../src/affected.ts";
import { A, blockIn, CHILD_MEMBER, load, MPM, numbersView } from "./support.ts";

/** The element address of `id`, with the part words `words` when given. */
const at = (id: string, ...words: Part[]): ElementAddress =>
  words.length === 0 ? idAddress(id) : { id, part: words };

/** The marks of a member's start and end on its ancestor line, each with its label. */
const marks = (id: string) => [
  at(id, "start"),
  at(id, "start", "label"),
  at(id, "end"),
  at(id, "end", "label"),
];

/** The named timestamps `ids`, each with its coordinate label, all they draw in these fixtures. */
const stamps = (...ids: string[]) => ids.flatMap((id) => [at(id), at(id, "coordinate")]);

/** `addresses` as a selection's element addresses, by their keys. */
const selected = (addresses: readonly ElementAddress[]) =>
  new Map(addresses.map((address) => [addressKey(address), address]));

/** The keys of `addresses`. */
const keysOf = (addresses: readonly ElementAddress[]) => new Set(addresses.map(addressKey));

describe("affectedBy", () => {
  it.each<[string, ElementAddress[], ElementAddress[]]>([
    ["nested", [at("clt_3")], [at("clt_2"), at("clt_2", "name")]],
    ["nested", [at("clt_2")], []],
    ["nested", [at("clt_3", "name")], [at("clt_3"), at("clt_2"), at("clt_2", "name")]],
    [
      "nested",
      [at("clt_1")],
      [
        at("clt_3"),
        at("clt_3", "name"),
        at("clt_2"),
        at("clt_2", "name"),
        ...stamps("timestamp_1", "timestamp_2"),
      ],
    ],
    [
      "nested",
      [at("clt_1", "name")],
      [
        cardAddress("clt_1"),
        at("clt_1"),
        at("clt_3"),
        at("clt_3", "name"),
        at("clt_2"),
        at("clt_2", "name"),
        ...stamps("timestamp_1", "timestamp_2"),
      ],
    ],
    ["map", [at("timestamp_1", "coordinate")], [at("timestamp_1")]],
    ["map", [at("phrase")], [at("ticks")]],
    ["map", [at("tempo")], []],
    ["with_region", [at("region_1", "label")], [at("region_1")]],
    ["nested", [], []],
  ])("%s with %j selected affects %j", (fixture, chosen, expected) => {
    expect(affectedBy(load(fixture), selected(chosen), null)).toEqual(keysOf(expected));
  });

  it.each<[string, string, ElementAddress[], ElementAddress[]]>([
    ["nested", "clt_3", [at("clt_3")], []],
    ["nested", "clt_3", [at("clt_3", "name")], []],
    ["nested", "clt_1", [at("clt_1", "name")], []],
    ["nested", "clt_1", [at("clt_1", "name"), at("clt_3")], [at("clt_2"), at("clt_2", "name")]],
    [MPM, "group_1", [at("group_1", "name")], []],
    [CHILD_MEMBER, "recording", [cardAddress("recording")], []],
  ])("%s with %s edited and %j selected affects %j", (fixture, edited, chosen, expected) => {
    expect(affectedBy(load(fixture), selected(chosen), edited)).toEqual(keysOf(expected));
  });

  it.each<[string, ElementAddress[], ElementAddress[]]>([
    ["numbers", [at("region_1", "label")], [at("region_1")]],
    ["numbers", [at("region_1")], []],
    [
      "numbers",
      [at("score")],
      [at("region_1"), at("region_1", "label"), ...stamps("timestamp_5", "timestamp_6")],
    ],
    [
      CHILD_MEMBER,
      [at("piece")],
      [
        cardAddress("second-half"),
        ...marks("second-half"),
        at("second-half"),
        at("second-half", "name"),
        ...stamps("timestamp_3", "timestamp_4"),
      ],
    ],
    [
      CHILD_MEMBER,
      [cardAddress("recording")],
      [at("recording"), at("recording", "name"), ...stamps("timestamp_1", "timestamp_2")],
    ],
    [MPM, [at("group_1")], []],
    [MPM, [at("group_1", "name")], [at("group_1")]],
    [MPM, [TITLE_ADDRESS], []],
  ])("with several roots, %s with %j selected affects %j", (fixture, chosen, expected) => {
    const manifest = fixture === "numbers" ? blockIn(numbersView(), A).manifest : load(fixture);
    expect(affectedBy(manifest, selected(chosen), null)).toEqual(keysOf(expected));
  });
});
