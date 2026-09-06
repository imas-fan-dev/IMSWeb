# Web components and UX

## Design authority

`apps/web/DESIGN.md` defines the product's visual tokens and application rules.
`apps/web/app/app.css` implements those tokens. Read both before changing global
color, typography, spacing, radius, elevation, material, or motion.

When a global token changes, update `DESIGN.md` and `app.css` together and run
`pnpm --filter @imsweb/web run design:lint`. Do not introduce a one-off token
that duplicates an existing semantic color or spacing value.

## Component choice and ownership

Reuse shadcn and Base UI primitives from `app/components/ui/`. Use Lucide icons
through the existing icon components. Reusable business UI belongs under
`app/components/<domain>/`; page-private presentation stays with the page.

Keep route modules focused on data and composition. Extract a component when it
has its own interaction contract, repeated rendering, or a testable visual
responsibility. Do not build a wrapper that only renames props or adds a class.

Use controls that match the action: buttons for commands, links for navigation,
checkboxes or switches for binary settings, tabs for views, and menus for option
sets. Icon-only buttons need an accessible name and a tooltip when the icon is
not self-explanatory.

## Responsive and accessible behavior

- Provide semantic roles and visible labels for interactive controls.
- Support keyboard focus and operation. Use `:focus-visible` behavior already
  defined in `app.css`.
- Respect `prefers-reduced-motion` for non-essential motion.
- Keep loading, error, empty, and success states within stable layout bounds.
- Verify that text, dialogs, fixed actions, maps, and navigation do not overlap
  or create horizontal overflow at mobile and desktop sizes.
- Preserve Tauri safe areas for app-target fixed UI.
- Keep essential labels and actions visible by default. A hover-only presentation may
  hide them only under the combined `hover: hover` and `pointer: fine` media query;
  restore them for both hover and `:focus-visible`, and cover the exact media variant
  with a component regression test.

Existing Playwright tests such as
`apps/web/tests/e2e/community-exchange.spec.ts` use role-based interaction,
accessibility scans, viewport geometry, and overflow assertions. Follow those
patterns for user-visible workflows.

### Content-sized namecard columns

`useNamecardMasonry(cards)` measures each mobile Card at its natural height and
keeps cards in their original DOM order, assigning columns by index parity.
Build explicit row tracks from the sorted item top/bottom coordinates; track
count must stay at most `2 * itemCount - 1`, regardless of page height. Do not use
one implicit grid row per pixel: a 48-card page with large reaction groups can
reach the browser's grid limit and overlap later cards.

Enable the measured grid only after valid positive heights are available. Keep
ordinary-grid fallback for missing ResizeObserver or invalid measurements, clear
measured styles on desktop, and invalidate scheduled callbacks during cleanup.
Emoji changes must move later cards in the same column without changing DOM or
preview order. One Card owns both faces, metadata, and reactions.

Cover initial alignment, unequal heights, asynchronous changes, breakpoint
round-trips, and 48 cards with 11 six-digit reaction counts in browser tests.
Assert same-column gaps, footer separation, and bounded track count, not merely
that the first viewport looks correct.

### Mobile namecard pagination

Keep page-size, summary, jump form, and previous/next controls in one named
navigation region. The mobile controls use two rows and targets of at least
44px; desktop retains its labels and grouping. Preserve URL parameters, reject
invalid pages, submit on Enter, cancel the draft on Escape, and avoid a request
for the current page. Verify that a changed page starts in view.

When shortening a label visually, set a stable accessible name on its control:
browsers can insert spaces between nested label text that unit-test DOMs omit.
Geometry checks must exclude Base UI's offscreen form inputs; a 1px native form
mirror is not a visible touch target.

The App floating upload/back-to-top group yields while the namecard pagination
is visible. The page-private visibility hook owns initial measurement, observer
subscription, fallback events and cleanup; AppLayout only consumes the marker.
Do not unmount the upload dialog or change other routes to solve this collision.
Test actual `elementFromPoint` hits across enabled controls, not only the layout
of controls inside the navigation. Disabled buttons may have pointer-events none
and are not touch-hit candidates.

### Namecard dates and reaction graphics

Render submission timestamps as Shanghai `MM-DD HH:mm` with a 24-hour `h23`
clock. Assemble the parts explicitly rather than relying on locale punctuation.
Keep the year and seconds in the time element's ISO value and full accessible
description. Cover midnight, date/year rollovers, timezone offsets, and narrow
column bounds. Missing/invalid labels remain short.

Reaction chips and picker entries use the same page-private local-image
component. Preserve Unicode wire values and button labels, but never use native
emoji as a visual fallback. Pin assets, attribution and SHA-256 metadata under
public, and keep the asset map, API allowlist and actual files covered together.
Browser tests must load all icons in both targets and verify their dimensions;
allow subpixel rounding when comparing DOMRect values to CSS pixels.

Mobile list chips use 16px graphics and 12px counts while the picker and desktop
keep 20px graphics. Include the add button in the four-entry row limit. Each
mobile control keeps at least 44px and one quarter of the row width, with natural
width growth for long counts; do not force six-digit counts into a fixed 25%
box. A narrower Card can wrap to fewer entries. Preserve inset focus rings at
full-width Card edges and restore desktop padding and gaps. Browser coverage
must prove four short-count entries at 402px, narrow-screen wrapping, six-digit
counts without overflow, and unchanged picker sizing.

### Continuous namecard previews

Keep one `NamecardPreview` Dialog mounted while changing cards. The page-private
`useNamecardPreviewNavigation(listContext)` owns adjacent-page reads through
`getNamecardPage`; preview navigation must not change the list URL or replace its
items. Lock navigation synchronously before awaiting a request. Invalidate its
session on close, reopen, unmount, and list-context changes; empty or shrinking
pages retain the current image and expose retry instead of recursing.

`useNamecardPreviewReturn(listContext)` records the original trigger, scrollable
ancestors, and window position. Restore focus with `preventScroll` after the focus
trap releases, then restore scroll positions. A deferred animation-frame callback
must check that its return target still belongs to the closing session. Reopening
or changing list context must invalidate it.

Verify these contracts in the navigation/return hook unit tests and
`apps/web/tests/e2e/namecard-mobile-browsing.spec.ts`. The App counterpart covers
safe areas and return behavior across the existing five viewport projects.

### Popup resting styles

Animation completion alone does not prove a popup is usable. The namecard
reaction picker uses a local no-animation override because Firefox collision
placement could leave its entry opacity and transform at intermediate values.
Assert computed opacity `1` and rendered 44px targets after placement, including
short landscape viewports. Keep this override local; do not disable global
motion. When waiting for finite animations, allow cancellation with
`Promise.allSettled`, then assert the resulting styles and geometry.

### Fixed-height virtualized rows

Treat a virtualized row's rendered height, loading skeleton, virtualizer estimate,
and test mock as one contract. Change them together, and make test doubles derive
positions and total size from the supplied estimate instead of repeating a numeric
height.

Keep metadata in normal document flow across breakpoints unless the product design
explicitly calls for a different desktop order. Absolute positioning can make a row
look denser while breaking reading order, centering, and skeleton parity.

Browser geometry assertions must preserve signed viewport coordinates. Virtualized
rows can sit above the viewport and return negative `DOMRect` values; clamping those
values to zero creates false overflow failures. Compare relative centers, edges, and
adjacent row bounds directly.

### Travelling lens geometry

The website header and App fallback tab bar share `.glass-lens` motion, but each
component owns its capsule dimensions. Choose the local vertical inset so the
lens skin and its outward ring remain inside the segment at the maximum
`scaleY`; do not shrink the navigation link or its hit target to create this
space.

```text
visible gap = inset - ring outset - vertical transform growth / 2
```

Do not use `overflow-hidden` or `overflow-clip` to hide an oversized lens. Those
rules mask the geometry defect and can cut off the ring or moving material. A
browser regression must measure the resting gap after accounting for the ring
and sample the `0%`, `28%`, `64%`, and `100%` animation states after the longest
supported slot transition.

Pointer-tracked glass highlights are disabled in production. Do not mount the
tracker or add `glass-sheen`, `glass-control`, or `data-glass-interactive` to a
production surface without a new interaction review covering nested ownership,
pointer exit, keyboard focus, touch behavior, and reduced motion.

## Public assets

Files added to `apps/web/public/` need a clear runtime purpose and an entry in
`docs/governance/assets.md`. Do not copy private historical assets into this
repository. Generated Tauri icons remain derived from their tracked source
assets and are not hand-edited.
