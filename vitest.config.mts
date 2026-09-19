import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Local-only development panel.
//
// Every execution domain keeps its own configuration and stays the single
// source of truth for `include`, `environment`, aliases, reporters and coverage
// gates; this file only points the Vitest UI at the three of them so one
// `pnpm run test:ui` can browse, filter and re-run cases across the repository.
// CI never loads it: the lanes keep calling `scripts/testing/run-test-owner.mjs`
// and the per-domain configs exactly as before, so no coverage gate moves here.
//
// The entries use the object form on purpose, for two things a bare path entry
// cannot express.
//
// `root` decides how each domain's `include` resolves. A bare path entry gets an
// implicit `root` (the config file's own directory) that only happens to be right
// for `apps/api` and `apps/web`:
//
//   * api / web  – config directory equals the domain root, so `tests/**` and
//                  `tests/unit/**` keep resolving to the workspace.
//   * repository – the config lives in `scripts/testing/vitest`, while its
//                  `include` is written from the repository root (`tests/**`,
//                  `scripts/**/tests/**`) because the CI call runs it as
//                  `pnpm --filter @imsweb/api exec vitest run --root ../..`.
//                  It needs `root` pinned back to the repository root.
//
// An object entry without `root` inherits the root config's root instead, which
// would make every project scan the repository root. Naming each project keeps
// `--project api|web|repository` filters stable and readable in the UI.
//
// `sequence.groupOrder` keeps each project in its own worker group: Vitest
// refuses to pack two projects with different `maxWorkers` into one group, and
// the API and Web domains cap `maxWorkers` at 4 while the repository domain
// keeps the machine default. Only those two values have to differ, but a
// distinct order per project also keeps the grouping readable in the panel.
//
// api and web also restore their workspace as the worker cwd, because both
// domains are written to run from their workspace (`pnpm --filter … run test`)
// and a few suites resolve fixtures through `process.cwd()` or the tsx hook's
// tsconfig lookup. See scripts/testing/vitest/panel-workspace-cwd.setup.mts.
//
// `tests/vitest-projects.test.mjs` guards that these three entries stay in sync
// with the domain configs that exist on disk.
const workspaceCwdSetup = fileURLToPath(
    new URL('scripts/testing/vitest/panel-workspace-cwd.setup.mts', import.meta.url),
);
const workspaceRoot = (workspace) =>
    fileURLToPath(new URL(workspace, import.meta.url));

export default defineConfig({
    test: {
        projects: [
            {
                extends: 'apps/api/vitest.config.mts',
                root: 'apps/api',
                test: {
                    name: 'api',
                    sequence: { groupOrder: 1 },
                    env: { IMS_PANEL_WORKSPACE_ROOT: workspaceRoot('apps/api') },
                    setupFiles: [workspaceCwdSetup],
                },
            },
            {
                extends: 'apps/web/vitest.config.ts',
                root: 'apps/web',
                test: {
                    name: 'web',
                    sequence: { groupOrder: 2 },
                    env: { IMS_PANEL_WORKSPACE_ROOT: workspaceRoot('apps/web') },
                    setupFiles: [workspaceCwdSetup],
                },
            },
            {
                extends: 'scripts/testing/vitest/vitest.repository.config.mts',
                root: '.',
                test: { name: 'repository', sequence: { groupOrder: 3 } },
            },
        ],
    },
});
