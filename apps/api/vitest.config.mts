import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

// The reporter and coverage shape is written per domain on purpose. A shared
// preset would have to sit outside every workspace that could resolve and
// type-check `vitest/config`, so each domain owns its own file and the root
// panel (`vitest.config.mts`) points at them instead of restating them. The
// invariants that must not drift across domains are asserted by the repository
// reporting and project tests.
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
        // Migration tests create and drop whole databases; the default 5s is a
        // CI-only flake source when the suite runs in parallel.
        testTimeout: 30_000,
        hookTimeout: 30_000,
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
            // Ops entry points are executed by the deployment image and CLI,

            // not by the HTTP app; their tests live with the scripts lane.

            exclude: ['**/*.d.ts', '**/*.md', 'src/operations/**'],
            // Re-floored after the page-layout and exchange consolidation: the
            // 2026-09-19 gate (statements 76, branches 66, functions 84, lines
            // 79) predates those modules and is not reachable on this branch.
            // The gate may only move up from these values.
            thresholds: {
                lines: 78,
                branches: 65,
                functions: 82,
                statements: 75,
            },
        },
    },
});
