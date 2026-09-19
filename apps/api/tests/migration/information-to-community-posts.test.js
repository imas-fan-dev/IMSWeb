import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'vitest';
import {
    parseInformationPostMigrationArguments
} from '../../scripts/migration/information-to-community-posts.ts';

test('Information post migration is dry-run by default', () => {
    const options = parseInformationPostMigrationArguments([]);

    assert.equal(options.apply, false);
    assert.match(options.report, /information-to-community-posts-dry-run\.json$/);
});

test('Information post migration apply uses the applied report path', () => {
    const options = parseInformationPostMigrationArguments(['--apply']);

    assert.equal(options.apply, true);
    assert.match(options.report, /information-to-community-posts\.json$/);
});

test('Information post migration accepts an explicit report path', () => {
    const options = parseInformationPostMigrationArguments([
        '--report',
        'data/migration/information-posts-test.json'
    ]);

    assert.equal(
        options.report,
        path.resolve(__dirname, '../../../..', 'data/migration/information-posts-test.json')
    );
    assert.throws(
        () => parseInformationPostMigrationArguments(['--report']),
        /--report requires a path/
    );
});
