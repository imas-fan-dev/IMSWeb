/**
 * Root contract and governance execution domain.
 *
 * CI hosts this configuration from a workspace that declares vitest, with the
 * repository root pinned explicitly:
 *
 *   pnpm --filter @imsweb/api exec vitest run --root ../.. \
 *     --config <repository>/scripts/testing/vitest/vitest.repository.config.mts <files>
 *
 * It stays a plain object export, which `tests/vitest-reporting.test.mjs`
 * asserts. The root package declares vitest now, but only for the local panel:
 * the CI call above is hosted by the API workspace and depends on no root
 * tooling, and typing this small object is not worth coupling the domain config
 * to it. Losing that type checking is the accepted cost.
 *
 * This domain writes JUnit and nothing else. The measured 2026-09-19 coverage
 * baseline (research/coverage-baseline.md) rules a gate out: the repository lane
 * is three separate `run-test-owner` invocations sharing this one config, so the
 * denominator is the same 3292-line `scripts/**` tree three times while the
 * numerator is whatever that invocation happened to load. `delivery repository`
 * loads 45 of those lines (1.36%), which would cap any threshold at 1, and
 * instrumenting the CPU-bound contracts costs +40s (12s -> 52s) for it. Coverage
 * over `scripts/**` also answers a question this domain does not own: the
 * migration scripts it would count are exercised by the API migration suite.
 */
export default {
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.{js,mjs,ts}",
      "scripts/**/tests/**/*.test.mjs",
    ],
    // Vitest's 5s default is a speed budget this domain cannot keep on shared
    // runners. These suites walk source trees, and the heaviest case in
    // tests/contracts/non-json-boundaries.test.mjs measures 2.5s locally but
    // 5142ms on a GitHub runner, where it failed the deploy-preview lane. The
    // value is a hang ceiling, not a budget, so it only has to outlast the
    // slowest machine that runs it.
    testTimeout: 60_000,
    reporters: process.env.CI
      ? [
          ["default", {}],
          [
            "junit",
            {
              outputFile: "reports/junit-repository.xml",
              suiteName: "repository",
              includeConsoleOutput: false,
              addFileAttribute: true,
            },
          ],
        ]
      : ["default"],
  },
};
