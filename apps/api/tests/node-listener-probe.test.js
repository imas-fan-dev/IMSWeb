import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'vitest';

const PROBE = path.join(__dirname, 'fixtures/node-listener-probe.js');

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
