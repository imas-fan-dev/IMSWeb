# E2E Stability Debug Retrospective

## 1. Root Cause Categories

- **B - Cross-layer contract**: App pages used `http://127.0.0.1:1420` for API requests while the dispatcher intercepted only the Playwright page origin, `http://localhost:1420`. Strict fixtures, Vite proxying, and runner configuration did not share one origin contract.
- **C - Change propagation failure**: only three App specs used the shared dispatcher fixture. Moving to strict automatic ownership exposed missing Wiki, Exchange, map, account, and avatar registrations across the rest of the suite.
- **D - Test coverage gap**: focused scenarios passed while the full project matrix still exposed loader call-count, WebKit reload, keyboard drag, and fixture-ownership failures. CI artifact behavior and source policy also lacked regression coverage.
- **E - Implicit assumption**: retries, fixed waits, fixed animation-frame counts, shared dev-server ports, and broad Vite watching assumed timing and process state that the tests did not own.

## 2. Why Earlier Fixes Failed

1. Adding configured API origins fixed the host mismatch but did not register every request made by specs that had previously bypassed the dispatcher. Fail-closed behavior correctly exposed the incomplete migration.
2. Replacing `waitForTimeout()` with `performance.now()` polling changed the syntax without changing the timing assumption. Controlled clocks were required for tested deadlines.
3. Advancing a controlled clock by one fixed frame still assumed React and animation state had committed. The reliable Wiki dial fix advances controlled frames until the observable position settles.
4. The first App CORS test required an OPTIONS preflight, but Playwright-fulfilled cross-origin writes did not expose that browser request. The final test asserts the actual PUT/DELETE origins and returned `Access-Control-Allow-Origin` header.
5. One full Web owner run lost its server because a concurrent reviewer terminated the shared listener. This was a validation ownership conflict, not an application failure.
6. A later same-URL reload was initially investigated as a session regression. Trace evidence and filesystem timestamps showed concurrent Tauri icon-source writes triggering Vite. Excluding that non-runtime directory fixed the infrastructure cause while preserving the strict one-call session assertion.

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Architecture | Install one automatic, contracts-driven dispatcher fixture in every App and Web spec; match normalized exact page/API origins and fail closed | Done |
| P0 | Test policy | Keep retries at zero and point Vite at an unused upstream so missing fixtures fail at the owning request | Done |
| P0 | Source governance | Recursively reject fixed waits, elapsed-time polling, base fixture bypasses, direct JSON API routes, HAR routes, and unresolved route matchers | Done |
| P0 | Process ownership | Run only one Playwright owner per base URL; concurrent lanes require distinct owned servers | Documented |
| P1 | Observable synchronization | Use DOM, request, focus, geometry, animation, or controlled-clock state instead of fixed elapsed time or frame counts | Done |
| P1 | Matrix ownership | Keep full primary projects and tag only unique secondary browser/device invariants; inventory every authorized skip | Done |
| P1 | Runtime isolation | Ignore non-runtime Tauri icon sources in the Web Vite watcher | Done |
| P1 | CI evidence | Upload failure-only Playwright traces and screenshots with bounded retention | Done |

## 4. Systematic Expansion

- **Similar issues**: any new App API origin, direct `page.route`, wall-clock wait, or browser project can reopen the same failure class. The dispatcher/configuration and source-policy tests now cover these entry points.
- **Design improvement**: strict automatic fixture ownership makes an unregistered request fail at the API boundary instead of leaking to a local service or Vite proxy.
- **Process improvement**: collection counts and repeated zero-retry full-matrix runs are acceptance evidence, while focused repeats are diagnostic evidence. Both are needed; one does not replace the other.
- **Knowledge improvement**: trace network events and watched-file timestamps are discriminating evidence for a full document reload. Widening call counts or retrying would hide that class of infrastructure failure.

## 5. Knowledge Capture

- [x] Updated `.trellis/spec/web/frontend/testing.md` with automatic fixture, origin, matrix, timing, process-ownership, and Vite watcher contracts.
- [x] Added AST-based source-policy regressions.
- [x] Added strict App origin and CI artifact contract regressions.
- [x] Recorded matrix ownership and authorized skips in `research/e2e-inventory.md`.
- [x] Recorded final commands and stability evidence in `verification.md`.
