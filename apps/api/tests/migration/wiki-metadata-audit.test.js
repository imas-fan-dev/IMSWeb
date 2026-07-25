'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    applyExistingSemanticMedia,
    parseWikiMetadataAuditArguments
} = require('../../scripts/migration/wiki-metadata-audit.ts');

test('Wiki metadata audit stays read-only unless apply is explicit', () => {
    const dryRun = parseWikiMetadataAuditArguments(['--', '--strict']);
    assert.equal(dryRun.apply, false);
    assert.equal(dryRun.strict, true);
    assert.match(dryRun.report, /data[/\\]migration[/\\]wiki-metadata-audit\.json$/);

    const applied = parseWikiMetadataAuditArguments([
        '--apply', '--report', 'data/migration/custom-wiki-audit.json'
    ]);
    assert.equal(applied.apply, true);
    assert.equal(applied.strict, false);
    assert.equal(
        applied.report,
        path.resolve(__dirname, '../../../..', 'data/migration/custom-wiki-audit.json')
    );
});

test('Wiki metadata audit rejects unknown and incomplete arguments', () => {
    assert.throws(
        () => parseWikiMetadataAuditArguments(['--report']),
        /requires a file/
    );
    assert.throws(
        () => parseWikiMetadataAuditArguments(['--write']),
        /Unknown argument/
    );
});

test('Wiki metadata audit replaces legacy and empty avatar associations with semantic keys', async () => {
    const agencies = [{ id: 1, code: '765', icon_object_key: 'wiki/shared/static/icon/765.webp' }];
    const idols = [
        {
            id: 10,
            agency_code: '765',
            folder_name: 'amami_haruka',
            avatar_object_key: 'wiki/shared/static/assets/images/Production/765Haruka.png'
        },
        {
            id: 11,
            agency_code: '765',
            folder_name: 'kisaragi_chihaya',
            avatar_object_key: null
        }
    ];
    const existing = new Set([
        'wiki/agencies/765/idols/amami_haruka/avatar.webp',
        'wiki/agencies/765/idols/kisaragi_chihaya/avatar.webp'
    ]);
    const updates = [];
    const applied = await applyExistingSemanticMedia({
        story: {
            async listAgencies() { return agencies; },
            async listIdolsWithAgencies() { return idols; },
            async setAgencyIconObjectKey(id, key) { updates.push(['agency', id, key]); },
            async setIdolAvatarObjectKey(id, key) { updates.push(['idol', id, key]); }
        },
        storage: {
            async exists(key) { return existing.has(key); }
        }
    });

    assert.deepEqual(updates, [
        ['idol', 10, 'wiki/agencies/765/idols/amami_haruka/avatar.webp'],
        ['idol', 11, 'wiki/agencies/765/idols/kisaragi_chihaya/avatar.webp']
    ]);
    assert.deepEqual(applied, [
        {
            entity: 'idol',
            id: 10,
            previousKey: 'wiki/shared/static/assets/images/Production/765Haruka.png',
            objectKey: 'wiki/agencies/765/idols/amami_haruka/avatar.webp'
        },
        {
            entity: 'idol',
            id: 11,
            previousKey: null,
            objectKey: 'wiki/agencies/765/idols/kisaragi_chihaya/avatar.webp'
        }
    ]);
});
