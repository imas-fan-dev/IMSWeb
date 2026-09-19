import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

// The reporter and coverage shape is written per domain on purpose. The root
// package may not declare test tooling (scripts/check-workspace-boundaries.mjs
// allows only husky), so a shared preset would have to sit outside every
// workspace that can resolve and type-check `vitest/config`. The invariants that
// must not drift across domains are asserted by the repository reporting test.
export default defineConfig({
    resolve: {
        alias: {
            // Mirrors the `@/*` path in tsconfig.server.json, which the suite
            // already imports production modules through.
            '@': path.resolve(projectRoot, 'src'),
        },
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.{ts,js}'],
        // One process per file matches `node --test`'s default isolation and
        // keeps PostgreSQL pools and module state from crossing between files.
        pool: 'forks',
        isolate: true,
        maxWorkers: process.env.CI ? 2 : 4,
        reporters: process.env.CI
            ? [
                  ['default', {}],
                  [
                      'junit',
                      {
                          outputFile: 'reports/junit-api.xml',
                          suiteName: 'api',
                          // CI logs already carry console output, and the API
                          // suite is chatty enough to bloat the artifact.
                          includeConsoleOutput: false,
                          addFileAttribute: true,
                      },
                  ],
              ]
            : ['default'],
        coverage: {
            provider: 'v8',
            // Coverage belongs to the run that exercises the whole domain, and
            // only that run may be held to a domain-wide threshold: a filtered
            // run over a few files (CI runs `test:assets` in the integration
            // lane) would fail every threshold it was never measured against.
            // The two CI lanes that own a full suite set this flag; `--coverage`
            // on the command line still turns coverage on anywhere.
            enabled: process.env.IMS_TEST_COVERAGE_ENABLED === 'true',
            reportsDirectory: 'coverage',
            reporter: ['text-summary', 'json-summary', 'lcov'],
            // Vitest 4 counts only files a test loaded unless they are listed
            // here, so the untouched part of the source tree stays visible.
            include: ['src/**'],
            // `src/**` also matches the domain README files. The v8 remapper
            // cannot parse them, so leaving them in prints a parse-error stack
            // on every coverage run. They carry no statements either way.
            exclude: ['**/*.d.ts', '**/*.md'],
            // Floored from the 2026-09-19 baseline (statements 76.66, branches
            // 66.15, functions 84.03, lines 79.74); the gate may only move up.
            thresholds: {
                lines: 79,
                branches: 66,
                functions: 84,
                statements: 76,
            },
        },
    },
});
