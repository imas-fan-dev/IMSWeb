# Map entry review

## Verdict

No findings.

## Scope

Reviewed the fifth Map-tab increment in `app-tab-model.ts`, `app-tab-bar.tsx`, `resources.ts`, and `src-tauri/build.rs`; the relevant top-bar, navigation-provider, and non-scrolling-route call sites; focused tab-model, tab-bar, top-bar, provider, Tauri asset, and `app-map.spec.ts` assertions; and the matching README, design, and App navigation specification updates.

The model consistently orders Home, Community, Map, Resources, and My. Personal exchange paths resolve to My before public exchange paths resolve to Map, and Map resolves before the broader Community prefix. Public office details retain Map ownership and document-style header/back behavior. Map root reselection preserves its URL, camera, and filters without adding history or invoking window scroll.

The Web and native item projections use the fifth slot dynamically. The Rust inventory matches all five model icons, and each referenced vector source asset is present. Focused unit and Playwright coverage proves slot order, native index and route selection, owner precedence, independent Community/Map snapshots, Map continuity, and root reselection behavior with contract-checked fixtures.

## Limitations

Static review only, as requested. I did not run tests, builds, browser validation, or device checks. The known local map API 404 and real UIKit behavior were outside this review; the parent agent owns those validation results.
