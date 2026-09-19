/**
 * Root contract and governance execution domain.
 *
 * The root package.json may only declare `husky`
 * (scripts/check-workspace-boundaries.mjs:22), so this configuration is hosted
 * by a workspace that declares vitest:
 *
 *   pnpm --filter @imsweb/api exec vitest run --root ../.. \
 *     --config <repository>/scripts/testing/vitest/vitest.repository.config.mts <files>
 *
 * It must stay a plain object export: a `vitest/config` import is resolved from
 * this file's own directory upward, which never reaches a node_modules holding
 * vitest. Losing type checking here is the accepted cost of keeping the root
 * dependency allowlist unchanged.
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
