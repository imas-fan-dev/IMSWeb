// Merged from 2 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { registerAuthTests } from './node-security/auth.owner.js';
import { registerChronicleEventTests } from './node-security/chronicle-event.owner.js';
import { registerCompiledEntryEnvironmentTests } from './node-security/compiled-entry-environment.owner.js';
import { registerCompiledListenerStaticAdapterTests } from './node-security/compiled-listener-static-adapter.owner.js';
import { createNodeSecurityFixture } from './node-security/fixture.js';
import { registerFudabaTests } from './node-security/fudaba.owner.js';
import { registerInformationTests } from './node-security/information.owner.js';
import { registerNewsTests } from './node-security/news.owner.js';
import { postgresTest } from './postgres-test-database.ts';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, describe, test } from 'vitest';

// node-listener-probe.test.js
{
    const PROBE = path.join(__dirname, 'fixtures/node-listener-probe.js');

    test.describe('node listener probe', () => {
        test('[RUN-02] loopback listener probe always produces a bounded diagnosis', context => {
            const result = spawnSync(process.execPath, [PROBE], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    IMS_LISTENER_PROBE_TIMEOUT_MS: '2000'
                },
                timeout: 5000
            });

            assert.equal(result.signal, null, result.error?.message);
            assert.notEqual(result.status, null, result.error?.message);

            const reports = result.stdout
                .trim()
                .split('\n')
                .filter(Boolean)
                .map(line => JSON.parse(line));
            assert.ok(reports.length > 0, result.stderr || 'listener probe emitted no report');

            const terminal = reports.at(-1);
            assert.ok(
                ['closed', 'error', 'watchdog'].includes(terminal.phase),
                `unexpected terminal phase: ${terminal.phase}`
            );
            assert.ok(terminal.elapsedMs < 5000, `probe took ${terminal.elapsedMs}ms`);

            // The previous runner attached this as a test diagnostic; the Vitest
            // equivalent is the test's metadata, which keeps the fields machine-readable.
            context.task.meta.listenerProbe = {
                phase: terminal.phase,
                status: result.status,
                elapsedMs: terminal.elapsedMs
            };
        });
    });
}

// node-security.test.js
{
    const fixture = createNodeSecurityFixture({
        test: postgresTest,
        beforeAll,
        afterAll
    });

    // The cases themselves live in the owner modules above, so the file has no
    // `test(...)` declaration to wrap; the suite collects their registrations into
    // one Node security subject instead.
    describe('node security', () => {
        registerCompiledListenerStaticAdapterTests(fixture);
        registerAuthTests(fixture);
        registerFudabaTests(fixture);
        registerChronicleEventTests(fixture);
        registerNewsTests(fixture);
        registerInformationTests(fixture);
        registerCompiledEntryEnvironmentTests(fixture);
    });
}
