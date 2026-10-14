# A implementation review, 2026-10-11

## Result and authority

The approved A layout is implemented in Web, App DOM fallback and UIKit. The focused R3
independent verdict is PASS. Broader task acceptance remains open; task status stays
`in_progress`. This record supersedes earlier pending-native statements for the evidence
described here. The requirements remain in [a-implementation.md](./a-implementation.md).

Worktree: `/Users/texas/Workspace/IMSWeb/.worktrees/exchange-ios-polish`, branch
`codex/exchange-ios-polish`, base `375820be0a1989ff5d356bc707434e5a58689661`.
The parent worktree was not changed. A changes remain local, unstaged and unpublished.

## Delivered behavior

Browse and selection use separate search/selected and filter/directory groups, with a
shared right-side refresh/locate capsule. Selection replaces the search contents and
restores five App tabs. Editing and results preserve explicit submit, retained query,
nonmodal map interaction, native keyboard coordination and bounded reading scroll.

R1 repaired side-control locate overlap and oval summary clipping. R2 repaired rounded
corner hit admission, overlay order on source return and essential/reading layout. R3
keeps More's complete title and semantic font under `UIButton.Configuration`, retaining
the existing button/menu and 44pt targets. Its exact historical rendering cause remains
uninstrumented; actual post-repair rendering was checked separately.

The repaired 440pt case follows ordinary selection, live extra-large text, keyboard
landscape and deliberate reading scroll. Both characters in `更多` are visible in the
raw PNG. Its target is `[62,148][235,192]`, 173×44pt, inside reading viewport
`[62,108][416,192]`. Default-size reversion/re-expansion, the 402pt ordinary neighbor
and one 440pt long-metadata neighbor pass. Four reading comparisons keep input, submit,
cancel and keyboard frames fixed. Their request windows contain no requests; the run
contains three explicit place searches. More center/inside-edge, source Dialog and
return restore the selected capsule, native More, visible locate glyph and five tabs.

## Evidence and provenance

Local delivery: `data/native-glass-verification/exchange-a-r3-20261011/index.html`.
This ignored data directory contains verified copies of original evidence, reports and
`parent-evidence-audit.json`; it is not a product asset or authored design preview.

- R3 built one canonical optimized Release after doctor and installed the same package
  on both owned simulators. iOS 27.0 build `24A434`; portrait viewports 402×874 and
  440×956pt. Current binary SHA-256 is
  `b565d3fd47de59453858c2962e6f33c3b158ee15c6f65df774845f3c34a7caef`.
- The parent recomputed 2,588 source hashes, 13 closing artifact bindings, all 22 raw
  native images with hierarchy/capture/source/fixture bindings, and 30 Release/installed
  package file hashes. No mismatches were found. Eight native captures cover browse,
  edit, results and selected states on both widths, with actual state labels.
- The 16 Web/App DOM images retain their hashes and five unchanged source bindings.
  They show 390×844 and 844×390 CSS-pixel fallback states with local fixture geography.
  Browser validation remains 11 affected Web cases and 17 App cases with four declared
  project skips. Those passed runs were not repeated for the native-only R3 change.
- R3 owner compiler, simulator-SDK typecheck, scoped format, rules and diff receipts
  passed. The two new XCTest regressions were typechecked, not executed in an XCTest
  host. R2 bridge, delivery, geometry, checker and static receipts retain qualified
  source bindings; counts from different stages are not added together.

Authoritative reports were copied into the delivery directory as `reports/native-r3.md`
and `reports/check-r3.md`. Originals remain in the workflow-managed output directory
for `85a85895-e017-44f9-b321-a155061c0072`. Raw runtime evidence remains at
`/tmp/imsweb-exchange-a-implementation/rework-r3/check/`.

## Retained failures and restoration

R3 long-selection automation initially tapped the center of a partly visible row;
that point overlapped More. Recovery dismissed the menu, captured a fresh precondition
and tapped the visible row at `(220,810)`, without another search or automatic scroll.
The first final audit assumed all Swift file-list entries were worktree files; the
corrected audit separately binds two Xcode-derived sources. Both failures remain intact.
Earlier R1/R2 failures, report rejections, HTTP/2 failure and finalization failures remain
historical evidence.

Sources, status and diff matched review entry, with an empty index. The reviewer
preserved 4,130 historical evidence files and restored both simulators to portrait,
light, disabled contrast, large text and Shutdown. Keyboard/user settings match baseline,
apart from two bookkeeping timestamps. The exact owned fixture exited normally; owned
jobs and fixture listeners are gone. Generated baseline files were preserved and are
outside source delivery scope.

## Remaining acceptance

Actual VoiceOver traversal/focus and the broader native error/removal-race matrix remain
unrun. R3 did not rerun Pinyin composition, live Reduce Motion/Reduce Transparency or
successful location acquisition. R1's real Pinyin UI composition and R2's material/hit/
pending-refresh observations retain their historical source/binary qualifications;
neither establishes internal `markedTextRange` instrumentation or a fresh R3 pass.

Android/older-iOS/tablet runtime acceptance remains open. Physical installation and hosted
UIKit CI were not performed in A and are not newly introduced closure requirements.
The requirement permits simulator native evidence; this scoped PASS does not mark every
composite PRD acceptance criterion complete. No acceptance box or task archive was changed.
