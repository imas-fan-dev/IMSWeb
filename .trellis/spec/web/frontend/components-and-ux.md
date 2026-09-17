# Web components and UX

## Design authority

`apps/web/DESIGN.md` defines the product's visual tokens and application rules.
`apps/web/app/app.css` imports the layered stylesheets under `apps/web/app/styles/`
that implement those tokens. Read both before changing global color, typography,
spacing, radius, elevation, material, or motion.

When a global token changes, update `DESIGN.md` and the stylesheet that declares
it (`app/styles/theme.css` owns every token) together and run
`pnpm --filter @imsweb/web run design:lint`. Do not introduce a one-off token
that duplicates an existing semantic color or spacing value.

### Stylesheet layers

`app/app.css` is an entry, not a stylesheet: four Tailwind imports, one
`@layer overrides;` declaration, then local imports in cascade order (`theme`,
`glass`, `accessibility`, `media`, `app-shell`). Put a new rule in the file that
owns its concern instead of appending to the entry.

Every style rule must sit in one of three layers. An unlayered author rule beats
all of them, which is how this stylesheet used to behave and why the shape is now
pinned by a test rather than by convention:

- `base` — token declarations and element defaults. A utility class may override
these, which is the point.
- `components` — component and material classes (`.glass-*`, `.media-hover`,
`.series-icon-*`). A utility class may still override these.
- `overrides` — only the rules that must win against a utility class on the same
element: the capability fallbacks (`prefers-reduced-motion`,
`prefers-reduced-transparency`, `forced-colors`), attribute-driven hiding such
as the native-glass twins, and the wiki mobile-search lift. Choose this layer
only when the element really carries a competing utility; reaching for it
otherwise hides the real cascade from the next reader.

`@property`, `@keyframes`, `@theme`, and `@custom-variant` stay at the top level
because they do not participate in the cascade.

`tests/unit/lib/stylesheet-layers.test.ts` enforces the import order, the absence
of unlayered rules, and the three layer names. A test that asserts on a rule
reads the files through `tests/unit/support/stylesheet-source.ts` instead of
naming one path, so a later split cannot leave the assertion passing against an
empty string.

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
  defined in `app/styles/theme.css`.
- Respect `prefers-reduced-motion` for non-essential motion.
- Keep loading, error, empty, and success states within stable layout bounds.
- Verify that text, dialogs, fixed actions, maps, and navigation do not overlap
  or create horizontal overflow at mobile and desktop sizes.
- A visually hidden form control must not contribute layout width. Tailwind's
  `.sr-only` sets `width: 1px`, so a wrapper variant that resets a direct
  `.sr-only` child to `w-auto` (as `Field` did) hands an absolutely positioned
  file input its shrink-to-fit width instead: the avatar uploader measured 361px
  and made every App account section 56px wider than a 320px viewport. Keep the
  override at `w-px`, and assert `document.documentElement.scrollWidth ===
  window.innerWidth` at 320px for pages that host hidden inputs.
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

### App navigation

Follow [App navigation](./app-navigation.md) for section ownership, queued tab
input, reading position, history, directory entries, and native verification.
Keep child-page titles visible when their former tab title becomes a section
label. Geometry and safe-area rules apply to both restored pages and direct entry.

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

### App map floating control shapes

The App draws the exchange map controls through the native glass overlay, so the DOM twin's
computed radius is the shape the user sees: `measureCornerRadius` in
`app/lib/native-glass-controls.tsx` reads `borderTopLeftRadius`, caps it at half of the shorter
side, and hands it to `GlassControlView`. That cap matters because Tailwind's `rounded-full`
compiles to `3.40282e38px`, which drew a rounded square until it existed. A standalone control is
a circle (`rounded-full`); a stacked pair is one capsule (`.exchange-map-app-pill-top` /
`.exchange-map-app-pill-bottom`). Do not leave a map control on a `rounded-lg` square. Assert the
shape in a browser test rather than by reading the class string, because the radius decides the
drawing: a circle needs `radius >= min(width, height) / 2` on a square control.

### Map data attribution notice

The OpenMapTiles notice is a licence obligation, and it is no longer drawn inside the map. Keep one
source of truth and a gapless set of entry points:

- Read the notice from the loaded style (`map.getStyle().sources[*].attribution`); the first
  non-empty string wins. Do not copy the text into a component, a contract, or a second metadata
  field, and do not refetch the style JSON to obtain it.
- Parse it once with `parseMapAttribution`
  (`app/pages/community/exchange/exchange-map-attribution.ts`) into ordered
  `{ kind: "text" | "link" }` segments and render those. `dangerouslySetInnerHTML` is forbidden; only
  `https:` hrefs survive and anything else degrades to plain text.
- `null` means the entry is not rendered at all — no disabled button, no empty dialog.
- The entry points must cover a gapless union of widths: the App folding panel, the Web top card at
  768–1023px, the Web bottom navigation below 768px, and the Web discovery rail at 1024px and up.
  Whenever a container gains a width-hiding class, re-check that no width loses its only entry.
- One controlled dialog serves the page. Each entry carries `aria-haspopup="dialog"` and returns
  focus to its trigger on close. The App entry sits in a panel that collapses on the same click, so
  that case falls back to the always-visible menu trigger instead of focusing an `[inert]` node.
- The bottom navigation derives its column count from whether the entry exists (`grid-cols-6` with
  the notice, `grid-cols-5` without). At 375px every item stays at least 44 × 44 CSS pixels and the
  document must not overflow horizontally.

## Scenario: Mobile dialog sizing and scrolling

### 1. Scope / Trigger

Apply this contract to every centered dialog built on `app/components/ui/dialog.tsx`, and whenever a dialog is long enough to exceed a phone viewport, a caller wants to size one, or a footer or close button must stay reachable.

### 2. Signatures

```tsx
DialogContent({ layout?: "scroll" | "pinned", safeArea?: "custom" | "inset" | "viewport", … })
DialogBody({ className, …props }) // data-slot="dialog-body"
```

### 3. Contracts

- `safeArea="inset"` owns its own size. The geometry (`max-h-(--overlay-safe-height)`,
  `w-(--overlay-safe-width)`, centering) is written **after** `className`, and `cn` is
  `twMerge(clsx(...))`, so a caller's `max-h-*` / `w-*` never wins. Do not pass them; delete them
  when you find them, because they read as if they decide the size.
- Scrollability comes from `layout`, not from tailwind-merge resolving `overflow` against
  `overflow-y`. `scroll` (the default) puts `overflow-y-auto overscroll-contain` on the popup;
  `pinned` puts `overflow-hidden` there plus `flex flex-col` display, so the default path is
  byte-identical to the pre-`layout` behaviour.
- `pinned` requires the whole chain to be flex. Any wrapper between `DialogContent` and
  `DialogHeader` / `DialogBody` / `DialogFooter` — usually a `<form>` — must carry
  `flex min-h-0 flex-1 flex-col`. Without it the body cannot shrink, the content overflows the
  `overflow-hidden` popup, and no element scrolls at all.
- `DialogBody` (`min-h-0 flex-1 overflow-y-auto overscroll-contain`) is the only scroll region in
  `pinned`. `DialogHeader` and `DialogFooter` are `shrink-0`, so both stay in place.
- The close button stays `absolute top-2 right-2` and needs no wrapper: the `pinned` root does not
  scroll, so it is already pinned. It grows to 44 × 44 CSS pixels below the `sm` breakpoint.
- Option rows rendered inside a dialog are at least `min-h-11` (44px) on touch widths.
- `DialogFooter`'s `-mx-4 -mb-4` assumes the popup's `p-4`. A wrapper form still aligns the bar to
  the panel edges because the form spans the popup's content box.
- A dialog opens with a 100ms zoom, so geometry read straight after `toBeVisible()` is scaled (a
  44px target measures 43.45px). Wait for finite animations before reading boxes.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Caller passes `max-h-[90svh]` | The primitive's `--overlay-safe-height` still wins |
| `layout="pinned"` with no `DialogBody` | Defect, not a supported shape: content is clipped with no scroller |
| Wrapper form missing `flex min-h-0 flex-1 flex-col` | Body cannot shrink; clipped with no scroller |
| Long content at 320 × 568 | Only the body scrolls; `document.scrollingElement.scrollTop` stays 0 |
| An inner element needs its own limit | Keep that `max-h`: only `DialogContent` sizes are primitive-owned |
| Short dialog, no `layout` prop | Default `scroll` behaviour, unchanged |

### 5. Good / Base / Bad Cases

- Good: the namecard claim and upload dialogs use `layout="pinned"`, make the form the flex chain,
  wrap the fields in `DialogBody`, and keep `DialogFooter` inside the form.
- Base: a short settings dialog keeps the default `scroll` layout and is untouched.
- Bad: removing the popup's `overflow-y-auto` outright, which silently turns every existing dialog
  from "scrolls" into "clipped"; a caller-supplied `max-h`; a hand-rolled
  `grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden` that predates `layout="pinned"`.

### 6. Tests Required

- `tests/unit/components/ui/dialog.test.tsx`: both layouts' rendered classes and `data-layout`, and
  a caller `max-h-[90svh]` failing to override the safe-area height.
- `tests/e2e/namecard-claim-workflow.spec.ts` `@mobile` cases at 375 × 667 and 320 × 568: the panel
  inside `window.visualViewport`, the submit button visible without scrolling, the body overflowing
  and scrolling while the footer and close button boxes do not move, `document.scrollingElement`
  top at 0, and the close button plus every option row at least 44 × 44.
- Real-device soft keyboard `dvh` shrink is device-only evidence; a passing unit or build is not it.

### 7. Wrong vs Correct

```tsx
// Wrong: the caller looks like it owns the size, and the footer cannot stay put.
<DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
  <form>{header}{fields}<DialogFooter /></form>
</DialogContent>

// Correct: the primitive owns the size, and the body is the scroll region.
<DialogContent layout="pinned" className="sm:max-w-2xl">
  <form className="flex min-h-0 flex-1 flex-col space-y-5">
    <DialogHeader />
    <DialogBody className="space-y-5">{fields}</DialogBody>
    <DialogFooter />
  </form>
</DialogContent>
```

## Public assets

Files added to `apps/web/public/` need a clear runtime purpose and an entry in
`docs/governance/assets.md`. Do not copy private historical assets into this
repository. Generated Tauri icons remain derived from their tracked source
assets and are not hand-edited.
