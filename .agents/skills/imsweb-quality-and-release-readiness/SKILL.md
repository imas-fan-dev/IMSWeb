---
name: imsweb-quality-and-release-readiness
description: Run IMSWeb repository rules, documentation checks, workspace quality gates, and assemble release-readiness evidence without performing deployment.
---

## When to Use

Use when validating repository/docs/agent-rule changes, running static quality gates for a Web/API/contracts change, checking pre-commit or CI readiness, or preparing a release evidence checklist.

## Procedure

1. Read root `AGENTS.md` and the `.rules` files owning changed workspaces. Use `docs/development/testing.md` for test owners and `.trellis/spec/repository/index.md` for repository gates.
2. Select checks by scope:
   - Agent/source/docs rules and metadata/links: `pnpm run check:rules`.
   - Cross-workspace dependency boundaries: `pnpm run check:boundaries`.
   - Pre-commit-equivalent fast checks: `pnpm run check:pre-commit`.
   - Web changes: `pnpm --filter @imsweb/web run check` plus focused E2E via `imsweb-playwright-e2e` if browser behavior changed.
   - API changes: `pnpm --filter @imsweb/api run check` and its documented test owner.
   - Full repository quality: `pnpm run check`; full owner regression: `pnpm run test`.
3. For docs changes, ensure long-lived `docs/**/*.md` files retain required heading/metadata and resolving relative links; never place archives/evidence/screenshots under forbidden docs locations. Do not duplicate authoritative app command matrices or wire contracts.
4. For release readiness, compile evidence for intended version, relevant tests, build artifacts, configuration/origins, and managed signing prerequisites from authoritative release docs. State which checks are incomplete and who owns them.
5. Stop at readiness reporting. Publishing, deployment, signing, release creation, or modifying distribution credentials requires a separate explicit user request and the owning release procedure.

## Pitfalls

- `check:pre-commit` is narrower than CI; passing it does not prove the full Web Playwright or all release lanes passed.
- `check:rules`, `check:boundaries`, workspace checks and full `check` cover different concerns; report exactly what ran.
- Do not infer successful signing or deployment from a successful build.
- Do not modify package scripts, release workflows, secrets or signing settings as a side effect of readiness checks.
- Never claim release approval or publish without authorization.

## Verification

- Each reported gate ran to completion and its exit status is recorded.
- Documentation changes pass `pnpm run check:rules`.
- Release readiness report lists artifact/version evidence, checks completed, outstanding items and explicit non-actions.

## Authority

- `AGENTS.md` and owning `.rules` files
- `.trellis/spec/repository/index.md`
- `docs/development/testing.md`
- `docs/README.md` and `scripts/check-docs.mjs`
- Root and workspace `package.json` scripts
- Owner-specific release and deployment docs
