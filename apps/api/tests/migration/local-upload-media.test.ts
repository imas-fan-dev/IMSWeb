import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'vitest';
import {
    helpText,
    parseArguments
} from '../../scripts/migration/local-upload-media';

test.describe('local upload media', () => {
    test('sync is read-only by default and accepts pnpm separators', () => {
        const options = parseArguments(['--', '--source', './uploads'], {
            IMS_UPLOADS_DIR: '/ignored'
        });
        assert.equal(options.apply, false);
        assert.equal(options.source, path.resolve('./uploads'));
    });

    test('sync requires an explicit apply flag for writes', () => {
        const options = parseArguments(['--apply'], {
            IMS_UPLOADS_DIR: '/tmp/uploads'
        });
        assert.equal(options.apply, true);
        assert.equal(options.source, path.resolve('/tmp/uploads'));
        assert.match(helpText(), /read-only unless --apply/);
    });

    test('sync rejects unknown or incomplete arguments', () => {
        assert.throws(() => parseArguments(['--source']), /requires a value/);
        assert.throws(() => parseArguments(['--unknown']), /Unknown argument/);
    });

    test('CLI loads TypeScript modules through the configured runtime', () => {
        const apiRoot = path.resolve(__dirname, '../..');
        const result = spawnSync(
            process.execPath,
            ['--import', 'tsx', 'scripts/migration/local-upload-media.js'],
            {
                cwd: apiRoot,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    IMS_OBJECT_STORAGE: 'filesystem',
                    TSX_TSCONFIG_PATH: 'tsconfig.server.json'
                }
            }
        );
        assert.equal(result.status, 1);
        assert.match(result.stderr, /requires IMS_OBJECT_STORAGE=s3/);
        assert.doesNotMatch(result.stderr, /is not a function/);
    });
});
