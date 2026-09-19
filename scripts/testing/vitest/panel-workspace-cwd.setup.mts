// Panel-only environment bridge.
//
// Each domain is written to run with its workspace as the process cwd — that is
// what `pnpm --filter <workspace> run test` gives the CI owner steps — and a few
// suites depend on it:
//
//   * Web reads fixtures through `process.cwd()` (`app/`, `public/`,
//     `DESIGN.md`, `src-tauri/`).
//   * API's `tests/migration/legacy-information-media.test.js` registers the tsx
//     CommonJS hook, which resolves the `@/*` tsconfig paths from the cwd.
//
// The root UI panel is a single process rooted at the repository root, so those
// suites fail in the panel while passing in CI. Vitest gives a project its own
// `root`, environment and pool, but not its own cwd, so `vitest.config.mts`
// passes each domain's workspace here and it is restored in that project's
// workers before a test file is imported.
//
// The repository domain does not use this hook: it runs from the repository root
// in the panel, and its suites resolve paths from their own file location.
// `import.meta.url` cannot locate the workspace — inside the Vitest module runner
// it is not a `file:` URL — so the path travels as an environment variable, and
// a missing value fails loudly rather than silently skipping the chdir.
const workspaceRoot = process.env.IMS_PANEL_WORKSPACE_ROOT;

if (!workspaceRoot) {
    throw new Error(
        "IMS_PANEL_WORKSPACE_ROOT is unset: this setup file belongs to the root Vitest panel (vitest.config.mts), not to a domain run",
    );
}

if (process.cwd() !== workspaceRoot) process.chdir(workspaceRoot);
