# Route inventory convergence verification

Recorded on 2026-09-09 against `release/v1.1`.

## Result

The checked JSON is now the only tracked current route inventory. Normal freshness checks and `--write` read or update only `scripts/contracts/current-wire-contract-inventory.json`. `--report` writes deterministic Markdown to stdout and does not create or modify a Markdown artifact. The former Markdown path is ignored and removed from Git.

The semantic artifact omits source-line churn while retaining files, registration-scoped handler identities, contract-schema provenance, complete canonical response expressions, route and carrier data, response linkage, and diagnostics. Comments, formatting, line shifts, and unrelated source do not alter the JSON. Route, carrier, policy, response, non-JSON linkage, and diagnostic changes still make the artifact stale or fail closed.

## Independent review

The bounded `trellis-check` review `9124e458-389c-4c6` found three blockers before final verification:

1. Formatting-only quote and parenthesis changes affected anonymous handler identities and response expressions.
2. A file-wide occurrence ordinal allowed an unrelated identical anonymous function to renumber mounted handlers.
3. The former 240-character response display cap could hide a semantic suffix change.

The review fixed all three by using canonical semantic token text, registration-scoped anonymous identities, and complete response expressions. It returned `BLOCK/INCONCLUSIVE` because the stop instruction arrived before post-generation verification. The main session inspected the edits and completed every remaining check below.

## Reconciliation

- Mounted registrations: 315
- Request-consuming method/path instances: 230
- Request carriers: 306
- Response expressions: 608
- Current policies: 41 reject, 183 accept-and-project, 18 passthrough, 64 non-object-applicable
- Baseline-compatible subset: 223 method/path instances and 283 carriers at 41/161/17/64
- Unresolved diagnostics: 0
- Deterministic JSON SHA-256 after two consecutive writes: `bc6094e6fa97e1dd2c21ebf86543d1eee62dfba08032bd5b46642a35a24dcca6`

## Verification

- `node --test scripts/contracts/tests/compile-route-inventory.test.mjs`: 19 passed, 0 failed.
- Two consecutive `node scripts/contracts/compile-route-inventory.mjs --write` runs produced the same SHA-256.
- `node scripts/contracts/compile-route-inventory.mjs --report`: emitted the expected 315/230/306/608 reconciliation and `Fatal Diagnostics: None`; no Markdown file was created.
- `pnpm run test:infra`: 84 Node tests and 106 Python tests passed.
- `pnpm --filter @imsweb/api run test`: 711 passed, 0 failed, 0 skipped (68 Node, 471 server, 60 Wiki, 112 migration).
- `pnpm run check:rules`: passed across 820 production source files with 0 JSON-wire violations, 499 API emitters, 202 Web calls, 30 non-JSON entries for 29 handlers, and the expected inventory totals.
- `pnpm run check:boundaries`: passed.
- Primary LSP diagnostics for the compiler and fixture file: 0 errors.
- `git diff --check`: passed.
