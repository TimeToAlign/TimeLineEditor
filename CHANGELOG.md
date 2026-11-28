# Changelog

Release entries are written by release-please from the Conventional Commits since the previous release.

## [0.4.0](https://github.com/TimeToAlign/TimeLineEditor/compare/v0.3.0...v0.4.0) (2026-11-28)


### ⚠ BREAKING CHANGES

* `MeasureKnot` no longer has `next`.
* **layout:** a manifest whose jumps carry a label of their own and destinations without one is drawn with the destinations' manifestations on its arcs.
* **core:** a set command giving a flow-control element a provenance is refused (wrong_target_kind); give it a belief.
* a manifest or a workspace holding flow control in the earlier form (`type`, `target`) is refused on reading; TimeToShare's `scripts/convert_flow_control.py` converts a manifest.

### Features

* answer the findings of every flow convention with their cause ([3dd48b7](https://github.com/TimeToAlign/TimeLineEditor/commit/3dd48b7a21b965e4a78a57826b0f7ad4987ca0c5))
* **arranger:** arrange blocks and items, reordering them by drag and key ([451809e](https://github.com/TimeToAlign/TimeLineEditor/commit/451809ee6c82c2fd07e2026ca9d5fcb3c5ac0eee))
* **arranger:** drag handles on a selected region's brace ([bb35d1f](https://github.com/TimeToAlign/TimeLineEditor/commit/bb35d1f6ae6b6591af08f0c7a74598e5a7891690))
* **arranger:** draw a block in its arrangement and read a root drawn once behind every group of its row ([a3396d7](https://github.com/TimeToAlign/TimeLineEditor/commit/a3396d7787822fb438d2d421e982a651fb5ebbd4))
* **arranger:** edit elisions as gaps with a coordinates and width mode menu ([2ceb4a8](https://github.com/TimeToAlign/TimeLineEditor/commit/2ceb4a8f2614c71471948aff452eeb40d9c94043))
* **arranger:** flow editor rows keep their order, gaps are typed in their row ([5fb8c0d](https://github.com/TimeToAlign/TimeLineEditor/commit/5fb8c0db3bca6e767093e3f6100a3e1408086667))
* **arranger:** FlowMap rows pan with the canvas, place at their rows, add gaps at once ([cb91377](https://github.com/TimeToAlign/TimeLineEditor/commit/cb91377a82ef25e5b7ecb435dc71e27287df1975))
* **arranger:** hide virtual cards on Delete and edit hand-made FlowMaps in place ([242b24b](https://github.com/TimeToAlign/TimeLineEditor/commit/242b24bd32b6de9f0e50ce38e99029353722b065))
* **arranger:** list every timeline and map a timestamp's line crosses in its card ([2daa44c](https://github.com/TimeToAlign/TimeLineEditor/commit/2daa44ccc83753d600a3b09148151762816a021c))
* **arranger:** make a frame's flow switch one undo step ([c1ea515](https://github.com/TimeToAlign/TimeLineEditor/commit/c1ea51585dec97062529528babc64ba2fcbc6099))
* **arranger:** move elided cards sideways and unfold a shown ancestor card ([f04fa67](https://github.com/TimeToAlign/TimeLineEditor/commit/f04fa6725193a1936a24d41628d265848d18cd74))
* **arranger:** open the flow editor from a root card's flow control band ([330e21f](https://github.com/TimeToAlign/TimeLineEditor/commit/330e21fa762df9b444a5a70bafa63090070ab342))
* **arranger:** pack arranged blocks from the top left of their places ([3d9f189](https://github.com/TimeToAlign/TimeLineEditor/commit/3d9f1898840558fb84a183e20f3d67bc3ea2c184))
* **arranger:** read ancestor lines and keep covered card lines unread ([7724e05](https://github.com/TimeToAlign/TimeLineEditor/commit/7724e05aa572c8dc4620f2a4f97afa914e6c311c))
* **arranger:** ribbons, flow rows on the coordinate flag and the flow switch ([bc84703](https://github.com/TimeToAlign/TimeLineEditor/commit/bc84703edae1b8ec483a7e61a2ccf405dad0eb48))
* **arranger:** select, drag and key the strips of elisions on the canvas ([5948dc1](https://github.com/TimeToAlign/TimeLineEditor/commit/5948dc1e66c80fd80014b27f76dfda6913ec82d7))
* **arranger:** show a child's flow control as a read-only band in its timeline editor ([7f4e741](https://github.com/TimeToAlign/TimeLineEditor/commit/7f4e74133b728d53b3d46a688b47fc5d4355ba87))
* **arranger:** show a chunk's ribbons over its segment, brace and written section ([ce22063](https://github.com/TimeToAlign/TimeLineEditor/commit/ce220632a528be1281957d4bf04136674e4f8cb6))
* **arranger:** show a cut name whole on hover and cut the flow rows' names ([c560f5e](https://github.com/TimeToAlign/TimeLineEditor/commit/c560f5e8a3fa2dc37680ebf7136c0c0cf867d690))
* **arranger:** show a flag while a region handle is dragged ([88e7e4c](https://github.com/TimeToAlign/TimeLineEditor/commit/88e7e4cc07404bfdfe428c83fd8dca2fd0897867))
* **arranger:** the flow editor, a pane of a root's FlowMaps under its card ([19d0e6b](https://github.com/TimeToAlign/TimeLineEditor/commit/19d0e6b118486a3d3faf25b17e8df3451143df22))
* **arranger:** unfold a raised ancestor card out of its member card ([4a82c26](https://github.com/TimeToAlign/TimeLineEditor/commit/4a82c2600e89e9bcc541e5e0a968755caf500170))
* ask before a deletion everywhere, and hide a root instead of deleting it ([85b286e](https://github.com/TimeToAlign/TimeLineEditor/commit/85b286edf3e40b51d2eda9dc4ac6bef2548a31f0))
* **client:** call the server's flow routes ([809375e](https://github.com/TimeToAlign/TimeLineEditor/commit/809375e36755812ca93fd550880e21067a47b932))
* **client:** name who asks when a timeline's flows are written again ([52af612](https://github.com/TimeToAlign/TimeLineEditor/commit/52af612715152f2930f769d395f6fb6f8363e164))
* **core:** accept elisions on virtual timelines ([58d5a1f](https://github.com/TimeToAlign/TimeLineEditor/commit/58d5a1fd706f46bebef14659602abad4b019cfa6))
* **core:** add, edit, address and list elisions ([e1c5ad8](https://github.com/TimeToAlign/TimeLineEditor/commit/e1c5ad8981db05ab5490ddbe2e19063615e41332))
* **core:** arrange a bundle's items and the workspace's blocks ([dbb5fa1](https://github.com/TimeToAlign/TimeLineEditor/commit/dbb5fa1e29c0f3f36a8627c16a47ee5114be3996))
* **core:** band orders and arrangements of virtual timelines; ID prefixes in one place ([86c9623](https://github.com/TimeToAlign/TimeLineEditor/commit/86c96235ee1c5543a99ec2105b2af094be63dfae))
* **core:** carry a manifest's elisions through unchanged ([bbdbce2](https://github.com/TimeToAlign/TimeLineEditor/commit/bbdbce29c5aa865a2584203c23336bf84b379692))
* **core:** commands over FlowMaps and virtual timelines, and the flow editor ([a4d3ac0](https://github.com/TimeToAlign/TimeLineEditor/commit/a4d3ac0db04fe78f8a92923f9388cb517713ae60))
* **core:** find a destination's section start among the section breaks of the whole tree ([36bf633](https://github.com/TimeToAlign/TimeLineEditor/commit/36bf63327aef2463b7c21324b947d865f703f62d))
* **core:** join a split bar numbered as two measures into one floating measure ([4e8ed5a](https://github.com/TimeToAlign/TimeLineEditor/commit/4e8ed5a856a0ea0348e0792d4e5bfa53998a1cce))
* **core:** list conversion maps and flow control on switched cards ([22c4353](https://github.com/TimeToAlign/TimeLineEditor/commit/22c435306468e74a40e62f2fa16888585d0b8f44))
* **core:** list switched cards and frames unfolded onto their FlowMap ([3978eb4](https://github.com/TimeToAlign/TimeLineEditor/commit/3978eb4388ce46a57637ec3fc8958fd30bdf46f6))
* **core:** list the symbols, brackets and label stacks of flow control ([af51707](https://github.com/TimeToAlign/TimeLineEditor/commit/af51707748d59a191840a0a350f8303ff7776d07))
* **core:** list virtual cards, their chunks and timestamps as drawn elements ([7bd40d8](https://github.com/TimeToAlign/TimeLineEditor/commit/7bd40d883af35e517250998731d6103c3af5cdc1))
* **core:** make several commands one undo step with Store.edit ([97cf5e2](https://github.com/TimeToAlign/TimeLineEditor/commit/97cf5e2786a9528bf78aa1b2dc3633d7c2d2821b))
* **core:** match a selector's class against the classes a region's type statement names ([1e50759](https://github.com/TimeToAlign/TimeLineEditor/commit/1e5075942ac27a5809c451374c5fd44473458cbf))
* **core:** mint random IDs in dispatch and journal them in the command ([eb2e022](https://github.com/TimeToAlign/TimeLineEditor/commit/eb2e0229830e2df05a0c6b3c8cc85fef1d91257a))
* **core:** read the rows of one measure number as one floating measure ([d10f5af](https://github.com/TimeToAlign/TimeLineEditor/commit/d10f5affab2209b1450dde4090e269ca8bd7d50a))
* **core:** recompute a computed FlowMap in place, its virtual timelines' lengths following ([a7011d5](https://github.com/TimeToAlign/TimeLineEditor/commit/a7011d59e5fe6275e6264de17e6edaec79df8674))
* **core:** resolve FlowMaps and virtual timelines without a server ([dd01483](https://github.com/TimeToAlign/TimeLineEditor/commit/dd01483e61d96a2f2d4441ae7066b20fa3312996))
* **core:** say what the place of a jump's destination names ([db2219d](https://github.com/TimeToAlign/TimeLineEditor/commit/db2219d2a6627c3a97fedc49ded7658fa46d4007))
* **core:** tell card elisions from group elisions and list gaps as drawn ([040d5d9](https://github.com/TimeToAlign/TimeLineEditor/commit/040d5d9162b4cb1a870e8cd81fced3e7497b6dd6))
* **core:** the flow-control editor edits the flow-control elements of its root's tree ([e15242c](https://github.com/TimeToAlign/TimeLineEditor/commit/e15242c8e483b93e814ced42fffdc81b6fd44992))
* draw a band shown explicitly as present though empty ([53bd5d7](https://github.com/TimeToAlign/TimeLineEditor/commit/53bd5d7540b7d975f3a25e188486d50e288487b0))
* draw a FlowMap's line as a segment line of its chunks, with windows onto their sources ([9f68fbb](https://github.com/TimeToAlign/TimeLineEditor/commit/9f68fbb6b661bf37896bc66fcb791ca9620b98ea))
* edit what a virtual card's windows show in the virtual card's own editor ([2ebe05a](https://github.com/TimeToAlign/TimeLineEditor/commit/2ebe05ae671f4c1a22590f56e85927dca403e014))
* **editor:** add jumps, endings and their destinations from the Flow control tab ([9f1a948](https://github.com/TimeToAlign/TimeLineEditor/commit/9f1a9483cff9e1d4d83e469546bd8585e7e66360))
* **editor:** ask before a deletion that also deletes virtual timelines ([5086781](https://github.com/TimeToAlign/TimeLineEditor/commit/50867815a7297573030418d093ef39c13757635e))
* **editor:** band toggles reach a timeline or its whole tree, never disabled ([26511d3](https://github.com/TimeToAlign/TimeLineEditor/commit/26511d30c37e107ff9dca6751c9309b50c1b6b0f))
* **editor:** children editor, adding flow control, and the flow editor's tab ([adf1621](https://github.com/TimeToAlign/TimeLineEditor/commit/adf162169479233a72e9b75c420c79069bbd9058))
* **editor:** declare each display control once and disable the ones that change nothing ([20a68bd](https://github.com/TimeToAlign/TimeLineEditor/commit/20a68bde33db0d415131641bc204ca21b08c58a2))
* **editor:** draw the inspector's blocks at the canvas's pane ([cee131d](https://github.com/TimeToAlign/TimeLineEditor/commit/cee131d883ddc7dfe4f027d2b2b4323543d5ffe9))
* **editor:** edit a root's elisions in the Properties tab ([447d7e4](https://github.com/TimeToAlign/TimeLineEditor/commit/447d7e4a7494a8ea4d174fd2d0dcd0ed265111c2))
* **editor:** edit elision modes, settings and group elisions in Properties ([3c07ab3](https://github.com/TimeToAlign/TimeLineEditor/commit/3c07ab3abd76e7e302345968efa0f2ed3167a309))
* **editor:** keep the server token for the tab across a reload ([f7e704c](https://github.com/TimeToAlign/TimeLineEditor/commit/f7e704c2cb88e6bb3ed6f53fa5d2f296edb014b2))
* **editor:** list a timeline's regions in a Regions tab and its bands with Visible boxes ([27bbfaa](https://github.com/TimeToAlign/TimeLineEditor/commit/27bbfaa1a36ad779c93d8555df5be2620e34175f))
* **editor:** mark and scroll to the selection in the Manifest tab's text ([1180f26](https://github.com/TimeToAlign/TimeLineEditor/commit/1180f263bca3ed0374536a18ba647b6cfd6f47f4))
* **editor:** offer "Show/Hide parent timelines" wherever a grouped child's card is inspected ([2468e6c](https://github.com/TimeToAlign/TimeLineEditor/commit/2468e6c1d58d54b2ca3856d19751796b604fd3cb))
* **editor:** one message system with three levels ([78af341](https://github.com/TimeToAlign/TimeLineEditor/commit/78af3419cf625a4a25f200f0140b5d37beb5772e))
* **editor:** read a root drawn once along a row in the elision section ([cb874f2](https://github.com/TimeToAlign/TimeLineEditor/commit/cb874f21ce4a71af2f69c87387677fdc067db969))
* **editor:** refuse to import a manifest a block already holds ([1bcb754](https://github.com/TimeToAlign/TimeLineEditor/commit/1bcb754a14d14252ae445afb56c68bdf4be1fe28))
* **editor:** show a region's extent, a jump's destinations and display toggles ([bf0fa1f](https://github.com/TimeToAlign/TimeLineEditor/commit/bf0fa1f6339df65d8dc368d080f793d1f3995955))
* **editor:** show the name of a CHUNK side of a MatchClaim ([ca1bbb9](https://github.com/TimeToAlign/TimeLineEditor/commit/ca1bbb9757bf1e55fbb4257a176b591eab4afc92))
* **editor:** toggle a flow element's symbol, brackets and labels ([a15696b](https://github.com/TimeToAlign/TimeLineEditor/commit/a15696b449c3607cb1f8fbce4074692cf26e5631))
* **editor:** turn the drawn wedge live while its rotation slider is dragged ([f998ce7](https://github.com/TimeToAlign/TimeLineEditor/commit/f998ce726d31d09e2a082ea944da3b2c40135662))
* **editor:** use the browser's pickers where the server offers no files ([3e1678d](https://github.com/TimeToAlign/TimeLineEditor/commit/3e1678dc3bf4d154857797c83a2f4ae0be1642d2))
* **inspector:** move the elision controls to their own tab, in collapsible blocks ([3d2f7fc](https://github.com/TimeToAlign/TimeLineEditor/commit/3d2f7fcfd520badfc345156919f4de1c1019a1f6))
* **inspector:** show the Elisions tab when an elision is selected ([ea6b275](https://github.com/TimeToAlign/TimeLineEditor/commit/ea6b2757224c5a084e18226ad2f6e91b8e99597a))
* **inspector:** wrap the tab row and give the level tab its level's settings ([aa3b73a](https://github.com/TimeToAlign/TimeLineEditor/commit/aa3b73a0f08fc54f3284a9d4c598de6f60cf3dbd))
* **layout:** arrange a block's items one under another or side by side ([606592d](https://github.com/TimeToAlign/TimeLineEditor/commit/606592d8d8243ca1d8baffa919280b2f74ac2357))
* **layout:** cascade the label-display property ([f6e342d](https://github.com/TimeToAlign/TimeLineEditor/commit/f6e342d50cc533a2dfc5e8c56bbc55f35618efc5))
* **layout:** draw a groupstamp's secondary coordinates on the frame's other members ([7d5416d](https://github.com/TimeToAlign/TimeLineEditor/commit/7d5416d16478682dfa1a053a051bd18214c022e9))
* **layout:** draw a root's flow control over its whole tree with symbols, brackets and label stacks ([7f4ffb2](https://github.com/TimeToAlign/TimeLineEditor/commit/7f4ffb27633af4bb7c69ba2e5ea06a4f00e72225))
* **layout:** draw a volta as a fork of arrows and keep a gap of 2 around symbols ([a0daf72](https://github.com/TimeToAlign/TimeLineEditor/commit/a0daf7206a89a2d344d235ecedc8d67cfb6de008))
* **layout:** draw cards switched to a FlowMap and frames carried onto it ([e4a9bbd](https://github.com/TimeToAlign/TimeLineEditor/commit/e4a9bbdf4ae6b2b30a7ef5d3d0edad31196202ed))
* **layout:** draw cross-section lines across the whole card, labels at the wedge's thick end ([f2f846b](https://github.com/TimeToAlign/TimeLineEditor/commit/f2f846b43415da2d7aefe516be35d51e8e2fe30f))
* **layout:** draw each ancestor line on the side its own band order gives ([14ba883](https://github.com/TimeToAlign/TimeLineEditor/commit/14ba883e63eb1e3857ab366916fe744154515b47))
* **layout:** draw elisions as gaps across cards and frames ([bb8a314](https://github.com/TimeToAlign/TimeLineEditor/commit/bb8a314ed4144ef55c184f3c59e95c3084ba8a62))
* **layout:** draw elisions as strips on an elided axis ([2ad9d40](https://github.com/TimeToAlign/TimeLineEditor/commit/2ad9d407b99383d5af9d0a812fadb25564a8a0cf))
* **layout:** draw only shared roots once in a side-by-side row; name order; elisions custom by default ([2f9a34c](https://github.com/TimeToAlign/TimeLineEditor/commit/2f9a34cc283c82fef5058ea10b0b5a9187bec755))
* **layout:** draw virtual timelines as cards with the chunks of their FlowMaps ([58ae1a9](https://github.com/TimeToAlign/TimeLineEditor/commit/58ae1a9c907d7669a023f548f9e619ee9dc8f55b))
* **layout:** keep a switched card's bands and draw elisions on placed virtual cards ([57c4c3c](https://github.com/TimeToAlign/TimeLineEditor/commit/57c4c3cdf2c398a89a67a74309f7737b78c3db41))
* **layout:** keep regions in their rows and move a conflicting label to a further tier with a leader line ([407582e](https://github.com/TimeToAlign/TimeLineEditor/commit/407582e61619fb413ef94c9a713898f8f20891a2))
* **layout:** lay out a row of one band order together, its children kept in their rows ([537d014](https://github.com/TimeToAlign/TimeLineEditor/commit/537d014615d0d978744d277a00468dab9a25c456))
* **layout:** one named ellipsis per gap, its labels below it ([408752a](https://github.com/TimeToAlign/TimeLineEditor/commit/408752af5adcb2c7cf5908edc86dbee0bf503459))
* **layout:** show a flow element's name, end the last volta bracket, hide a tree's flow control with its root's band ([ead0d45](https://github.com/TimeToAlign/TimeLineEditor/commit/ead0d45a72eb2a93b12941e6675aff66dae32825))
* **layout:** spread a fork's branches over 70 degrees and let the reading decide where destinations land ([69c26e8](https://github.com/TimeToAlign/TimeLineEditor/commit/69c26e88cac2f91fb85c4a0c7dbd6aa0d1807ce8))
* **layout:** stack the labels of neighbouring gaps on later lines ([1873aee](https://github.com/TimeToAlign/TimeLineEditor/commit/1873aee8fc7947a37f5225e0db040ab10df6fa9a))
* **layout:** unfold the ancestor lines of a carried child member ([7c55c6a](https://github.com/TimeToAlign/TimeLineEditor/commit/7c55c6ab6ef356cd0894c8397f447ed1dbe4ef12))
* lengthen the volta fork's arrows, set each pass at its tip, and fade flow control by the reading ([caf58e5](https://github.com/TimeToAlign/TimeLineEditor/commit/caf58e5c670eacd075ab6c979a0bb08d6e9bfebb))
* make one press of several commands one atomic undo step ([8abe07c](https://github.com/TimeToAlign/TimeLineEditor/commit/8abe07cb65f02394835189de47e6c590fc8637d3))
* open the editor of what is hit and highlight bands in every view ([16c178e](https://github.com/TimeToAlign/TimeLineEditor/commit/16c178e6173975ed4db3b6ba2f8fcd552965f567))
* read flow control by the user's belief, else by the block's belief filter ([e042074](https://github.com/TimeToAlign/TimeLineEditor/commit/e042074459f15f625737ecf255c659f29d717082))
* read, draw and keep flow control in five roles with jump destinations ([f0b7989](https://github.com/TimeToAlign/TimeLineEditor/commit/f0b798984304d51866d4ffd83d1b210c2d497a1d))
* **server:** add a public mode without token and file access ([2579837](https://github.com/TimeToAlign/TimeLineEditor/commit/257983791efcc386d0b4eefd8011df3dd7ba2dfb))
* **server:** compute a timeline's flows and write them into its manifest ([81a007b](https://github.com/TimeToAlign/TimeLineEditor/commit/81a007b372be0088bac2b0303ea95d82420eeb0b))
* **server:** write a timeline's flows again over the flows a manifest holds ([f165e97](https://github.com/TimeToAlign/TimeLineEditor/commit/f165e97d7bf1500c18c571578858ca0484be61d7))
* show a MatchClaim side's CHUNK or NOMATCH sentinel ([a1d3c0a](https://github.com/TimeToAlign/TimeLineEditor/commit/a1d3c0ae98192d89643cc5f91c51f83ce92c3b68))
* turn a virtual timeline's sources on per band, and edit what its windows show at the source ([d119d5a](https://github.com/TimeToAlign/TimeLineEditor/commit/d119d5aee7bfdb41a856eaa5c1281cb22f4ad75e))
* **writers:** draw any manifest file to SVG and TikZ from the command line ([627e7b7](https://github.com/TimeToAlign/TimeLineEditor/commit/627e7b7c2f7d73d2ce1858a2389200fa414d84a8))
* **writers:** stroke a FlowMap's gap lines grey in the line's own stroke ([8f0be25](https://github.com/TimeToAlign/TimeLineEditor/commit/8f0be2540f0485d54d33d3ee3bd1f613f9c55780))
* **writers:** write gaps, ellipses and rows cut at gaps ([6a5cca6](https://github.com/TimeToAlign/TimeLineEditor/commit/6a5cca6ee355fdb84da5c4b0948fb14b4d4bbfdd))
* **writers:** write symbols and volta brackets ([e75dc06](https://github.com/TimeToAlign/TimeLineEditor/commit/e75dc068835018fe75bec6474d47946801ed37b2))


### Bug Fixes

* **arranger,editor:** read a held pin again as a fresh reading under the raised card ([995468a](https://github.com/TimeToAlign/TimeLineEditor/commit/995468aeda46b7e6d0da464710c469af351842c7))
* **arranger,editor:** read a pin and the timestamp named from it on the line it was read on ([6bc6490](https://github.com/TimeToAlign/TimeLineEditor/commit/6bc6490d6d53500291a4f9625522aba71a075011))
* **arranger,editor:** read affordances and the inspector under the raised ancestor card ([cd66da2](https://github.com/TimeToAlign/TimeLineEditor/commit/cd66da228211bf216249920b7083e09942a9eed5))
* **arranger,editor:** read the virtual kinds and the flow editor in every closed switch ([be2abec](https://github.com/TimeToAlign/TimeLineEditor/commit/be2abec51d9902c3c350912a0b584fd85c2376cb))
* **arranger:** centre the edited element again once the pane settles ([b76eba9](https://github.com/TimeToAlign/TimeLineEditor/commit/b76eba905d26df229c2276795555fe4e934c316f))
* **arranger:** count an ancestor card's drawings for the marquee only while it is raised ([7419b1e](https://github.com/TimeToAlign/TimeLineEditor/commit/7419b1ef6f8a7646bb5d1729b203dd23c76986fb))
* **arranger:** draw a matched coordinate at a seam once ([027592a](https://github.com/TimeToAlign/TimeLineEditor/commit/027592a0d571ed9bb14e24e6b388098f18df83cc))
* **arranger:** draw and hit matches where an ancestor card's timeline is seen ([6c8ed90](https://github.com/TimeToAlign/TimeLineEditor/commit/6c8ed90eeea6d9ca19b8521578117eb43ea3597a))
* **arranger:** give the flow list a fixed width with names on hover ([78d2e69](https://github.com/TimeToAlign/TimeLineEditor/commit/78d2e69f59f3f45a1170df56d1a4b938ed89df72))
* **arranger:** keep a view the user pans while it moves to the edited element ([dffc1f0](https://github.com/TimeToAlign/TimeLineEditor/commit/dffc1f0a16a4c342d1880e052b54c48569ca0da3))
* **arranger:** keep hidden ancestors in a timestamp, end unknown lengths at their reach ([b6fbabf](https://github.com/TimeToAlign/TimeLineEditor/commit/b6fbabfd578320592ac16e329df6dbf91e961d71))
* **arranger:** keep the flag beside its pole at the right border ([f2b6920](https://github.com/TimeToAlign/TimeLineEditor/commit/f2b6920bd2fcab918af52b4f329daeeee3221441))
* **arranger:** list a MatchStamp flag's rows in runs, exactly as drawn ([c55996e](https://github.com/TimeToAlign/TimeLineEditor/commit/c55996e6a0913ec75e5dbae35073b1bb0c1de6c6))
* **arranger:** measure the marquee and editor focus with layout's boundsOf ([b77937a](https://github.com/TimeToAlign/TimeLineEditor/commit/b77937aaaae2ac3f0b0121e72d45f874fa4fa8f9))
* **arranger:** move rows when elision labels show and hold a shared member's gap by its own frame ([d04a367](https://github.com/TimeToAlign/TimeLineEditor/commit/d04a3672ccf55d1245add7b2564ecc045cf3da1a))
* **arranger:** offer "Delete all" only where core accepts it ([af9b712](https://github.com/TimeToAlign/TimeLineEditor/commit/af9b7125a889b5b0bff93a9adc0ac0b1c4f9aa4e))
* **arranger:** place a coordinate only where its line is seen ([f998277](https://github.com/TimeToAlign/TimeLineEditor/commit/f998277b9dec0cffdf86d585022f3d2e1524535e))
* **arranger:** place a coordinate wherever it is seen, and list groupstamp coordinates in MatchStamp flags ([d275201](https://github.com/TimeToAlign/TimeLineEditor/commit/d275201c312d26c3b053df4edf72bc1f416b6ad6))
* **arranger:** place a member on the raised card's row and keep the pin mark on own lines ([3630444](https://github.com/TimeToAlign/TimeLineEditor/commit/36304440dc6b6e9068abea6fc71eea82e166c037))
* **arranger:** put the Flow list beside the resize modes, one entry per FlowMap ([c728f91](https://github.com/TimeToAlign/TimeLineEditor/commit/c728f91e70085780ea11aa479c2467c9961bf00a))
* **arranger:** raise a root member's covered card and keep flags on screen ([a3257fb](https://github.com/TimeToAlign/TimeLineEditor/commit/a3257fb0ed89a842a8a4eae6425b3ecb6ec1843c))
* **arranger:** read a position at a seam on the run it lies on ([ba1a8f5](https://github.com/TimeToAlign/TimeLineEditor/commit/ba1a8f5a1a28f7f53b67163c5f1a70db4bd63ddc))
* **arranger:** read an elision's part words beside a chunk index ([eb15540](https://github.com/TimeToAlign/TimeLineEditor/commit/eb15540e0b3c08c09ffc7461a10c5fb044381847))
* **arranger:** read an elision's strip as an element ([25cdc90](https://github.com/TimeToAlign/TimeLineEditor/commit/25cdc904649ebb1b0ca819622d8f68d739a39051))
* **arranger:** show a group member without a value in matches ([695a9f5](https://github.com/TimeToAlign/TimeLineEditor/commit/695a9f5dae7a959fa2743af4a02ad651573ddf71))
* carry a coordinate on the coordinate label alone on ancestor lines ([54e97ab](https://github.com/TimeToAlign/TimeLineEditor/commit/54e97abd3e73997ea839a4bb6ac8d422029f0063))
* **client:** read a measure's volta that names several passes ([03cd4e3](https://github.com/TimeToAlign/TimeLineEditor/commit/03cd4e3723fac982f5b1ccd8ddeb37901bd1816f))
* **core:** a row named by next joins its floating measure across a metre change ([c7fca07](https://github.com/TimeToAlign/TimeLineEditor/commit/c7fca07694cae69be05b77b2245d71602e387808))
* **core:** change a flow-control element's provenance by a belief alone ([611a390](https://github.com/TimeToAlign/TimeLineEditor/commit/611a390ceee0b54bf768484b27395e320acb207f))
* **core:** join a bar split at a repeat sign into one floating measure ([2b837a4](https://github.com/TimeToAlign/TimeLineEditor/commit/2b837a4897741bf90fd2f8b3e8913b26465a645c))
* **core:** let a manifest's elisions take every ordinary edit ([ba4e9fc](https://github.com/TimeToAlign/TimeLineEditor/commit/ba4e9fc215314a3aba648cc34c9eb50ed6d53dc0))
* **core:** let the flow-control editor style its own flow-control elements ([9d8fb54](https://github.com/TimeToAlign/TimeLineEditor/commit/9d8fb54cc9dd7af16fff087e45324ab06ef41979))
* **core:** list a jump's brackets for every volta destination ([2b369f6](https://github.com/TimeToAlign/TimeLineEditor/commit/2b369f6faab7aab43eed72eabbef00d47d9a8042))
* **core:** name FlowMaps and virtual timelines by their names in deletion refusals ([c64e0e3](https://github.com/TimeToAlign/TimeLineEditor/commit/c64e0e33aaa22ad0d19e05b68c4cb304d8fd42d5))
* **core:** read a repeated ID in an arrangement's order ([a2c32a2](https://github.com/TimeToAlign/TimeLineEditor/commit/a2c32a2dc78edcc2b0163aeac456b163cb60d9dc))
* **core:** read a symbol only from a manifestation the table holds ([5df5e9c](https://github.com/TimeToAlign/TimeLineEditor/commit/5df5e9c52d56e43eaab42ecc868e4f645f6e4b72))
* **core:** read secondary coordinates exactly, in their timeline's number type ([3e59043](https://github.com/TimeToAlign/TimeLineEditor/commit/3e590432996d64ef3f6d0de008f7358bfc1835ef))
* **core:** refuse an arrangement cycle that other items follow ([589d267](https://github.com/TimeToAlign/TimeLineEditor/commit/589d2675606cd5dbc6d9c9d82cdbb9962d679881))
* **core:** remove a virtual timeline's elisions and named timestamps with it ([6e12d26](https://github.com/TimeToAlign/TimeLineEditor/commit/6e12d26995ba60e4958c3fd885ced4059ad06fb7))
* draw a halo under a selected stroke, give the inspector the flag colours, compare the saved view by content ([b52b2a8](https://github.com/TimeToAlign/TimeLineEditor/commit/b52b2a84756ecd5d836407634ef9c19cb9fa9555))
* draw every stored elision added from the Elisions tab, and reduce the tab to what an elision needs ([5eac270](https://github.com/TimeToAlign/TimeLineEditor/commit/5eac270d404215a20b181edfef3e8d65686f2116))
* **editor:** announce messages through two live regions present from the start ([1e669f3](https://github.com/TimeToAlign/TimeLineEditor/commit/1e669f3010928be26b8e6ad9a07d158442ff8a6b))
* **editor:** hide the Edit button where the canvas opens no editor ([a6d6856](https://github.com/TimeToAlign/TimeLineEditor/commit/a6d6856b77de704a74886702277827427b33875a))
* **editor:** keep muted text at 4.5:1 and the file list box to options only ([c5aef3a](https://github.com/TimeToAlign/TimeLineEditor/commit/c5aef3ae70bd50cd005b14d1b92433c4f342c39a))
* **editor:** keep open editors when an import is refused as a duplicate ([699d814](https://github.com/TimeToAlign/TimeLineEditor/commit/699d81455d04eeb0d84b0ab460f725fa233ccd39))
* **editor:** name arranged gaps by their stretch and keep the drawn proportion ([96daf24](https://github.com/TimeToAlign/TimeLineEditor/commit/96daf24dee7a83ed333079a61e4469fad4f93274))
* **editor:** name the stored group ID in membership refusals; end-to-end tabs follow the Regions tab ([488c52d](https://github.com/TimeToAlign/TimeLineEditor/commit/488c52d90fcafae94b7a53f9ec6f4c4867c68e95))
* **editor:** offer a jump's volta fork in the Display toggles in place of its brackets ([579f2b8](https://github.com/TimeToAlign/TimeLineEditor/commit/579f2b832c1209c6bc478de5c94eef1965d3ae40))
* **editor:** offer Delete all only where the deletion question allows it ([bd49934](https://github.com/TimeToAlign/TimeLineEditor/commit/bd49934561311b636f718050390094580097b024))
* **editor:** one rule for the message levels, and the store's refusals as information ([5d3c799](https://github.com/TimeToAlign/TimeLineEditor/commit/5d3c79985ccdba0b4b1be15c1de5034cd5609384))
* **editor:** read a held pin again when a fresh reading reads its group otherwise ([033b9ca](https://github.com/TimeToAlign/TimeLineEditor/commit/033b9ca25fbcd1fa66e00e0f2454c1b85c985932))
* **editor:** read a root drawn once behind a side-by-side row as drawn once in the Elisions tab ([3d27523](https://github.com/TimeToAlign/TimeLineEditor/commit/3d275234fe267b95230ddd8189dbf0f506d368b9))
* **editor:** read band presence from the drawing, define the selection colour once ([bdd7c20](https://github.com/TimeToAlign/TimeLineEditor/commit/bdd7c2022e3daea0ccb67319381b3da36c0910b8))
* **editor:** read MatchClaim tables through a server that offers no files ([8afaf54](https://github.com/TimeToAlign/TimeLineEditor/commit/8afaf544891048417ada941f80e1760b7bfde632))
* **editor:** say what is true to every visitor after a download save ([5f14a06](https://github.com/TimeToAlign/TimeLineEditor/commit/5f14a06c9b216be72c359bd8588fac3cfc1b85d4))
* **editor:** Show matches without a server says how to start one, for as long as it takes to read ([f5c6b0a](https://github.com/TimeToAlign/TimeLineEditor/commit/f5c6b0a791d9fdb522e9bd8ce4f449a4adebcf7b))
* **editor:** store MatchStamp anchors in one order whichever editor is open ([43a2170](https://github.com/TimeToAlign/TimeLineEditor/commit/43a2170c86d5c638a64dc2823bd288c716d23f40))
* **editor:** the Regions tab keeps its list while a listed region is selected ([01aee27](https://github.com/TimeToAlign/TimeLineEditor/commit/01aee276b119d44c0d8ab1d5d24ca6c1b116d6ea))
* **editor:** treat a stored elision as an element without name, lock or statements ([f35109f](https://github.com/TimeToAlign/TimeLineEditor/commit/f35109f7a8f2853e681382995785a74fb1fa82da))
* **editor:** try the ancestor-card Hide command and explain a disabled button ([58364c2](https://github.com/TimeToAlign/TimeLineEditor/commit/58364c2a9a190164d36f6890cbd86c7edd26c585))
* **editor:** word an undone import in the journal by its manifest ([1ed3557](https://github.com/TimeToAlign/TimeLineEditor/commit/1ed355788dee781a6c88f0540d6adec7ab8946d0))
* give a groupstamp no value on a group member of unknown length ([d0b3245](https://github.com/TimeToAlign/TimeLineEditor/commit/d0b3245aff9a5fb71872a005e98db45059da6d15))
* **inspector:** an automatic elision selected brings the Elisions tab forward ([18afb28](https://github.com/TimeToAlign/TimeLineEditor/commit/18afb2896706d1178433d14cb15f199990f4b8e3))
* **inspector:** grey an unnamed timestamp's keys by colour, not by opacity ([7edd6d1](https://github.com/TimeToAlign/TimeLineEditor/commit/7edd6d1930ceef0c0361a90ed2efc022381b9ae9))
* **inspector:** ignore what a slider's release fires after its drag ended ([f5cf213](https://github.com/TimeToAlign/TimeLineEditor/commit/f5cf2136d3673c3706e0126b9fc316c4dd1ea629))
* **inspector:** keep an Elisions block closed after a close made under a selected elision ([f170b5d](https://github.com/TimeToAlign/TimeLineEditor/commit/f170b5d482af8e3e5aa8c3908e6cf53cb8992f5f))
* **inspector:** keep an Elisions block open once the user has acted in it ([ca58750](https://github.com/TimeToAlign/TimeLineEditor/commit/ca587503efbd01960eff3997643fc5d14726abe9))
* **inspector:** let the Properties form's columns shrink so the drawer never scrolls sideways ([e765971](https://github.com/TimeToAlign/TimeLineEditor/commit/e76597186005c6b02ca6e1620850a2f2c2589b5d))
* **inspector:** say once in an expanded MatchClaim why no server reads tables ([301e6d1](https://github.com/TimeToAlign/TimeLineEditor/commit/301e6d178e1f67db270b21db173c5b36af2acae3))
* **inspector:** the level tab posts a refused arrangement to the message bar ([3144f36](https://github.com/TimeToAlign/TimeLineEditor/commit/3144f361a0801ca9709b108a00236676bcda3201))
* **inspector:** the level tab's arrangement follows the canvas lock ([1d97b0b](https://github.com/TimeToAlign/TimeLineEditor/commit/1d97b0bbf058e142a49b61b6da31d8dd15cc368d))
* **inspector:** word the Elisions hint for a selection over several roots ([7defb59](https://github.com/TimeToAlign/TimeLineEditor/commit/7defb59f4550e7e2690c876b244752fdb9c96dd4))
* **layout:** carry and list group gaps at exact proportions by the root's number type ([879e212](https://github.com/TimeToAlign/TimeLineEditor/commit/879e2122508c43b4dfeb3e82187ef475f9b42847))
* **layout:** carry frame gaps exactly and count stored card elisions in ancestor rows ([ee3f040](https://github.com/TimeToAlign/TimeLineEditor/commit/ee3f0400da07a189a6b7edd8bca2790479314a30))
* **layout:** cascade a leader only for a label beyond its first tier ([94937ee](https://github.com/TimeToAlign/TimeLineEditor/commit/94937ee7ddea351bbdd397c51f7336db5d713b4c))
* **layout:** count derived elision labels in the ancestor-row distance ([b0deb13](https://github.com/TimeToAlign/TimeLineEditor/commit/b0deb13499373919a6ec4b3ff2d4dd7bd1c4d902))
* **layout:** count the places jumps reach by a distance and draw every arc whose distance is not 0 ([dee68fe](https://github.com/TimeToAlign/TimeLineEditor/commit/dee68fe76fefb15af36d3cf601b099e9225c2192))
* **layout:** cut a region's brace at the gaps it spans ([963a4c5](https://github.com/TimeToAlign/TimeLineEditor/commit/963a4c5c4365f14ea45afe0410caae6bf3f72884))
* **layout:** draw an undefined group coordinate at the fading opacity itself ([d113002](https://github.com/TimeToAlign/TimeLineEditor/commit/d11300295a9e2f4760ec704bb1eb76a854691072))
* **layout:** end an open root on the span's side of the end seam ([e0f4d5d](https://github.com/TimeToAlign/TimeLineEditor/commit/e0f4d5da6a5c9bc3e80b9b9e1f49fefb62e906ef))
* **layout:** give a line drawn with a run once one axis per run ([1fa2468](https://github.com/TimeToAlign/TimeLineEditor/commit/1fa246890bfe2323b6c25108f226a4bab484379f))
* **layout:** give alignment anchors no cross-section segment in an ancestor card ([da112ee](https://github.com/TimeToAlign/TimeLineEditor/commit/da112eea27a79d5b72d40de738094fb57b50f020))
* **layout:** keep ancestor cards visible beside their frame, ellipses on lines only ([9e756e4](https://github.com/TimeToAlign/TimeLineEditor/commit/9e756e44c57548758571eafab09552b1f2c04c47))
* **layout:** keep the axis of a line of drawn length 0 that no strip holds ([e4e534e](https://github.com/TimeToAlign/TimeLineEditor/commit/e4e534ec68c240ce3757b2f4fc25b18de186e077))
* **layout:** label an arc by its destination and draw none to a rejected jump target ([a1e2bff](https://github.com/TimeToAlign/TimeLineEditor/commit/a1e2bff345ae1f5f6da8c0a24cd858dd3989f22d))
* **layout:** mark a group reading with the frame line's faded pieces ([d3cf7e1](https://github.com/TimeToAlign/TimeLineEditor/commit/d3cf7e1e77f9bd04e4a063dbe8c776f91aa34305))
* **layout:** place a side-by-side row whose items hang on no root ([50229d1](https://github.com/TimeToAlign/TimeLineEditor/commit/50229d1d2c6e8e4154e2ff07d7af93a07b9ac792))
* **layout:** place each item below the ancestor cards behind the frames before it ([f198e29](https://github.com/TimeToAlign/TimeLineEditor/commit/f198e29edde312b6df99043959bba63a21bb74cc))
* **layout:** style the hover mark of an ancestor line as a wedge held by that line ([db0a7a1](https://github.com/TimeToAlign/TimeLineEditor/commit/db0a7a1ce089a9a27405c64a9be9b4e7c5c5512a))
* let a band list's display press pass inside the flow-control editor ([92b7fc9](https://github.com/TimeToAlign/TimeLineEditor/commit/92b7fc9bb1350f505876b7f757af37ce1c8285b7))
* **matches:** follow the health check, split the server sentence, drop the file form ([42ad350](https://github.com/TimeToAlign/TimeLineEditor/commit/42ad3502e4df035fa3104bff8cbd0a0382319527))
* **matches:** gate provenance, events and beliefs on a server that reads tables ([3f5a853](https://github.com/TimeToAlign/TimeLineEditor/commit/3f5a853f67315335ddf29e5452bbd9a058d77d0f))
* **matches:** warn once when the health check fails after Show matches was turned on ([32d335f](https://github.com/TimeToAlign/TimeLineEditor/commit/32d335ff1193a56e2657de48e042a034469bc195))
* **matches:** warn that matches need a running server instead of asking for a table ([42bd0b0](https://github.com/TimeToAlign/TimeLineEditor/commit/42bd0b0ebefd9190090ad3ec46e309ebf55e4b39))
* move a one-frame ancestor card by its frame, compare the autosaved view by content ([16cf2ea](https://github.com/TimeToAlign/TimeLineEditor/commit/16cf2ea1e02afac9e22cd1171769f724df2937b6))
* pan a Shift wheel horizontally under every user agent ([c91d735](https://github.com/TimeToAlign/TimeLineEditor/commit/c91d735b9dc5f8ed121a86778bf81ed914fa7598))
* place a row's card right of the flow editor's pane ([15d75a0](https://github.com/TimeToAlign/TimeLineEditor/commit/15d75a008cd60ad13feb04973db82a5accd67d81))
* preview with the store's minter and name minted IDs only through results ([5c86ef0](https://github.com/TimeToAlign/TimeLineEditor/commit/5c86ef0e74feb3f5ed99bb86d6d3d33d4d592e74))
* read a manifest without MatchStamps as holding none in the side-effect guard ([bd73890](https://github.com/TimeToAlign/TimeLineEditor/commit/bd73890158f984a73d51df8bd5fc0c0e67fa1463))
* read virtual group members and virtual axes wherever a group or an axis is asked ([f99dbcb](https://github.com/TimeToAlign/TimeLineEditor/commit/f99dbcb9c330c2fec0138057ef4fe58fd27d8c8d))
* **server:** answer health when timetoshare fails to import ([bf38af3](https://github.com/TimeToAlign/TimeLineEditor/commit/bf38af3a8cba20d3287e83d7ac4b38f1d96472ea))
* **server:** answer links in a loop alike on Python 3.11 to 3.13 ([294fe39](https://github.com/TimeToAlign/TimeLineEditor/commit/294fe391ce9e832918024d45250d65743e52a0cf))
* **server:** bound the rows and decoded size of a posted table in public mode ([696fc74](https://github.com/TimeToAlign/TimeLineEditor/commit/696fc74ff60c878be832290a1c0038ba121f2726))
* **server:** compute answers on the thread pool, keep refusal paths, record every route's answer ([e146463](https://github.com/TimeToAlign/TimeLineEditor/commit/e146463c74b210ee0307b1555b18eec976698f45))
* **server:** import pyarrow on the thread that builds the application ([fb3b62b](https://github.com/TimeToAlign/TimeLineEditor/commit/fb3b62bcac33e2a47502546c682b82ce84f434d3))
* **server:** limit the computations and connections of a public server ([5430042](https://github.com/TimeToAlign/TimeLineEditor/commit/5430042591f20a7e9a7055a0807d5d5eb973f1b5))
* **server:** refuse file routes without a token and pin the public guard's edge cases ([afe0cf2](https://github.com/TimeToAlign/TimeLineEditor/commit/afe0cf20f79957961589dd983df50f5173b73d6f))
* **server:** seed the IDs the flow-maps route writes from its request ([4c95efd](https://github.com/TimeToAlign/TimeLineEditor/commit/4c95efdd2762173bb8a5c5af4d0d819d5fbac224))
* show an empty band from the band list's Visible box ([37db5d7](https://github.com/TimeToAlign/TimeLineEditor/commit/37db5d78656a85303f923c2698b2ca5d0405f7e2))
* the Edit button selects what the opened editor shows chosen; selection colours through one token ([4b64351](https://github.com/TimeToAlign/TimeLineEditor/commit/4b643514abc3388368f426bdd6438c8a7887a2cb))
* treat elisions on virtual timelines as card or group elisions everywhere ([bee8a05](https://github.com/TimeToAlign/TimeLineEditor/commit/bee8a0567de28641a9f6a64c022d32580f97e7d5))


### Performance Improvements

* **arranger:** read the MatchStamp paint only for MatchStamp parts ([3657d89](https://github.com/TimeToAlign/TimeLineEditor/commit/3657d891f89abb19134628e09807a24afe96905d))
* bound the views the store holds, read membership verdicts once, glow without filters ([c705c81](https://github.com/TimeToAlign/TimeLineEditor/commit/c705c81be74df81bfe30c490bcb3c6b82d2e1f0e))
* **core:** decide a map's invertibility once per map and span ([b52c050](https://github.com/TimeToAlign/TimeLineEditor/commit/b52c050769d476582eeaa71cf8f924b5a9b069a4))
* **layout:** compare first-fit ends as numbers, without a tuple per row ([cd0fd41](https://github.com/TimeToAlign/TimeLineEditor/commit/cd0fd41b8dc002309dbae8705cbf56a520d66a0c))
* **layout:** place first-fit items without scanning the whole row ([878967f](https://github.com/TimeToAlign/TimeLineEditor/commit/878967f98756520a724a2f4fe5cad91c78bf239b))
* **layout:** read band orders in one walk per manifest, pin the constants to the specification ([bd7dbaf](https://github.com/TimeToAlign/TimeLineEditor/commit/bd7dbaf80115134cdb106b49a0d444f578571541))


### Code Refactoring

* adjacent rows with one measure number form one floating measure ([bfcf3a1](https://github.com/TimeToAlign/TimeLineEditor/commit/bfcf3a1def1b1090b72d05c68837801cca9df5d4))

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
