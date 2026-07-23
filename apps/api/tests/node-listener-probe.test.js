'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

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

    context.diagnostic(
        `listener probe: phase=${terminal.phase} status=${result.status} elapsed=${terminal.elapsedMs}ms`
    );
});
