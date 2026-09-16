# App navigation

Authority: `apps/web/app/components/app/app-tab-model.ts`,
`apps/web/app/components/app/app-navigation-provider.tsx`,
`apps/web/app/lib/app-navigation-state.ts`,
`apps/web/app/lib/app-shell-scroll.ts`, and `apps/web/DESIGN.md`.

## 1. Scope and trigger

Apply this contract when changing App section ownership, tab selection, back
navigation, scroll restoration, or native tab items. `AppLayout` owns the
coordinator. Ordinary Web uses its existing navigation and Router scroll
restoration. Wiki interactions, map viewport state, and namecard preview state
remain with their page owners.

## 2. Signatures

```ts
type AppTabId = "home" | "community" | "map" | "resources" | "account"

declare function useAppNavigation(): {
  activateTab: (tabId: AppTabId) => void
  goBack: () => void
}

declare function beginAppScrollRestoration(
  requestedTop: number,
  options?: {
    deadlineMs?: number
    onFinish?: (result: "success" | "deadline" | "cancelled") => void
  }
): () => void

declare function appBackHierarchyTarget(pathname: string): string | null
```

Back inside My climbs the route hierarchy instead of replaying browsing
history. `appBackHierarchyTarget` returns `/account/me` for
`/account/me/<section>` and `/account/security`, and `null` for `/account/me`
itself and for every other route. `goBack` pops when the tracked entry below the
current one is already that parent, and otherwise replaces the subpage entry
with it, so a second back still reaches the previous section. The rule stays in
the tab model beside the other prefix sets, so the header button and the native
back gesture share one decision.

A native pop never calls `goBack`, so the provider also inspects commits. When a
POP leaves a subpage whose parent is not its destination, the provider pushes
that parent: the push drops the popped-forward section entry and keeps the entry
below, so a second pop still reaches the previous tab. This covers a section
restored from another tab, where no parent ever sat below it. Only a real pop
counts, because a restored commit reuses the current entry key.

Use `appTabIdForPathname` and `appTabRoot` from the tab model. Do not create a
second prefix list for directories, headers, or native selection. Personal
exchange paths must be resolved before the public exchange-map prefix, which
must precede the general Community prefix.
`isPersonalAppRoute(href)` classifies identity-dependent destinations under
`/account` and `/community/exchange/me`, ignoring query/hash. `/about` belongs
to My but stays public: keep its saved position, active restoration, and pending
resume when identity changes. Apply this distinction to saved, current, previous,
and pending locations.

## 3. State and platform contracts

Tabs appear in this order: Home, Community, Map, Resources, My. The Map root is
`/community/exchange`, with the `map-pinned` icon. Its Chinese label is 交换地图
and its English label is Map. Public exchange descendants belong to Map;
`/community/exchange/me` and descendants remain My. Keep Community's directory
entry and availability rules, while the bottom tab stays directly reachable.
Map roots use existing filter/camera restoration and do not reset on reselection.
Public office detail pages keep normal section snapshots and header/back behavior.

A section snapshot contains `href` (pathname, search, hash), `scrollY`, and
`routeKey`. It lives in memory for the mounted App shell; it does not contain
API data, credentials, arbitrary `location.state`, form drafts, or open dialogs.

A pending tab request contains `id`, `tabId`, `href`, `sourceKey`,
`browserSourceKey`, `scrollY`, and `replace`. Capture the source before queueing.
Further input uses the pending `tabId` and address until the route commits.
Freeze source writes while a request is queued so a stale document cannot
overwrite an explicit root selection. Keep the request through slow route
loading; clear it on a superseding action, route commit, or unmount.

Native items carry `route`, `lucideIcon`, and translated `title`. Accept native
selection only for roots in the tab model, then call the same `activateTab` used
by the Web fallback. UIKit owns native geometry. The fallback derives its lens
width from the item count. Every active Lucide ID must be copied by
`src-tauri/build.rs` into the main iOS asset catalog and have a valid vector asset.

The header names the section. A child page needs its own visible title, including
pages that were previously tab roots. Fullscreen exchange maps retain their
header exclusion. Modal suppression remains active until the final modal closes.

The App events page sets document `scroll-behavior` to `auto` while mounted
and resolves the computed property before Router restores the viewport. Its
window virtualizer starts only when the ready, nonempty list is present, after
Router can reset the loading document. An implicit smooth animation can retain a
stale target as content grows. Restore the prior inline value and priority on
exit so other pages, including Wiki, keep their scroll behavior. Explicit
gesture-triggered smooth scrolling stays available. Browser checks must cover
normal motion without scroll instrumentation; reading computed styles in a
trace can alter the timing being measured.

## 4. Validation and behavior matrix

| Input or state | Required behavior |
| --- | --- |
| Different section with a valid snapshot | Restore its complete URL and window position |
| Different section without a valid snapshot | Open its root at the top |
| Reselect a section on a child page | Open the root and replace its remembered child |
| Reselect a committed root | Scroll to top, preserve query/hash, add no history entry |
| Reselect a pending root | Set its requested position to zero without another navigation or history entry |
| Rapid A → B → A before commit | Restore A; do not interpret it as A reselection |
| Unknown route | No forced tab selection |
| Back with observed App history | Use actual history, including section switches |
| Back on an Account subpage | Reach `/account/me`: pop when that parent is already the entry below, otherwise replace the subpage entry |
| Back on the Account root | Use actual history and leave My for the previous location |
| Direct entry without observed history | Replace with the owning root; do not create a back loop |
| Account identity changes | Clear personal snapshots and pending personal restoration before saving the new commit |
| Fullscreen exchange map | Select Map and leave viewport/filter restoration to the map |
| Reselect exchange-map root | Preserve URL and camera/filter, add no history entry or window scroll |

Explicit tab restoration uses `preventScrollReset`. Save positions before
navigation and from the committed document's scroll events, never by reading
window position after the destination has replaced the source. Preserve a pending
reading position while loading content is too short. For nonzero positions,
observe resizing and scroll anchoring until the bounded deadline (currently five
seconds). Reaching the target once does not prove that reaction rows or other
content have finished loading. Zero completes on the first application.

Wheel, touch, pointer scrolling, scroll keys, and Tab focus navigation take
ownership. Button Space activation waits for its synthesized click. Captured
clicks suspend writes and defer cleanup until the control can save the old
position; that cleanup must not cancel a replacement restoration. Completion,
user cancellation, a newer navigation, or unmount releases all observers,
frames, timers, and listeners.

Process identity changes before storing a location or restoring its position.
A pending old-account address falls back to `/account/me` with zero position.
Preserve the source history entry if its loader is still pending; replace the
old-account entry if browser history has already committed it. Browser state
can advance before React paints, so compare the captured browser key and current
URL as well as the rendered location. A newer ordinary navigation must win.

## 5. Good, base, and bad cases

- Good: leave page 2 of the namecard wall at a reading position, open My, return
  to Community, and recover that URL and position after data loads.
- Base: first selection opens the section root. A second selection returns to
  the root; another selection there scrolls to the top.
- Bad: infer the selected section only from `useLocation` while a previous tab
  request is still queued, or let the old document overwrite a newer root intent.

Directory entries use resolved destinations and navigation behavior. Preserve
query/hash presets, otherwise inaccessible deep links, and external extensions.
Deduplicate only identical canonical URLs with the same navigation behavior.
Keep core resource shortcuts usable during directory API failure and preserve
Community's existing exchange-availability rules.

## 6. Required assertions

- `app-tab-model.test.ts`: five-tab order, personal-before-map-before-community
  ownership, roots, unknown paths, icons, and the back hierarchy targets for
  section, security, root, and unrelated account routes.
- `app-navigation-provider.test.tsx`: full URLs, source position, actual back,
  replace fallback, account changes during slow loading and before React paints,
  queued roundtrips, interrupted root selection, root query/hash preservation,
  public `/about` reading across committed and pending identity changes,
  independent Community/Map reading, and map root reselection without scrolling,
  plus hierarchy back from a directly entered Account subpage, from a subpage
  whose parent sits below, and from a subpage entered in another section, a
  native pop that leaves a restored section for the parent and then for the tab
  below it, and the unchanged history behavior on the Account root.
  Use a real browser-history router for commit-versus-paint assertions.
- `app-shell-scroll.test.ts`: delayed height, later anchoring, user cancellation,
  pointer and Space activation order, timeout, cleanup, missing ResizeObserver,
  and map exclusion.
- `app-navigation.spec.ts`: DOM-level rapid roundtrip, delayed data and reaction
  rows, shortened/error content, position restoration, and root reselection in
  the five App projects. A test expecting a remount and a second request must
  await the destination page's rendered identity before switching back. A URL
  update alone can precede React's commit; a rapid roundtrip can correctly keep
  the original component and make no second request. Cover the My hierarchy back
  from a direct entry, from a subpage entered in another section, a native pop
  from a section restored after a tab switch, and unchanged history behavior on
  the Account root.
- Existing shell, map, events, account, Wiki, and namecard App tests retain their
  geometry and modal assertions. Scope tab locators to the named main navigation.
- Infrastructure tests compare active model icons with the Rust inventory and
  validate the vector files. Real UIKit selection, reselection, icons, and modal
  suppression require simulator or device evidence; browser mocks do not prove it.

## 7. Queued selection example

Do not discard the pending request before deciding what a click means:

```ts
cancelPending()
const activeId = appTabIdForPathname(currentLocation.pathname)
```

Keep the requested section available while deciding, and only then replace or
cancel its pending work:

```ts
const pending = pendingRef.current
const activeId = pending?.tabId ?? appTabIdForPathname(currentLocation.pathname)
const activeHref = pending?.href ?? currentHref
```
