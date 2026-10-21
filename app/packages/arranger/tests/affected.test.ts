import type { ElementAddress, Part } from "@timetoalign/tilie-core";
import { addressKey, cardAddress, idAddress, TITLE_ADDRESS } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { affectedBy } from "../src/affected.ts";
import { A, blockIn, CHILD_MEMBER, load, MPM, numbersView } from "./support.ts";

/** The element address of `id`, with the part words `words` when given. */
const at = (id: string, ...words: Part[]): ElementAddress =>
  words.length === 0 ? idAddress(id) : { id, part: words };

const marks = (id: string) => [
  at(id, "start"),
  at(id, "start", "label"),
  at(id, "end"),
  at(id, "end", "label"),
];

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
    ["nested", [at("clt_1")], [at("clt_3"), at("clt_3", "name"), at("clt_2"), at("clt_2", "name")]],
    [
      "nested",
      [at("clt_1", "start")],
      [
        cardAddress("clt_1"),
        at("clt_1"),
        at("clt_1", "name"),
        at("clt_1", "start", "label"),
        at("clt_1", "end"),
        at("clt_1", "end", "label"),
        at("clt_3"),
        at("clt_3", "name"),
        at("clt_2"),
        at("clt_2", "name"),
      ],
    ],
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
    ["nested", "clt_1", [at("clt_1", "start")], []],
    ["nested", "clt_1", [at("clt_1", "start"), at("clt_3")], [at("clt_2"), at("clt_2", "name")]],
    [MPM, "group_1", [at("group_1", "name")], []],
    [CHILD_MEMBER, "recording", [cardAddress("recording")], []],
  ])("%s with %s edited and %j selected affects %j", (fixture, edited, chosen, expected) => {
    expect(affectedBy(load(fixture), selected(chosen), edited)).toEqual(keysOf(expected));
  });

  it.each<[string, ElementAddress[], ElementAddress[]]>([
    ["numbers", [at("region_1", "label")], [at("region_1")]],
    ["numbers", [at("region_1")], []],
    ["numbers", [at("score")], [at("region_1"), at("region_1", "label")]],
    [
      CHILD_MEMBER,
      [at("piece")],
      [
        cardAddress("second-half"),
        ...marks("second-half"),
        at("second-half"),
        at("second-half", "name"),
      ],
    ],
    [
      CHILD_MEMBER,
      [cardAddress("recording")],
      [at("recording"), at("recording", "name"), ...marks("recording")],
    ],
    [MPM, [at("group_1")], []],
    [MPM, [at("group_1", "name")], [at("group_1")]],
    [MPM, [TITLE_ADDRESS], []],
  ])("with several roots, %s with %j selected affects %j", (fixture, chosen, expected) => {
    const manifest = fixture === "numbers" ? blockIn(numbersView(), A).manifest : load(fixture);
    expect(affectedBy(manifest, selected(chosen), null)).toEqual(keysOf(expected));
  });
});
