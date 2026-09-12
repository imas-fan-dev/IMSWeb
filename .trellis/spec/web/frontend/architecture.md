# Web architecture

## Routes and pages

`apps/web/app/routes.ts` is the typed route manifest. It maps URL entries and
layouts directly to route-ready modules under `app/pages/`. The page module owns
its default component, metadata, loaders or actions when present, and URL
parameter handling.

Do not create pass-through `app/routes/` modules. Keep root, public, and admin
layouts in `app/layouts/`. Page modules follow the URL and business hierarchy,
including `app/pages/admin/<page>/` and nested account or community flows.

The route manifest also separates Web and Tauri app targets. Exclude a module at
manifest construction time when it must not enter the app build graph. Do not
filter routes after importing their page modules.

## Ownership by directory

- Page-only UI stays beside its page, under a local `components/` directory
  when the page is complex.
- Page-only request state and browser cache behavior stay in local `hooks/`.
- Pure draft types, labels, formatting, and validation use a focused
  `*-model.ts` file.
- Reusable business components live under `app/components/<domain>/`.
- Foundational and generated primitives live in `app/components/ui/`.
- Cross-page non-UI infrastructure and generic utilities live in `app/lib/`.
- Layouts live in `app/layouts/`.

Import page-private modules directly. Do not add page barrels, restore
`app/features/`, or split a small page only to meet a line-count target.

## Imports and formatting

Use the `~/` alias for `app/` imports, kebab-case filenames, and PascalCase
component exports. Follow `.prettierrc`: two spaces, no semicolons, double
quotes, 80 columns, and the configured Tailwind class sorting.

All unit tests stay under `tests/unit/` and mirror the production owner. Do not
place `*.test.*` or `*.spec.*` files under `app/`.

## Tauri app shell

Device work goes through `apps/web/scripts/app-device.js` and the `app` or
`app:doctor` package scripts. Target, profile, and device remain arguments. Do
not add one script per combination or call the Tauri CLI from new wrappers.

`apps/web/src-tauri/gen/` is derived output. Never commit or hand-edit it.
Native plugin sources live under `src-tauri/plugins/<plugin>/`, and signing
credentials stay outside the repository.
