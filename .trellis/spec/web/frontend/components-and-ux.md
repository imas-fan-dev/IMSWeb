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

Existing Playwright tests such as
`apps/web/tests/e2e/community-exchange.spec.ts` use role-based interaction,
accessibility scans, viewport geometry, and overflow assertions. Follow those
patterns for user-visible workflows.

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
rules mask the geometry defect and can cut off the pointer sheen. A browser
regression must measure the resting gap after accounting for the ring and sample
the `0%`, `28%`, `64%`, and `100%` animation states after the longest supported
slot transition.

## Public assets

Files added to `apps/web/public/` need a clear runtime purpose and an entry in
`docs/governance/assets.md`. Do not copy private historical assets into this
repository. Generated Tauri icons remain derived from their tracked source
assets and are not hand-edited.
