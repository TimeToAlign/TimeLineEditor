# Changelog

Release entries are written by release-please from the Conventional Commits since the previous release.

## [0.4.0](https://github.com/TimeToAlign/TimeLineEditor/compare/v0.3.0...v0.4.0) (2026-11-21)


### ⚠ BREAKING CHANGES

* `displayValue`, `unitSymbol` and `copyValueWithUnit` are removed from @timetoalign/tilie-core in favour of `prettyText`, `prettyUnit` and `rawText`; the font licence export is now `TEXT_FONT_LICENCE` beside `MUSIC_FONT_LICENCE`.
* the root start/end marker addresses no longer exist; core's `TimestampSpec`, `PinRow`, `snapPosition` and `timestampPlace` and the arranger's `timestampSpec` are replaced by the cross-section API (`CrossSectionSpec`, `Row`, `snapOnRow`, `namedPin`).
* the workspace setting `granularity` is now `{denominator, decimals}`; a file stating the former shape is read with the defaults. core's `gridStep`, `gridText` and `GridInUse` are removed in favour of `snapPosition(p, h, numberType, length, granularity)`.
* workspace format 7 keeps grid, block defaults and granularity in a settings section outside the journal; format 6 files are refused.
* the workspace file format is version 6; every block and the block defaults carry `margin`, and a version-5 file is refused.

### Features

* add an Examples menu and leave the fixture menu out of release builds ([3d8b870](https://github.com/TimeToAlign/TimeLineEditor/commit/3d8b870bef3603eca35441d44a92a673b76dc510))
* add an Examples menu and leave the fixture menu out of release builds ([#7](https://github.com/TimeToAlign/TimeLineEditor/issues/7)) ([1798487](https://github.com/TimeToAlign/TimeLineEditor/commit/1798487c0a25455623fa99ef1c1ee858c88e1a62))
* an accessible combobox after the WAI-ARIA pattern ([109500e](https://github.com/TimeToAlign/TimeLineEditor/commit/109500e9035e7fa05379e99b2e54e7fcc6d8a0a1))
* **arranger:** export one screen order and write each overlay path once ([c546c22](https://github.com/TimeToAlign/TimeLineEditor/commit/c546c228261094e7e57f0ea2ad8805802db8a6e3))
* **arranger:** show the MatchClaim table's potential MatchStamps with m ([ea462aa](https://github.com/TimeToAlign/TimeLineEditor/commit/ea462aaf8a6da6c217b68a11888a1d509814f6fd))
* **arranger:** take one MatchClaim overlay per block and pin MatchStamps with their block ([a9aaf18](https://github.com/TimeToAlign/TimeLineEditor/commit/a9aaf18629da208810ee9b38076ffd35d4b7d639))
* **core:** hold, set and keep the links and schemes of manifests ([2617234](https://github.com/TimeToAlign/TimeLineEditor/commit/26172346e0ebc14e54d4f6b0a66705cd1e076360))
* **core:** index the AlignmentAnchors of a MatchClaim table and check named MatchStamps against it ([2f20b80](https://github.com/TimeToAlign/TimeLineEditor/commit/2f20b802389210f187249d869a9a16f0ef73cf52))
* **core:** name, update and remove MatchStamps; per-block MatchClaim filter ([75eda9d](https://github.com/TimeToAlign/TimeLineEditor/commit/75eda9de444f4b72da55458f09bf2133e71db56d))
* **core:** read and write manifest files with #id references ([465da1f](https://github.com/TimeToAlign/TimeLineEditor/commit/465da1f2baf772175c607005841fd81564af15bb))
* **core:** read links where they will lie and walk them in one place ([c890746](https://github.com/TimeToAlign/TimeLineEditor/commit/c89074694c0981e35845cd2479a8852889fbb487))
* **core:** show user_units as uu ([6779e19](https://github.com/TimeToAlign/TimeLineEditor/commit/6779e1903bd5c6ff9aac09a655bc85438a489941))
* css_pixels and user_units graphical units ([e420475](https://github.com/TimeToAlign/TimeLineEditor/commit/e420475c20a168ab22a1a2b1ba7695dca83601fa))
* **editor:** ask before dropping a MatchClaim table changed by a belief ([1a5acf5](https://github.com/TimeToAlign/TimeLineEditor/commit/1a5acf5ce914693c0010ff379a3214ac693d5be1))
* **editor:** drop the Metadata tab's "Stated higher up" drawer ([2e71761](https://github.com/TimeToAlign/TimeLineEditor/commit/2e717619e323b92328763927509acc86672ec4d1))
* **editor:** list YAML first in the format switches and show it by default ([00316ba](https://github.com/TimeToAlign/TimeLineEditor/commit/00316ba10963b99d20d82607d19c46d8964aff09))
* **editor:** load MatchClaim tables through the server and add the Matchstamp tab ([c83d248](https://github.com/TimeToAlign/TimeLineEditor/commit/c83d248eecd6bb83a6a126d317b87e4a8354a7a6))
* **editor:** Metadata tab on candidates and beliefs, collapsed tiles with per-pair details ([b3c29a1](https://github.com/TimeToAlign/TimeLineEditor/commit/b3c29a128bac51da7b43f861659f32444a24d8f1))
* **editor:** show and edit the links of a bundle, timeline or region in a Metadata tab ([edc6de3](https://github.com/TimeToAlign/TimeLineEditor/commit/edc6de3052cffd02df0e02cd55e0bff1beba315f))
* **editor:** show MatchClaim provenance and record the user's beliefs ([f9faf32](https://github.com/TimeToAlign/TimeLineEditor/commit/f9faf3210f8d99fab3fc2c6bddbf71d7c225be4c))
* **editor:** state a chosen status as the viewer's own assertion ([4892bf1](https://github.com/TimeToAlign/TimeLineEditor/commit/4892bf190b38eefd4ae043877e5bb154ae800683))
* **layout:** draw the alignment anchors of named MatchStamps ([e7f9074](https://github.com/TimeToAlign/TimeLineEditor/commit/e7f9074ba0d939402c878e5f0793229f0a9d8a7f))
* let a timeline join several groups and edit memberships in the inspector ([98ae8fe](https://github.com/TimeToAlign/TimeLineEditor/commit/98ae8fecb2751cdd084055e242f184e7940d66bb))
* let a timeline join several groups and edit memberships in the inspector ([#9](https://github.com/TimeToAlign/TimeLineEditor/issues/9)) ([a591a6a](https://github.com/TimeToAlign/TimeLineEditor/commit/a591a6aaca8d8b0beefbf3a7a1571da950cd135a))
* look up values in Wikidata, the GND, YouTube and MusicBrainz ([43c8783](https://github.com/TimeToAlign/TimeLineEditor/commit/43c87831080af111c6c91113d2ae95e4e790369e))
* MusicBrainz lookup through a Reconciliation Service API endpoint ([569d6b2](https://github.com/TimeToAlign/TimeLineEditor/commit/569d6b277d0e6eee4982ec0ed783e1ea300f0903))
* name elements in messages and the Journal by kind and name ([ba065e5](https://github.com/TimeToAlign/TimeLineEditor/commit/ba065e5bab773dbb26803fa502cb5581cea61f60))
* name timestamps, edit them in the Timestamp tab and draw their cross-section lines ([154a985](https://github.com/TimeToAlign/TimeLineEditor/commit/154a9853cb1ca489729ba23da5beca5b8eb46885))
* pick a statement's element on the canvas and propose matches in bulk ([29c7a2a](https://github.com/TimeToAlign/TimeLineEditor/commit/29c7a2af80080742be95acea47db4566f14f4352))
* read a timestamp as the cross-section of its timeline and store what is drawn of it ([d68e198](https://github.com/TimeToAlign/TimeLineEditor/commit/d68e198f355b9124129d45915b630ececaf51b70))
* read manifest files in YAML and JSON and write each back as it came ([466b673](https://github.com/TimeToAlign/TimeLineEditor/commit/466b673c16cb95d3acde7421af27e40dd8866d20))
* **server:** answer a MatchClaim table as aligned typed arrays checked against its manifest ([807d885](https://github.com/TimeToAlign/TimeLineEditor/commit/807d885a1daa44e92520050c770bb3aa6f167311))
* **server:** expand a manifest's measure maps on request ([074c74e](https://github.com/TimeToAlign/TimeLineEditor/commit/074c74e8ec4d83eb8a11bb6f67da53619888772b))
* **server:** listen on port 8000 unless another port is asked for ([a673af0](https://github.com/TimeToAlign/TimeLineEditor/commit/a673af04c26a1eefc63e68ee69051d01e8229940))
* **server:** read MatchClaim provenance on demand and record a belief in a new table ([ea593ff](https://github.com/TimeToAlign/TimeLineEditor/commit/ea593ff101a92abccc41759b8dd1e65e8f29b1da))
* show coordinates under the pointer and pin them in a Timestamp tab ([7b89306](https://github.com/TimeToAlign/TimeLineEditor/commit/7b89306fcd3d7ea4b8de2cdd41f894e2986a787f))
* statements and provenance on bundles, timelines and regions replace links ([81c9aa6](https://github.com/TimeToAlign/TimeLineEditor/commit/81c9aa6c9f1564d3802d5aebf18e30ceed64cbf6))
* stretch one-content containers by a margin, place imports beside blocks ([efbd1c0](https://github.com/TimeToAlign/TimeLineEditor/commit/efbd1c08ef453a246a77ae172f1f3fcce648fe2d))
* the Metadata tab states property–value pairs in rectangles ([9bbf821](https://github.com/TimeToAlign/TimeLineEditor/commit/9bbf8211c82ae97ee8895579f68fc368af24ad72))
* type profiles as application settings, exchanged as YAML ([c6f1ffc](https://github.com/TimeToAlign/TimeLineEditor/commit/c6f1ffcb50a8f041d1fc508a071e9faf752c261d))
* write a coordinate raw or pretty, copy it three ways, and draw musical symbols in Noto Music ([0e610c4](https://github.com/TimeToAlign/TimeLineEditor/commit/0e610c48f99d977a166d7d54e86f35cca953d38b))


### Bug Fixes

* **core:** delete a match timestamp's name when it is set to null ([7003c57](https://github.com/TimeToAlign/TimeLineEditor/commit/7003c57f2c12af2c7d9be1032dad4c7b93ccae7b))
* **core:** hold only a manifest's own prefixes; add the context at the file boundary ([6d80d4d](https://github.com/TimeToAlign/TimeLineEditor/commit/6d80d4d6cce34b33d9ae64c49b8b0f6d6411c4f1))
* **core:** refuse wrong positions and repeated claim IDs in MatchClaim columns ([2f6b066](https://github.com/TimeToAlign/TimeLineEditor/commit/2f6b066850c2af8dc41c33fcb5d95b991790047b))
* **core:** store a canvas number given as -0 as 0 ([e1d0e56](https://github.com/TimeToAlign/TimeLineEditor/commit/e1d0e565501efbbfeccd639613403e1564d110fc))
* **e2e:** answer the restore question after reloading an unsaved workspace ([9b1279f](https://github.com/TimeToAlign/TimeLineEditor/commit/9b1279fee5e4d5569c6844becf11da56bf7bd89e))
* **e2e:** look up the Properties tab's Name field inside its tab panel ([0de180e](https://github.com/TimeToAlign/TimeLineEditor/commit/0de180e30b570c552eab7bfbefca4d1d93ebeb06))
* **e2e:** paste into the composer in Firefox too ([d40826b](https://github.com/TimeToAlign/TimeLineEditor/commit/d40826b1760d262ac6f895c19a3435211a4b709d))
* **editor:** compare actors as expanded IRIs and name the whole MatchStamp ([2b9316c](https://github.com/TimeToAlign/TimeLineEditor/commit/2b9316c13da00ef31719cb48b7b9a94969b044ec))
* **editor:** name MatchStamps and alignment anchors in the inspector and journal ([252bd8d](https://github.com/TimeToAlign/TimeLineEditor/commit/252bd8df4936950943519d1df540be4bc9a41ef6))
* **editor:** read the Manifest tab's YAML as Import does and keep a text Apply leaves unchanged ([eabc724](https://github.com/TimeToAlign/TimeLineEditor/commit/eabc72425a491480d143fe2610f74a39ac3efdd7))
* **editor:** say that no server answered when measure maps cannot be fetched ([baf292b](https://github.com/TimeToAlign/TimeLineEditor/commit/baf292b23655f594a76a3f4e9c653d5c78d94645))
* **editor:** write the Details word as button text and name no publisher ([feadf10](https://github.com/TimeToAlign/TimeLineEditor/commit/feadf10fa8c8297ee7fc61d06c860274af7b1087))
* expand measure maps in development and import fixtures as examples ([bec86c3](https://github.com/TimeToAlign/TimeLineEditor/commit/bec86c3e73db84eb2b09dc839f4d4d8dc1e1da65))
* explicit rejection, one-press Escape and stable drawer keys in the Metadata tab ([ee868df](https://github.com/TimeToAlign/TimeLineEditor/commit/ee868dff0444f343d114ca8607c4923821ec78a6))
* list alignment anchors among the drawn elements and keep one belief filter in core ([c89016b](https://github.com/TimeToAlign/TimeLineEditor/commit/c89016b8fef634fc0f49a943f525bd9e9fe3b69d))
* **server:** read posted manifests in any serialization and answer with bare IDs ([d02ba77](https://github.com/TimeToAlign/TimeLineEditor/commit/d02ba775fe3cadaaddc860c3c68cd42fec4a35b2))
* **server:** record a MatchClaim belief with add_match_claim_belief ([d75e1e3](https://github.com/TimeToAlign/TimeLineEditor/commit/d75e1e371482c830ceac03fee4573a098eb00a1f))
* **server:** record beliefs through timetoalign and compare actors as expanded IRIs ([d620f53](https://github.com/TimeToAlign/TimeLineEditor/commit/d620f5342900946c1df49363b0d6cf25b96ed6bf))
* the Manifest tab shows the manifest as Export writes it ([3696855](https://github.com/TimeToAlign/TimeLineEditor/commit/3696855ac7a738ce824d77e0896ca491aca74c00))
* type profiles in the File menu, stored only where the host says; picking holds the canvas ([880a7a4](https://github.com/TimeToAlign/TimeLineEditor/commit/880a7a41b604bbbe2af1f516d9649146ac4c4249))


### Performance Improvements

* **arranger:** keep the match hover cheap and the flags in one shell ([0c17f1b](https://github.com/TimeToAlign/TimeLineEditor/commit/0c17f1b83a8c35b6780d1c9e1861ecb1cee07ac5))
* **core:** hold a checked manifest without reading its IDs back from the file form ([a4d17ac](https://github.com/TimeToAlign/TimeLineEditor/commit/a4d17acb3d085b0f09e80cba68fa6d9744365dcb))
* draw each placement of a block once while resizing ([128d3a9](https://github.com/TimeToAlign/TimeLineEditor/commit/128d3a9ca007f3e372f711019056f98275c72ede))

## [0.3.0](https://github.com/TimeToAlign/TimeLineEditor/compare/v0.2.0...v0.3.0) (2026-10-22)


### ⚠ BREAKING CHANGES

* address elements by objects and accept free ids unique across a manifest
* manifests and workspace files must carry the marker "timetoshare": "0.1.0"; a file with the marker "timeskeleton" is refused as not a TimeToShare manifest.
* read the revised manifest with abstract conversion maps, measure maps and flow-control elements
* the workspace file is format version 3, which adds `sessions` and a session entry kind to the journal and `places` and `bands` to every block; version 2 files are refused.

### Features

* address elements by objects and accept free ids unique across a manifest ([d732333](https://github.com/TimeToAlign/TimeLineEditor/commit/d732333ba2e429528fb66f00a6204b095a85a57f))
* bands as units, drawn per timeline and moved in the timeline editor ([1aef4ae](https://github.com/TimeToAlign/TimeLineEditor/commit/1aef4aebc270249c831d6b55845e9623ed603198))
* draw a timeline in several groups with one card per group ([ec38bc1](https://github.com/TimeToAlign/TimeLineEditor/commit/ec38bc18904649a168cd10fcc4995da5bb964842))
* edit bundles, groups and timelines in editors on the canvas ([2dc066b](https://github.com/TimeToAlign/TimeLineEditor/commit/2dc066bd18b346872cd3b0742a6f1796f6f6b2c6))
* edit group and bundle blocks, drawn with cards, frames and ancestor lines ([d0393c1](https://github.com/TimeToAlign/TimeLineEditor/commit/d0393c158a4e344096d5d3cc719f76e1d2903c43))
* hold one manifest shape per block, with segment delete, unknown length and unknown-key warnings ([e54e60a](https://github.com/TimeToAlign/TimeLineEditor/commit/e54e60a3e1fcae7c506bca32514f0c87f77af4d4))
* level tab, workspace name, gap spacing and editor selection fixes ([9aa5fe8](https://github.com/TimeToAlign/TimeLineEditor/commit/9aa5fe863ecc5de2d9028b14d517190046222a83))
* mark every box around the selection, thinning outward, and name every inspected element ([bbd82f8](https://github.com/TimeToAlign/TimeLineEditor/commit/bbd82f8465da1d5b65e54ec4552320e719bd7b97))
* read and write TimeToShare 0.1.0 manifests ([1b20731](https://github.com/TimeToAlign/TimeLineEditor/commit/1b20731fac17ecd9e092cc62fd7ccf76f773cf05))
* read the revised manifest with abstract conversion maps, measure maps and flow-control elements ([8a41908](https://github.com/TimeToAlign/TimeLineEditor/commit/8a419085fc5e9ab0f51508d53769a618e7d1f543))
* resize every box alike, undo one change at a time, edit each element's geometry ([03b738f](https://github.com/TimeToAlign/TimeLineEditor/commit/03b738f8d234b4261574fd2143f32d63294eff6a))
* select the box a press hits, refuse segment Delete, show a disabled Locked checkbox ([54e322f](https://github.com/TimeToAlign/TimeLineEditor/commit/54e322fe6510a3f1bc456205f4819c9e7911db0c))
* split the inspector into Properties and Manifest tabs, with a minimal view ([a8d46a4](https://github.com/TimeToAlign/TimeLineEditor/commit/a8d46a41b19e19cb295842f1d6a69a60d5818c9c))
* stretch every box vertically and keep requested margins in proportion ([64f1a95](https://github.com/TimeToAlign/TimeLineEditor/commit/64f1a950a5f3121f2530d26ffba9dcb129c35c6c))
* undo closed editor sessions by runs, move a multi-selection in the bundle editor ([4f0c747](https://github.com/TimeToAlign/TimeLineEditor/commit/4f0c7476755f11769c5f569fe4ebbd363d380462))


### Bug Fixes

* mark a group frame that holds the selection, and show Locked as a plain readable checkbox ([6c2eea5](https://github.com/TimeToAlign/TimeLineEditor/commit/6c2eea5744666a668b5dc5840f5ddecf82dd5166))

## [0.2.0](https://github.com/TimeToAlign/TimeLineEditor/compare/v0.1.0...v0.2.0) (2026-10-12)


### ⚠ BREAKING CHANGES

* the 24 earlier commands are replaced by `add`, `set`, `remove` and `style`; workspace values hold `blocks`; manifests follow timeskeleton 0.5.0.
* block records and commands use `scale` for the drawing scale; `zoom`, `margins`, `background` and `nameColumn` are no longer accepted.
* draw manifests per the TimeSkeleton drawing specification
* separate the workspace, its blocks and their manifests

### Features

* arrange blocks on a Svelte Flow canvas ([0ad0eeb](https://github.com/TimeToAlign/TimeLineEditor/commit/0ad0eebf5814dbd6d2de932f90b9f66bc2a83126))
* **core:** the editable TimeSkeleton document with commands, invariants and a Yjs binding ([ac427a7](https://github.com/TimeToAlign/TimeLineEditor/commit/ac427a77ef9d5e2a79bba865f5ec5d9dcb43efc5))
* draw manifests per the TimeSkeleton drawing specification ([4801604](https://github.com/TimeToAlign/TimeLineEditor/commit/480160475f47150e062f48046c3a253236fa1bbf))
* edit the workspace through four addressed commands and a journal ([f86591f](https://github.com/TimeToAlign/TimeLineEditor/commit/f86591ffa7bfc7161a783b29ffc15196f98b8836))
* lay out TimeSkeleton documents and write them as SVG and TikZ ([0218776](https://github.com/TimeToAlign/TimeLineEditor/commit/0218776c0e4b3f23fada5e2e01a79a6d62dc1735))
* open, save, import and inspect workspaces in the editor ([2011c6a](https://github.com/TimeToAlign/TimeLineEditor/commit/2011c6a931b6964626c1e3bed93a2f469ce7f42f))
* rename zoom to scale and draw per the revised specification ([1a18f0b](https://github.com/TimeToAlign/TimeLineEditor/commit/1a18f0b81e9885c19bf5c68476a9c5099632a6a0))
* separate the workspace, its blocks and their manifests ([9723c6c](https://github.com/TimeToAlign/TimeLineEditor/commit/9723c6c01796f5a58a95d1abbb34c93ee508f22f))


### Bug Fixes

* **editor:** keep the selection in step with the canvas and make the placement form follow gestures ([91dbaed](https://github.com/TimeToAlign/TimeLineEditor/commit/91dbaedf0bc9bccdfee54b4f48252516d0f341b7))

## [0.1.0] - 2026-10-10

### Added

- A pnpm TypeScript workspace with six packages and an enforced dependency ladder.
- A Svelte 5 browser shell with Arranger, Inspector, and Diagnostics panes and a health readout.
- A FastAPI local server with token, Host, and Origin protections, `/api/health`, static app serving, and the `tilie` command.
- Python and TypeScript test gates, dependency checks, release version checking, CI, wheel bundling, and PyPI trusted-publishing workflow configuration.
- Architecture decisions for the selected tools and distribution design.
- `Referrer-Policy: no-referrer` on every server response.

### Changed

- `tilie` hands the run's token to the editor in the URL fragment (`/#token=…`) instead of the query, so it never reaches the server's access log; the editor removes it from the address bar and the history entry.
- The `tilie-server` classifier is `Development Status :: 3 - Alpha`.
- The server manifest declares compatible ranges for its runtime and build dependencies (`fastapi>=0.141,<1`, `uvicorn[standard]>=0.53,<1`, `hatchling>=1.32`); `uv.lock` keeps the exact resolved versions.
