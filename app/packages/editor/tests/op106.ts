/**
 * The work bundle of Beethoven's Piano Sonata No. 29, Op. 106, as the
 * schema package's own tests pin it (`js/tests/description.test.ts`): a
 * manifest without timelines, one scheme and one link to the work with its
 * four movements, none represented. Written here in the minimal form.
 */

export const MB = "http://musicbrainz.org/work/";
export const WORK = `${MB}4a622b0d-b0c0-405e-b49e-05b70c108284`;
export const WORK_PAGE = "https://musicbrainz.org/work/4a622b0d-b0c0-405e-b49e-05b70c108284";
export const NAME = "Beethoven, Piano Sonata No. 29, Op. 106";
export const LABEL = "Piano Sonata No. 29 in B♭ major, Op. 106";
export const IMSLP = "http://www.wikidata.org/entity/P839";
export const OP_106 = "Piano_Sonata_No.29,_Op.106_(Beethoven,_Ludwig_van)";
export const SCHEME_NAME = "Works of Ludwig van Beethoven by opus number";
export const SERIES = "https://musicbrainz.org/series/004f17aa-0f46-4fec-b939-c5dfc849e5c6";
export const URIS = [
  WORK,
  "http://www.wikidata.org/entity/Q146730",
  "http://viaf.org/viaf/186299955",
];
export const MOVEMENTS: readonly (readonly [string, string])[] = [
  ["80cbaf7b-a1da-3fc5-b650-6eb72a803980", "I. Allegro"],
  ["7813c9cf-6054-3ef3-b9ed-8ae4690581c9", "II. Scherzo. Assai vivace"],
  ["7d110747-f011-41d4-9ce5-a1fad9abed2f", "III. Adagio sostenuto"],
  ["cfa82cd6-bcb5-39dd-9beb-c98e275c7c84", "IV. Introduzione. Largo – Allegro risoluto"],
];
export const EDITOR = {
  asserted_by: ["https://example.org/people/editor"],
  asserted_on: "2026-11-17",
  method: "manual",
  status: "confirmed",
};

/** The Op. 106 bundle in its minimal form. */
export const OP106 = {
  timetoshare: "0.2.0",
  name: NAME,
  timelines: [],
  schemes: [{ id: "mb_beethoven_opus", name: SCHEME_NAME, uri: [SERIES] }],
  links: [
    {
      relation: "pertains_to",
      level: "work",
      label: LABEL,
      uri: URIS,
      identifiers: [
        { scheme: IMSLP, value: OP_106 },
        { scheme: "mb_beethoven_opus", value: "op. 106" },
      ],
      parts_relation: "has_part",
      parts: MOVEMENTS.map(([mbid, label]) => ({
        uri: [`${MB}${mbid}`],
        label,
        absent: "not_represented",
      })),
      assertion: EDITOR,
    },
  ],
};
