# iOS appearance and refresh follow-up

Source audit: `/tmp/imsweb-ios-exchange-polish/audit.json`. Base: `375820be0a1989ff5d356bc707434e5a58689661`; isolated branch: `codex/exchange-ios-polish`.

Refresh currently exists only in More in both renderers. The callback already reloads series, offices and cards through `loadFirstPage()` and must stay there. Search alone derives native darkness from the document; map controls and tabs intentionally use light appearance. Search has no current palette bridge and nests glass tool buttons inside its outer material. Map feedback is independently displayed above the map and in the native collapsed notice.

Follow-up scope: direct refresh, native semantic capsule/tool styling and neutral grabber, map-owned appearance, current CSS-primary tint, and one feedback owner per detent. Keep search/IME/request state, directories, suppression and fallback contracts intact. The screenshot does not establish the phone's accessibility settings or why the material is opaque.

DOM screenshot review found the locate button partly behind the card after initial navigation clearance. The card measured occlusion before its computed bottom changed, and ResizeObserver does not observe position-only changes. Remeasure when bottom changes; verify the locate rectangle stays outside the card. Current primary tint is adjusted only when needed to preserve 4.5:1 contrast against its semantic light/dark surface, retaining palette channel ordering.

Verification must distinguish source/component checks, browser DOM rendering and actual UIKit evidence. Preserve prior Release receipts and failures. No phone installation during implementation; final check owns native build/install after source review. Existing simulator evidence from the base cannot prove the new appearance.

Humanizer and redesign-existing-projects guidance were read. The installed trellis-before-dev skill was unavailable; repository frontend and shared pre-development checklists supply the scoped guidance.

Recovery located and read `/Users/texas/Workspace/IMSWeb/.agents/skills/trellis-before-dev/SKILL.md`. The initial availability note above records the earlier search result. The existing behavior gap, owners and boundaries remain valid. No further source change was needed after the five geometry/palette cases and closing checks passed.

## Live Dynamic Type repair

Independent native review in `review-recovered.json` verified clipping when an existing folded host changes from large to accessibility-large. Fresh navigation is readable, so the gap belongs to live configuration/intrinsic-size invalidation in `GlassSearchView.swift`, not the shared search model or HTTP layer. Refresh button/label fonts, invalidate fitting sizes and refit the card/occlusion on preferred-content-size trait changes. Preserve the existing input, query, results, detent and editing state. Only this Swift owner, native transition fixtures and execution/verification notes need changes. Reuse prior source/browser gates; run the optimized simulator wrapper and live transition checks. No phone installation.

The first repair measured before descendant configurations settled; its clipped screenshot is retained in `repair-live-large.png`. Deferring the refit to the next main-loop turn resolves typography. It also exposed stale native locate position after card growth: card top 533pt versus locate 513..557pt. The supervisor approved a narrow expansion: expose the existing native-control scheduler through a stable geometry refresh callback, invoke it only after committed occlusion/map-size changes in `exchange-office-map.tsx`, and add a position-only frame synchronization regression. No alternate offsets, store or observer are introduced.
