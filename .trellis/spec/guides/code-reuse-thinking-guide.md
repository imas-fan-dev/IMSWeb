# Code reuse thinking guide

Reuse code when callers share one stable concept and must change together. Do
not abstract two implementations merely because their current text looks alike.

## Search before adding

Search by business term, exported symbol, response field, path fragment, and
test description. Check the established ownership locations:

- Shared wire schemas, response combinators, and path builders in
  `packages/contracts/src/`.
- Runtime-neutral API capabilities in `apps/api/src/ports/`.
- API pure helpers in focused `apps/api/src/utils/<topic>/` modules.
- Web endpoints and transport policy in `apps/web/app/lib/api/`.
- Reusable Web UI in `apps/web/app/components/<domain>/`.
- Page-private Web code beside its page.

## Decide whether the concept is shared

Extract only when at least one statement is true:

- Callers represent the same business rule and must change together.
- A shared boundary needs one canonical schema, path, or error policy.
- Repetition has already caused inconsistent behavior or tests.
- The repository already has an owner for that kind of abstraction.

Keep code separate when the values only happen to match, when ownership differs,
or when the abstraction would need mode flags for unrelated callers.

## Use the local abstraction shape

- Contracts stay flat-first and use narrow export subpaths.
- API domain collaboration uses a port, command, or narrow contract, not another
  capability's handler.
- API utilities are topic-specific. Do not add `shared`, `helpers.ts`,
  `utils.ts`, or utility barrels.
- Web page-private code remains local until a real second consumer exists.
- Web shared components have an interaction or visual contract. Avoid wrappers
  that only rename props or add one class.
- Tests use existing fixtures and helpers from the owning suite when those
  helpers model the same behavior.

## Batch changes

After changing a shared symbol, search for all old and new forms. Verify source,
tests, package exports, docs, and build scripts separately. Matching text can
appear in fixtures that intentionally assert a literal public contract, so
review each occurrence rather than replacing blindly.

## Completion checklist

- [ ] The abstraction has a clear owner and at least one real shared rule.
- [ ] Existing code was searched before a new helper or constant was added.
- [ ] Names describe business responsibility rather than implementation shape.
- [ ] No generic barrel or catch-all module was introduced.
- [ ] All consumers and intentional literals were reviewed.
- [ ] Focused tests prove behavior, not just the helper's existence.
