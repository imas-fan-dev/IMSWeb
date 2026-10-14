# Playwright API Dispatcher Verification

Date: 2026-09-08

## Scope

This work moved ordinary Web Playwright same-origin `/api` interception behind one contracts-driven dispatcher. The change is limited to Playwright fixtures, specs, unit tests, and Trellis records; production code and public wire schemas are unchanged.

## Review Findings Resolved

Independent review found and fixed these blocking issues before integration:

- Global seeded API fallbacks and inferred HTTP methods could hide unregistered or wrong-method requests.
- Compatibility mocks defaulted to optional calls, so a missing workflow request could pass.
- Normal and pass-through registrations did not reject every cross-set duplicate order.
- Unanchored dynamic catalog expressions could map unrelated paths to Fudaba or admin Wiki contracts.
- Several catalog entries used the wrong HTTP-error family or omitted a contracts-owned business-error response for the same status.
- Setup, teardown, and contract failures were not always preserved together.
- JSON body and raw body could both be declared, and raw multipart boundaries did not verify `Content-Type`.

The integrated dispatcher now uses exact uppercase method and pathname registration, contracts-owned request and response schemas, explicit bounded counts, cross-set duplicate rejection, exact response validation, and local named pass-throughs only.

## Static Inventory

The final audit covered 30 applicable specs, including the allowed App Namecard reuse:

- direct ordinary same-origin `page.route` or `context.route`: 0;
- ordinary value imports of base Playwright `test`: 0;
- `skipContractCheck`: 0;
- omitted methods: 0;
- method arrays or lowercase methods: 0;
- fixture-global API pass-throughs: 0.

Live seeded API pass-throughs remain only in `home.smoke.spec.ts`, `wiki-mobile.spec.ts`, and `wiki.accessibility.spec.ts`. Each registration has one exact `GET` path, a name, an integration reason, contracts validation, and a bounded count.

## Validation

- Dispatcher unit tests: 25 passed.
- Web check: lint, typecheck, 174 files and 1,030 unit tests, production build, and Classic Wiki CSS check passed.
- Contracts build: 28 entrypoint and loader probes passed.
- Source rules and workspace boundaries passed with zero JSON-wire violations.
- Frontend routing and packaged-client assets: 10 passed.
- App Namecard reuse: 8/8 passed across four Chromium App viewports.
- Producer-map Select stability: 10/10 repeated Firefox runs and 9/9 across the three ordinary browser projects.
- Final integrated CI matrix: 252 passed, 24 expected skips, zero failures across 276 instances, one worker, zero retries, 10.7 minutes.
- LSP diagnostics: zero errors in the dispatcher, catalog, fixture, unit test, and producer-map test.
- `git diff --check`: passed.

## Residual Risk

The three seeded-content browser tests intentionally depend on local development data. A seeded payload or request-count change will now fail those tests at the dispatcher boundary instead of silently reaching an unexpected API response. This is the intended failure mode.
