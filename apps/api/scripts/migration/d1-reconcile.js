'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const DEFAULT_FOREIGN_KEYS = [
    { table: 'card_emojis', fields: ['card_id'], references: { table: 'cards', fields: ['id'] } },
    { table: 'idols', fields: ['agency_id'], references: { table: 'agencies', fields: ['id'] } },
    { table: 'story_cards', fields: ['idol_id'], references: { table: 'idols', fields: ['id'] } },
    { table: 'story_links', fields: ['card_id'], references: { table: 'story_cards', fields: ['id'] } }
];

const CORE_SEQUENCE_TABLES = ['users', 'news', 'logs', 'cards', 'events', 'card_emojis'];
const STORY_SOURCE_TABLES = new Set([
    '765_stories', '876_stories', 'cg_stories', 'ml_stories',
    'sidem_stories', 'sc_stories', 'gk_stories'
]);

function normalized(value) {
    if (Array.isArray(value)) return value.map(normalized);
    if (!value || typeof value !== 'object') return typeof value === 'string' ? value.normalize('NFC') : value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalized(value[key])]));
}

function rowHash(row) {
    return crypto.createHash('sha256').update(JSON.stringify(normalized(row))).digest('hex');
}

function nullish(value) {
    return value === null || value === undefined;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCoreArtifact(legacy, target) {
    return [legacy, target].some((dataset) =>
        Object.hasOwn(dataset || {}, 'sqliteSequence') ||
        CORE_SEQUENCE_TABLES.every((table) => Object.hasOwn(dataset || {}, table))
    );
}

function coreTableShapeRejects(dataset, side) {
    const rejects = [];
    for (const table of CORE_SEQUENCE_TABLES) {
        if (!Object.hasOwn(dataset, table)) {
            rejects.push({ side, table, code: 'missing-core-table' });
        } else if (!Array.isArray(dataset[table])) {
            rejects.push({ side, table, code: 'invalid-core-table-shape' });
        }
    }
    return rejects;
}

function sqliteSequenceState(dataset, side) {
    const rejects = [];
    if (!Object.hasOwn(dataset, 'sqliteSequence')) {
        rejects.push({ side, table: 'sqliteSequence', code: 'missing-sqlite-sequence' });
        return { valid: false, value: null, rejects };
    }
    const sequence = dataset.sqliteSequence;
    if (!isPlainObject(sequence)) {
        rejects.push({ side, table: 'sqliteSequence', code: 'invalid-sqlite-sequence-shape' });
        return { valid: false, value: null, rejects };
    }
    const expectedKeys = [...CORE_SEQUENCE_TABLES].sort();
    const actualKeys = Object.keys(sequence).sort();
    const missing = expectedKeys.filter((key) => !Object.hasOwn(sequence, key));
    const extra = actualKeys.filter((key) => !CORE_SEQUENCE_TABLES.includes(key));
    if (missing.length || extra.length) {
        rejects.push({
            side,
            table: 'sqliteSequence',
            code: 'sqlite-sequence-key-set',
            missing,
            extra
        });
    }
    for (const table of CORE_SEQUENCE_TABLES) {
        if (!Object.hasOwn(sequence, table)) continue;
        const value = sequence[table];
        if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
            rejects.push({
                side,
                table: 'sqliteSequence',
                code: 'invalid-sqlite-sequence-value',
                field: table,
                value
            });
        }
    }
    return {
        valid: rejects.length === 0,
        value: Object.fromEntries(CORE_SEQUENCE_TABLES.map((table) => [table, sequence[table]])),
        rejects
    };
}

function collectNonNfcStrings(value, path, addReject) {
    if (typeof value === 'string') {
        if (value !== value.normalize('NFC')) addReject(path);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((entry, index) => collectNonNfcStrings(entry, [...path, index], addReject));
        return;
    }
    if (!isPlainObject(value)) return;
    for (const [key, entry] of Object.entries(value)) {
        if (key !== key.normalize('NFC')) addReject([...path, `<key:${key}>`]);
        collectNonNfcStrings(entry, [...path, key], addReject);
    }
}

function targetNfcRejects(dataset, storyScope = null) {
    const rejects = [];
    const seen = new Set();
    const add = (table, row, path) => {
        const field = path.map(String).join('.');
        const signature = JSON.stringify([table, row, field]);
        if (seen.has(signature)) return;
        seen.add(signature);
        rejects.push({ side: 'target', table, row, code: 'non-nfc-text', field });
    };
    for (const [table, rows] of Object.entries(dataset)) {
        if (!Array.isArray(rows)) continue;
        rows.forEach((row, index) => {
            if (
                storyScope && Object.hasOwn(STORY_BASE_KEY_FIELDS, table) &&
                !shouldCompareStoryBaseRow(table, row, storyScope)
            ) return;
            if (
                storyScope && table === 'story_cards' &&
                !shouldCompareNormalizedStoryRow(row, storyScope.cards, STORY_CARD_PROJECTION_KEYS)
            ) return;
            if (
                storyScope && table === 'story_links' &&
                !shouldCompareNormalizedStoryRow(row, storyScope.links, STORY_LINK_PROJECTION_KEYS)
            ) return;
            collectNonNfcStrings(row, [], (path) => add(table, index, path));
            if (table !== 'story_legacy_rows' || typeof row?.row_json !== 'string') return;
            try {
                const parsed = JSON.parse(row.row_json);
                collectNonNfcStrings(parsed, ['row_json(parsed)'], (path) => add(table, index, path));
            } catch {
                // Malformed landing JSON is reported by landingHashRejects.
            }
        });
    }
    return rejects;
}

function encodedKey(row, fields) {
    return JSON.stringify(fields.map((field) => normalized(row[field])));
}

function inferredSourceKeyFields(table, rows) {
    const candidates = table === 'story_links'
        ? [
            ['source_table', 'source_id', 'source_link_index'],
            ['legacy_table', 'legacy_id'],
            ['id']
        ]
        : [
            ['legacy_table', 'legacy_id'],
            ['source_table', 'source_id'],
            ['id']
        ];
    return candidates.find((fields) => rows.some((row) => fields.every((field) => field in row))) || [];
}

function sourceKeySummary(rows, fields) {
    if (!fields.length) return null;
    const counts = new Map();
    for (const row of rows) {
        const key = encodedKey(row, fields);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    const duplicates = [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ key: JSON.parse(key), count }))
        .sort((left, right) => JSON.stringify(left.key).localeCompare(JSON.stringify(right.key)));
    return { fields, total: rows.length, unique: counts.size, duplicates };
}

function summarizeTable(rows, options = []) {
    const resolved = Array.isArray(options) ? { criticalFields: options } : options;
    const criticalFields = resolved.criticalFields || [];
    const sourceKeyFields = resolved.sourceKeyFields || inferredSourceKeyFields(resolved.table || '', rows);
    const ids = rows.map((row) => Number(row.id)).filter(Number.isFinite);
    const nulls = Object.fromEntries(criticalFields.map((field) => [
        field,
        rows.filter((row) => nullish(row[field])).length
    ]));
    const status = {};
    for (const row of rows) {
        if (typeof row.status === 'string') status[row.status] = (status[row.status] || 0) + 1;
    }
    return {
        count: rows.length,
        primaryKey: ids.length ? { min: Math.min(...ids), max: Math.max(...ids) } : null,
        criticalNulls: nulls,
        sourceKeys: sourceKeySummary(rows, sourceKeyFields),
        normalizedRowHashes: rows.map(rowHash).sort(),
        status
    };
}

function normalizeConfig(input = {}) {
    const looksLegacy = Object.values(input).every((value) => Array.isArray(value));
    const tableInput = input.tables || (looksLegacy ? input : {});
    const tables = {};
    for (const [table, value] of Object.entries(tableInput)) {
        tables[table] = Array.isArray(value) ? { criticalFields: value } : { ...value };
    }
    return {
        tables,
        foreignKeys: Array.isArray(input.foreignKeys) ? input.foreignKeys : DEFAULT_FOREIGN_KEYS
    };
}

function validateForeignKeyDefinition(definition) {
    if (
        !definition || typeof definition.table !== 'string' || !Array.isArray(definition.fields) ||
        !definition.references || typeof definition.references.table !== 'string' ||
        !Array.isArray(definition.references.fields) ||
        definition.fields.length === 0 || definition.fields.length !== definition.references.fields.length
    ) {
        throw new Error(`Invalid foreign key definition: ${JSON.stringify(definition)}`);
    }
}

function foreignKeyViolations(dataset, definitions = DEFAULT_FOREIGN_KEYS) {
    const violations = [];
    for (const definition of definitions) {
        validateForeignKeyDefinition(definition);
        const children = dataset[definition.table];
        const parents = dataset[definition.references.table];
        if (!Array.isArray(children) || !Array.isArray(parents)) continue;
        const parentKeys = new Set(parents.map((row) => encodedKey(row, definition.references.fields)));
        for (let index = 0; index < children.length; index += 1) {
            const row = children[index];
            const values = definition.fields.map((field) => row[field]);
            if (values.some(nullish)) continue;
            const key = JSON.stringify(normalized(values));
            if (!parentKeys.has(key)) {
                violations.push({
                    table: definition.table,
                    row: index,
                    fields: definition.fields,
                    values: normalized(values),
                    references: definition.references
                });
            }
        }
    }
    return violations;
}

function storyLookups(dataset) {
    const agencyRows = Array.isArray(dataset.agencies) ? dataset.agencies : [];
    const idolRows = Array.isArray(dataset.idols) ? dataset.idols : [];
    const agencies = new Map(agencyRows.map((row) => [row.id, row.code || row.name_cn || row.id]));
    const idols = new Map(idolRows.map((row) => [row.id, {
        agency: agencies.get(row.agency_id) || row.agency_id,
        idol: row.id
    }]));
    return { idols };
}

function aggregateKey(lookups, idolId, category) {
    const idol = lookups.idols.get(idolId) || { agency: '<missing>', idol: idolId };
    return JSON.stringify([idol.agency, idol.idol, normalized(category)]);
}

function normalizedStoryAggregates(dataset, lookups) {
    if (!Array.isArray(dataset.story_cards)) return null;
    const linksByCard = new Map();
    const links = Array.isArray(dataset.story_links) ? dataset.story_links : [];
    for (const link of links) {
        linksByCard.set(link.card_id, (linksByCard.get(link.card_id) || 0) + 1);
    }
    const aggregates = new Map();
    for (const card of dataset.story_cards) {
        const key = aggregateKey(lookups, card.idol_id, card.category);
        const value = aggregates.get(key) || { cards: 0, links: 0, images: 0 };
        value.cards += 1;
        value.links += linksByCard.get(card.id) || 0;
        if (typeof card.image_file === 'string' && card.image_file) value.images += 1;
        aggregates.set(key, value);
    }
    return aggregates;
}

function legacyStoryRows(dataset) {
    if (Array.isArray(dataset.story_legacy_rows)) {
        return dataset.story_legacy_rows.map((record) => {
            try {
                const row = typeof record.row_json === 'string' ? JSON.parse(record.row_json) : record.row_json;
                return row && typeof row === 'object' && !Array.isArray(row)
                    ? { table: record.legacy_table, row }
                    : null;
            } catch {
                return null;
            }
        }).filter(Boolean);
    }
    return Object.entries(dataset)
        .filter(([table, rows]) => table.endsWith('_stories') && Array.isArray(rows))
        .flatMap(([table, rows]) => rows.map((row) => ({ table, row })));
}

function expandedLandingDataset(dataset, includeEmptySourceTables = false) {
    const expanded = Object.fromEntries(Object.entries(dataset).map(([table, rows]) => [
        table,
        Array.isArray(rows) ? [...rows] : rows
    ]));
    if (!Array.isArray(dataset.story_legacy_rows)) return expanded;
    if (includeEmptySourceTables) {
        for (const table of STORY_SOURCE_TABLES) {
            if (!Object.hasOwn(expanded, table)) expanded[table] = [];
        }
    }
    for (const record of dataset.story_legacy_rows) {
        if (typeof record.legacy_table !== 'string') continue;
        let row;
        try {
            row = typeof record.row_json === 'string' ? JSON.parse(record.row_json) : record.row_json;
        } catch {
            continue;
        }
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        if (!Object.hasOwn(expanded, record.legacy_table)) expanded[record.legacy_table] = [];
        expanded[record.legacy_table].push(row);
    }
    return expanded;
}

function landingHashRejects(dataset, side) {
    const rejects = [];
    for (let index = 0; index < (dataset.story_legacy_rows || []).length; index += 1) {
        const record = dataset.story_legacy_rows[index];
        let row;
        try {
            row = typeof record.row_json === 'string' ? JSON.parse(record.row_json) : record.row_json;
        } catch {
            rejects.push({ side, table: 'story_legacy_rows', row: index, code: 'malformed-row-json' });
            continue;
        }
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            rejects.push({ side, table: 'story_legacy_rows', row: index, code: 'malformed-row-json' });
            continue;
        }
        if (
            !Number.isSafeInteger(record.legacy_id) ||
            !Number.isSafeInteger(row.id) ||
            record.legacy_id !== row.id
        ) {
            rejects.push({
                side,
                table: 'story_legacy_rows',
                row: index,
                code: 'legacy-id-row-id-mismatch',
                sourceKey: [record.legacy_table, record.legacy_id],
                legacyId: record.legacy_id,
                rowId: Object.hasOwn(row, 'id') ? row.id : '<missing>',
                legacyIdType: typeof record.legacy_id,
                rowIdType: Object.hasOwn(row, 'id') ? typeof row.id : 'missing'
            });
        }
        const actual = rowHash(row);
        if (record.normalized_hash !== actual) {
            rejects.push({
                side,
                table: 'story_legacy_rows',
                row: index,
                code: 'normalized-hash-mismatch',
                sourceKey: [record.legacy_table, record.legacy_id],
                expected: record.normalized_hash,
                actual
            });
        }
    }
    return rejects;
}

function legacyStoryAggregates(dataset, lookups) {
    const rows = legacyStoryRows(dataset);
    if (!rows.length) return hasStorySourceShape(dataset) ? new Map() : null;
    const cards = new Map();
    for (const { table, row } of rows) {
        const identity = JSON.stringify([table, row.idol_id, normalized(row.category), normalized(row.card_name)]);
        const card = cards.get(identity) || {
            idolId: row.idol_id,
            category: row.category,
            links: 0,
            image: false
        };
        card.links += 1;
        if (typeof row.image_file === 'string' && row.image_file) card.image = true;
        cards.set(identity, card);
    }
    const aggregates = new Map();
    for (const card of cards.values()) {
        const key = aggregateKey(lookups, card.idolId, card.category);
        const value = aggregates.get(key) || { cards: 0, links: 0, images: 0 };
        value.cards += 1;
        value.links += card.links;
        if (card.image) value.images += 1;
        aggregates.set(key, value);
    }
    return aggregates;
}

function storyAggregates(dataset) {
    const lookups = storyLookups(dataset);
    const aggregates = normalizedStoryAggregates(dataset, lookups) || legacyStoryAggregates(dataset, lookups);
    if (!aggregates) return null;
    return Object.fromEntries([...aggregates.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

const STORY_CARD_PROJECTION_KEYS = ['source_table', 'source_id'];
const STORY_LINK_PROJECTION_KEYS = ['source_table', 'source_id', 'source_link_index'];
const STORY_LANDING_PROJECTION_KEYS = ['legacy_table', 'legacy_id'];
const STORY_BASE_KEY_FIELDS = {
    agencies: ['id'],
    idols: ['id'],
    theme_colors: ['name']
};
const STORY_NORMALIZED_TABLES = ['story_legacy_rows', 'story_cards', 'story_links'];

function compareSourceRows(left, right) {
    const table = left.table.localeCompare(right.table);
    if (table) return table;
    const leftId = Number(left.row.id);
    const rightId = Number(right.row.id);
    if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) return leftId - rightId;
    return String(left.row.id).localeCompare(String(right.row.id));
}

function nullable(value) {
    return value === undefined ? null : value;
}

function canonicalStoryProjection(dataset) {
    const sourceRows = legacyStoryRows(dataset).sort(compareSourceRows);
    if (!sourceRows.length) return null;
    const groups = new Map();
    for (const source of sourceRows) {
        const identity = JSON.stringify(normalized([
            source.table, source.row.idol_id, source.row.category, source.row.card_name
        ]));
        const group = groups.get(identity) || { table: source.table, rows: [] };
        group.rows.push(source.row);
        groups.set(identity, group);
    }

    const cards = [];
    const links = [];
    for (const { table, rows } of groups.values()) {
        const first = rows[0];
        cards.push(normalized({
            idol_id: first.idol_id,
            category: first.category,
            card_name: first.card_name,
            subtitle: nullable(first.subtitle),
            image_file: nullable(first.image_file),
            source_table: table,
            source_id: first.id
        }));
        for (const row of rows) {
            links.push(normalized({
                card_source_table: table,
                card_source_id: first.id,
                up_name: row.up_name ?? '',
                video_title: row.video_title ?? '',
                url: row.url ?? '',
                source_table: table,
                source_id: row.id,
                source_link_index: 0
            }));
        }
    }
    return { cards, links };
}

function hasStorySourceShape(dataset) {
    return Array.isArray(dataset.story_legacy_rows) ||
        [...STORY_SOURCE_TABLES].some((table) => Array.isArray(dataset[table]));
}

function isStoryArtifact(legacy) {
    const legacySourceCount = [...STORY_SOURCE_TABLES]
        .filter((table) => Object.hasOwn(legacy || {}, table)).length;
    // Keep a one-key-corrupted formal export recognizable so shape validation can reject it.
    return legacySourceCount >= STORY_SOURCE_TABLES.size - 1;
}

function storyArtifactShapeRejects(legacy, target) {
    const rejects = [];
    for (const table of [...Object.keys(STORY_BASE_KEY_FIELDS), ...STORY_SOURCE_TABLES]) {
        if (!Object.hasOwn(legacy, table)) {
            rejects.push({
                side: 'legacy',
                table,
                code: Object.hasOwn(STORY_BASE_KEY_FIELDS, table)
                    ? 'missing-story-base-table'
                    : 'missing-story-source-table'
            });
        } else if (!Array.isArray(legacy[table])) {
            rejects.push({ side: 'legacy', table, code: 'invalid-story-table-shape' });
        }
    }
    for (const table of [...Object.keys(STORY_BASE_KEY_FIELDS), ...STORY_NORMALIZED_TABLES]) {
        if (!Object.hasOwn(target, table)) {
            rejects.push({ side: 'target', table, code: 'missing-story-target-table' });
        } else if (!Array.isArray(target[table])) {
            rejects.push({ side: 'target', table, code: 'invalid-story-table-shape' });
        }
    }
    return rejects;
}

function migrationOwnedStoryRow(row, ownerField) {
    const marker = row.last_seen_run_id;
    return STORY_SOURCE_TABLES.has(row[ownerField]) && typeof marker === 'string' && (
        marker.startsWith('migration:') || marker === 'legacy-untracked' || marker === ''
    );
}

function expectedStoryScope(legacy) {
    const projection = canonicalStoryProjection(legacy) || { cards: [], links: [] };
    return {
        base: Object.fromEntries(Object.entries(STORY_BASE_KEY_FIELDS).map(([table, keyFields]) => [
            table,
            new Set((Array.isArray(legacy[table]) ? legacy[table] : [])
                .map((row) => encodedKey(row, keyFields)))
        ])),
        landing: new Set(legacyStoryRows(legacy).map(({ table, row }) =>
            encodedKey({ legacy_table: table, legacy_id: row.id }, STORY_LANDING_PROJECTION_KEYS)
        )),
        cards: new Set(projection.cards.map((row) => encodedKey(row, STORY_CARD_PROJECTION_KEYS))),
        links: new Set(projection.links.map((row) => encodedKey(row, STORY_LINK_PROJECTION_KEYS)))
    };
}

function shouldCompareStoryBaseRow(table, row, scope) {
    const keyFields = STORY_BASE_KEY_FIELDS[table];
    return !keyFields || scope.base[table].has(encodedKey(row, keyFields));
}

function scopedTargetTableRows(table, rows, storyScope) {
    if (!storyScope || !Object.hasOwn(STORY_BASE_KEY_FIELDS, table)) return rows;
    return rows.filter((row) => shouldCompareStoryBaseRow(table, row, storyScope));
}

function shouldCompareNormalizedStoryRow(row, expectedKeys, keyFields) {
    return expectedKeys.has(encodedKey(row, keyFields)) || migrationOwnedStoryRow(row, 'source_table');
}

function scopedTargetStoryDataset(target, scope) {
    return {
        ...target,
        story_cards: (Array.isArray(target.story_cards) ? target.story_cards : []).filter((row) =>
            shouldCompareNormalizedStoryRow(row, scope.cards, STORY_CARD_PROJECTION_KEYS)
        ),
        story_links: (Array.isArray(target.story_links) ? target.story_links : []).filter((row) =>
            shouldCompareNormalizedStoryRow(row, scope.links, STORY_LINK_PROJECTION_KEYS)
        )
    };
}

function storyOwnershipRejects(legacy, target) {
    if (!hasStorySourceShape(legacy) && !hasStorySourceShape(target)) return [];
    const scope = expectedStoryScope(legacy);
    const rejects = [];
    const definitions = [
        {
            table: 'story_legacy_rows', ownerField: 'legacy_table', keyFields: STORY_LANDING_PROJECTION_KEYS,
            expected: scope.landing, kind: 'landing'
        },
        {
            table: 'story_cards', ownerField: 'source_table', keyFields: STORY_CARD_PROJECTION_KEYS,
            expected: scope.cards, kind: 'card'
        },
        {
            table: 'story_links', ownerField: 'source_table', keyFields: STORY_LINK_PROJECTION_KEYS,
            expected: scope.links, kind: 'link'
        }
    ];
    for (const definition of definitions) {
        const seen = new Set();
        const targetRows = Array.isArray(target[definition.table]) ? target[definition.table] : [];
        for (let index = 0; index < targetRows.length; index += 1) {
            const row = targetRows[index];
            const encoded = encodedKey(row, definition.keyFields);
            seen.add(encoded);
            const sourceKey = definition.keyFields.map((field) => row[field]);
            const expected = definition.expected.has(encoded);
            const markerValid = Object.hasOwn(row, 'last_seen_run_id') &&
                typeof row.last_seen_run_id === 'string';
            const migrationOwned = markerValid && migrationOwnedStoryRow(row, definition.ownerField);
            if (!markerValid) {
                rejects.push({
                    side: 'target', table: definition.table, row: index,
                    code: 'invalid-story-ownership-marker', sourceKey
                });
            }
            if (expected && !migrationOwned) {
                rejects.push({
                    side: 'target', table: definition.table, row: index,
                    code: 'story-ownership-mismatch', sourceKey,
                    expectedOwnership: 'migration', actualMarker: row.last_seen_run_id ?? '<missing>'
                });
            } else if (!expected && definition.kind === 'landing') {
                rejects.push({
                    side: 'target', table: definition.table, row: index,
                    code: 'extra-story-landing', sourceKey,
                    actualMarker: row.last_seen_run_id ?? '<missing>'
                });
            } else if (!expected && migrationOwned) {
                rejects.push({
                    side: 'target', table: definition.table, row: index,
                    code: `extra-story-${definition.kind}`, sourceKey,
                    actualMarker: row.last_seen_run_id
                });
            }
        }
        for (const encoded of definition.expected) {
            if (seen.has(encoded)) continue;
            rejects.push({
                side: 'target', table: definition.table,
                code: `missing-story-${definition.kind}`,
                sourceKey: JSON.parse(encoded)
            });
        }
    }
    return rejects;
}

function targetStoryProjection(dataset, scope = null) {
    if (!Array.isArray(dataset.story_cards) && !Array.isArray(dataset.story_links)) return null;
    const allCards = Array.isArray(dataset.story_cards) ? dataset.story_cards : [];
    const allLinks = Array.isArray(dataset.story_links) ? dataset.story_links : [];
    const cardsById = new Map(allCards.map((card) => [card.id, card]));
    const cardRows = allCards.filter((card) =>
        !scope || shouldCompareNormalizedStoryRow(card, scope.cards, STORY_CARD_PROJECTION_KEYS)
    );
    const linkRows = allLinks.filter((link) =>
        !scope || shouldCompareNormalizedStoryRow(link, scope.links, STORY_LINK_PROJECTION_KEYS)
    );
    const cards = cardRows.map((card) => normalized({
        idol_id: card.idol_id,
        category: card.category,
        card_name: card.card_name,
        subtitle: nullable(card.subtitle),
        image_file: nullable(card.image_file),
        source_table: card.source_table,
        source_id: card.source_id
    }));
    const links = linkRows.map((link) => {
        const card = cardsById.get(link.card_id);
        return normalized({
            card_source_table: card?.source_table ?? null,
            card_source_id: card?.source_id ?? null,
            up_name: link.up_name ?? '',
            video_title: link.video_title ?? '',
            url: link.url ?? '',
            source_table: link.source_table,
            source_id: link.source_id,
            source_link_index: link.source_link_index ?? 0
        });
    });
    return { cards, links };
}

function projectionSummary(rows, keyFields) {
    return {
        count: rows.length,
        sourceKeys: sourceKeySummary(rows, keyFields),
        normalizedRowHashes: rows.map(rowHash).sort()
    };
}

function rowsBySourceKey(rows, keyFields) {
    const result = new Map();
    for (const row of rows) {
        const key = encodedKey(row, keyFields);
        const values = result.get(key) || [];
        values.push(row);
        result.set(key, values);
    }
    return result;
}

function compareProjectionRows(kind, table, expectedRows, targetRows, keyFields) {
    const expected = rowsBySourceKey(expectedRows, keyFields);
    const target = rowsBySourceKey(targetRows, keyFields);
    const rejects = [];
    const keys = [...new Set([...expected.keys(), ...target.keys()])].sort();
    for (const key of keys) {
        const sourceKey = JSON.parse(key);
        const expectedValues = expected.get(key) || [];
        const targetValues = target.get(key) || [];
        if (!expectedValues.length) {
            rejects.push({
                side: 'target', table, code: `extra-story-${kind}`,
                sourceKey, actual: targetValues
            });
            continue;
        }
        if (!targetValues.length) {
            rejects.push({
                side: 'target', table, code: `missing-story-${kind}`,
                sourceKey, expected: expectedValues
            });
            continue;
        }
        const expectedHashes = expectedValues.map(rowHash).sort();
        const targetHashes = targetValues.map(rowHash).sort();
        if (JSON.stringify(expectedHashes) === JSON.stringify(targetHashes)) continue;
        const expectedValue = expectedValues[0];
        const targetValue = targetValues[0];
        const fields = [...new Set([...Object.keys(expectedValue), ...Object.keys(targetValue)])]
            .filter((field) => JSON.stringify(expectedValue[field]) !== JSON.stringify(targetValue[field]))
            .sort();
        rejects.push({
            side: 'target',
            table,
            code: `story-${kind}-projection-mismatch`,
            sourceKey,
            fields,
            expectedHash: expectedHashes,
            actualHash: targetHashes,
            expected: expectedValues,
            actual: targetValues
        });
    }
    return rejects;
}

function reconcileStoryProjection(legacy, target) {
    const expected = canonicalStoryProjection(legacy) || (
        hasStorySourceShape(legacy) ? { cards: [], links: [] } : canonicalStoryProjection(target)
    );
    const scope = expectedStoryScope(legacy);
    const actual = targetStoryProjection(target, scope);
    if (!expected && !actual) return null;
    const expectedCards = expected?.cards || [];
    const expectedLinks = expected?.links || [];
    const targetCards = actual?.cards || [];
    const targetLinks = actual?.links || [];
    const cardRejects = compareProjectionRows(
        'card', 'story_cards', expectedCards, targetCards, STORY_CARD_PROJECTION_KEYS
    );
    const linkRejects = compareProjectionRows(
        'link', 'story_links', expectedLinks, targetLinks, STORY_LINK_PROJECTION_KEYS
    );
    return {
        summary: {
            cards: {
                expected: projectionSummary(expectedCards, STORY_CARD_PROJECTION_KEYS),
                target: projectionSummary(targetCards, STORY_CARD_PROJECTION_KEYS)
            },
            links: {
                expected: projectionSummary(expectedLinks, STORY_LINK_PROJECTION_KEYS),
                target: projectionSummary(targetLinks, STORY_LINK_PROJECTION_KEYS)
            }
        },
        cardRejects,
        linkRejects
    };
}

function pushReject(rejects, reject) {
    rejects.push(normalized(reject));
}

function invariantRejects(side, table, rows, tableSummary) {
    const rejects = [];
    for (const [field, count] of Object.entries(tableSummary.criticalNulls)) {
        if (!count) continue;
        rows.forEach((row, index) => {
            if (nullish(row[field])) pushReject(rejects, {
                side, table, row: index, code: 'critical-null', field,
                sourceKey: tableSummary.sourceKeys?.fields?.length
                    ? tableSummary.sourceKeys.fields.map((key) => row[key])
                    : null
            });
        });
    }
    for (const duplicate of tableSummary.sourceKeys?.duplicates || []) {
        pushReject(rejects, {
            side, table, code: 'duplicate-source-key',
            fields: tableSummary.sourceKeys.fields,
            values: duplicate.key,
            count: duplicate.count
        });
    }
    return rejects;
}

function reconcile(legacy, target, configInput = {}) {
    const config = normalizeConfig(configInput);
    const storyArtifact = isStoryArtifact(legacy);
    const storyScope = expectedStoryScope(legacy);
    const storySource = hasStorySourceShape(legacy);
    const comparableLegacy = expandedLandingDataset(legacy, storyArtifact);
    const comparableTarget = expandedLandingDataset(target, storyArtifact);
    const tables = [...new Set([...Object.keys(comparableLegacy), ...Object.keys(comparableTarget)])]
        .filter((table) => !table.startsWith('__') && table !== 'sqliteSequence')
        .sort();
    const summary = {};
    const differences = [];
    const rejects = [];

    if (storyArtifact) {
        const shapeRejects = storyArtifactShapeRejects(legacy, target);
        for (const reject of shapeRejects) pushReject(rejects, reject);
        if (shapeRejects.length) differences.push('__story_artifact__');
    }

    if (isCoreArtifact(legacy, target)) {
        const coreShapeRejects = [
            ...coreTableShapeRejects(legacy, 'legacy'),
            ...coreTableShapeRejects(target, 'target')
        ];
        const legacySequence = sqliteSequenceState(legacy, 'legacy');
        const targetSequence = sqliteSequenceState(target, 'target');
        summary.sqliteSequence = { legacy: legacySequence.value, target: targetSequence.value };
        for (const reject of [
            ...coreShapeRejects, ...legacySequence.rejects, ...targetSequence.rejects
        ]) pushReject(rejects, reject);
        if (coreShapeRejects.length) differences.push('__core_artifact__');
        if (
            legacySequence.valid && targetSequence.valid &&
            JSON.stringify(legacySequence.value) !== JSON.stringify(targetSequence.value)
        ) {
            pushReject(rejects, {
                side: 'target', table: 'sqliteSequence', code: 'sqlite-sequence-mismatch',
                expected: legacySequence.value, actual: targetSequence.value
            });
        }
        if (
            !legacySequence.valid || !targetSequence.valid ||
            JSON.stringify(legacySequence.value) !== JSON.stringify(targetSequence.value)
        ) {
            differences.push('__sqlite_sequence__');
        }
    }

    for (const table of tables) {
        const legacyRows = Array.isArray(comparableLegacy[table]) ? comparableLegacy[table] : [];
        const allTargetRows = Array.isArray(comparableTarget[table]) ? comparableTarget[table] : [];
        const targetRows = scopedTargetTableRows(
            table,
            allTargetRows,
            storySource ? storyScope : null
        );
        const combinedRows = [...legacyRows, ...allTargetRows];
        const tableConfig = {
            table,
            ...(config.tables[table] || {}),
            sourceKeyFields: config.tables[table]?.sourceKeyFields ||
                STORY_BASE_KEY_FIELDS[table] || inferredSourceKeyFields(table, combinedRows)
        };
        const legacySummary = summarizeTable(legacyRows, tableConfig);
        const targetSummary = summarizeTable(targetRows, tableConfig);
        const targetIntegritySummary = targetRows === allTargetRows
            ? targetSummary
            : summarizeTable(allTargetRows, tableConfig);
        summary[table] = { legacy: legacySummary, target: targetSummary };
        const existsInLegacy = Object.hasOwn(comparableLegacy, table);
        const existsInTarget = Object.hasOwn(comparableTarget, table);
        if (
            (existsInLegacy && !existsInTarget) ||
            (existsInLegacy && existsInTarget && JSON.stringify(legacySummary) !== JSON.stringify(targetSummary))
        ) differences.push(table);
        rejects.push(
            ...invariantRejects('legacy', table, legacyRows, legacySummary),
            ...invariantRejects('target', table, allTargetRows, targetIntegritySummary)
        );
        if (
            targetIntegritySummary.sourceKeys?.duplicates.length ||
            Object.values(targetIntegritySummary.criticalNulls).some((count) => count > 0)
        ) {
            if (!differences.includes(table)) differences.push(table);
        }
    }

    const legacyForeignKeys = foreignKeyViolations(legacy, config.foreignKeys);
    const targetForeignKeys = foreignKeyViolations(target, config.foreignKeys);
    for (const violation of legacyForeignKeys) pushReject(rejects, { side: 'legacy', code: 'foreign-key', ...violation });
    for (const violation of targetForeignKeys) pushReject(rejects, { side: 'target', code: 'foreign-key', ...violation });
    if (targetForeignKeys.length || JSON.stringify(legacyForeignKeys) !== JSON.stringify(targetForeignKeys)) {
        differences.push('__foreign_keys__');
    }

    const legacyLandingRejects = landingHashRejects(legacy, 'legacy');
    const targetLandingRejects = landingHashRejects(target, 'target');
    rejects.push(...legacyLandingRejects, ...targetLandingRejects);
    if ((legacyLandingRejects.length || targetLandingRejects.length) && !differences.includes('story_legacy_rows')) {
        differences.push('story_legacy_rows');
    }

    const nfcRejects = targetNfcRejects(
        target,
        storySource ? storyScope : null
    );
    for (const reject of nfcRejects) pushReject(rejects, reject);
    for (const reject of nfcRejects) {
        if (!differences.includes(reject.table)) differences.push(reject.table);
    }

    const ownershipRejects = storyOwnershipRejects(legacy, target);
    for (const reject of ownershipRejects) pushReject(rejects, reject);
    for (const reject of ownershipRejects) {
        const marker = reject.table === 'story_cards'
            ? '__story_cards_projection__'
            : reject.table === 'story_links'
                ? '__story_links_projection__'
                : 'story_legacy_rows';
        if (!differences.includes(marker)) differences.push(marker);
    }

    const targetStoryDataset = storySource
        ? scopedTargetStoryDataset(target, storyScope)
        : target;
    const legacyStory = storyAggregates(legacy);
    const targetStory = storyAggregates(targetStoryDataset);
    if ((legacyStory || targetStory) && JSON.stringify(legacyStory) !== JSON.stringify(targetStory)) {
        differences.push('__story_aggregates__');
    }
    const storyProjection = reconcileStoryProjection(legacy, target);
    if (storyProjection?.cardRejects.length) differences.push('__story_cards_projection__');
    if (storyProjection?.linkRejects.length) differences.push('__story_links_projection__');
    for (const reject of storyProjection?.cardRejects || []) pushReject(rejects, reject);
    for (const reject of storyProjection?.linkRejects || []) pushReject(rejects, reject);
    return {
        summary,
        invariants: {
            foreignKeys: { legacy: legacyForeignKeys, target: targetForeignKeys },
            storyAggregates: { legacy: legacyStory, target: targetStory },
            storyProjection: storyProjection?.summary || null
        },
        differences: [...new Set(differences)],
        rejects
    };
}

function parseArguments(argv) {
    const positional = [];
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (!value.startsWith('--')) {
            positional.push(value);
            continue;
        }
        if (value !== '--rejects') throw new Error(`Unknown option: ${value}`);
        if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('--rejects requires a path');
        options.rejects = argv[index + 1];
        index += 1;
    }
    if (positional.length < 2 || positional.length > 3) {
        throw new Error('Usage: d1-reconcile.js <legacy.json> <d1-export.json> [config.json] [--rejects rejects.json]');
    }
    return { legacy: positional[0], target: positional[1], config: positional[2], ...options };
}

function writeRejectManifest(file, result) {
    if (!file) return;
    fs.writeFileSync(file, `${JSON.stringify({
        version: 1,
        generatedAt: new Date().toISOString(),
        differences: result.differences,
        rejects: result.rejects
    }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

function main(argv) {
    const options = parseArguments(argv);
    const legacy = JSON.parse(fs.readFileSync(options.legacy, 'utf8'));
    const target = JSON.parse(fs.readFileSync(options.target, 'utf8'));
    const config = options.config ? JSON.parse(fs.readFileSync(options.config, 'utf8')) : {};
    const result = reconcile(legacy, target, config);
    writeRejectManifest(options.rejects, result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.differences.length || result.rejects.some((reject) => reject.side === 'target')) process.exitCode = 4;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
    foreignKeyViolations,
    canonicalStoryProjection,
    landingHashRejects,
    normalized,
    parseArguments,
    reconcile,
    rowHash,
    sourceKeySummary,
    storyAggregates,
    targetStoryProjection,
    summarizeTable,
    writeRejectManifest
};
