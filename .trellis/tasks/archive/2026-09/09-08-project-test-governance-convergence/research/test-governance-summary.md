# Test governance focused summary

Source: [test-governance.md](./test-governance.md).

## Execution ownership

Use six owners: governance, contracts, API, Web, delivery, and a thin root dispatcher. Root, API, and Web package scripts are already at their enforced maxima of 55, 41, and 20. Governance rejects `test:all`, so convergence must replace existing entries or use internal runners rather than add aliases.

Current duplicate work includes API build three times in root `test`, repeated root checks plus Web unit/build plus API check when `check` and `test` run consecutively, API build twice in its CI lane, and Web unit twice when Web `check` precedes Web `test`. Integration-job Web/API builds remain necessary without verified cross-job artifacts.

## Specialized tests

`apps/api/tests/node-security.test.js` has 36 assertions sharing one PostgreSQL/listener/filesystem fixture. Establish the shared database lifecycle before splitting. First move all assertions by adapter/domain/environment owner without deletion; remove only duplicates whose receiving test proves equivalent status, raw body, headers, database, and filesystem state.

Four Platform profile wire tests are misplaced under the Wiki suite. Move them unchanged to a server-owned file, initially retaining the existing fixture if needed. Verify their names occur once, `test:wiki` keeps its three Wiki tests, and `test:server` discovers the Platform tests.

## Route inventory

The generated JSON contains 315 registrations, 230 request-consuming routes, 306 carriers, and 608 responses. Tracked Markdown has no independent consumer. First make JSON the only freshness artifact and render Markdown explicitly or to stdout. Then replace the whole-source-tree digest with semantic freshness so unrelated comments do not churn the artifact while route, carrier, policy, or response changes still fail stale checks.

## Migration order

Preserve affected-workspace lane semantics and existing script counts. Establish owner commands, remove same-invocation build duplication, move Platform tests, complete PostgreSQL lifecycle, split Node security, delete only proven duplicates, decouple Markdown, then introduce semantic inventory freshness. Run focused suites after every step and full root validation last.
