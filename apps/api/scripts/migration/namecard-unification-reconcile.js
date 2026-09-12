'use strict';

// Read-only comparison between the retired legacy namecard tables (cards,
// card_emojis) and the unified tables the application now reads and writes
// (fudaba_cards, namecard_reactions). Never mutates anything: it exists to
// gate whether the legacy tables are safe to turn into a read-only archive.
//
// card_number is used as the join key for every comparison instead of
// legacy_card_id. legacy_card_id is only populated once a claim is approved
// and, since claim approval now updates the bound row in place (it never
// mints a second row), card_number is the one identifier that keeps pointing
// at "the row that represents this legacy card" regardless of claim history.

const path = require('node:path');

function helpText() {
    return [
        'Usage: pnpm run migration:namecard-reconcile -- [options]',
        '',
        'Compares the legacy cards/card_emojis tables against the unified',
        'fudaba_cards/namecard_reactions tables. Read-only: reports drift,',
        'never writes. Exits non-zero when any drift is found.',
        '',
        'Options:',
        '  --manifest <file>   Where to write the JSON report',
        '                      (default: data/migration/namecard-unification-reconcile.json)',
        '  --help',
    ].join('\n');
}

function parseArguments(argv) {
    let manifest = path.resolve(
        __dirname,
        '../../data/migration/namecard-unification-reconcile.json',
    );
    let help = false;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--manifest') {
            const value = argv[index + 1];
            index += 1;
            if (!value || value.startsWith('--')) {
                throw new Error('--manifest requires a file');
            }
            manifest = path.resolve(process.cwd(), value);
        } else if (argument === '--help' || argument === '-h') {
            help = true;
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    return { help, manifest };
}

// Mirrors pg_temp.namecard_media_key from
// 20260819000000_namecard_unification_foundation.sql exactly: a canonical
// `/uploads/namecard/original/<stem>.<ext>` path becomes the semantic object
// key the application now stores; anything else keeps its original form
// rather than throwing, so this script can still report it as a mismatch
// instead of crashing on unexpected legacy data.
const CANONICAL_NAMECARD_PATH =
    /^\/uploads\/namecard\/original\/([^/]+)\.([A-Za-z0-9]+)$/;

function legacyMediaObjectKey(mediaUrl) {
    const match = CANONICAL_NAMECARD_PATH.exec(mediaUrl || '');
    if (match) {
        const [, stem, extension] = match;
        return `community/namecards/assets/${stem}/image.${extension.toLowerCase()}`;
    }
    return String(mediaUrl || '').replace(/^\/+/, '');
}

async function reconcile(client) {
    const missingFromUnified = await client.query(`
        SELECT legacy.id
        FROM public.cards legacy
        WHERE NOT EXISTS (
            SELECT 1 FROM public.fudaba_cards unified
            WHERE unified.card_number = legacy.id
        )
        ORDER BY legacy.id
    `);

    const missingFromLegacy = await client.query(`
        SELECT unified.id, unified.card_number
        FROM public.fudaba_cards unified
        WHERE unified.origin IN ('guest', 'legacy')
          AND NOT EXISTS (
              SELECT 1 FROM public.cards legacy
              WHERE legacy.id = unified.card_number
          )
        ORDER BY unified.card_number
    `);

    // A row that a claim has since retired (soft deleted) or upgraded in
    // place no longer has to mirror the legacy status -- only rows still
    // actively standing in for the legacy submission are compared.
    const statusMismatches = await client.query(`
        SELECT legacy.id AS legacy_id, legacy.status AS legacy_status,
               unified.publication_status AS unified_status
        FROM public.cards legacy
        JOIN public.fudaba_cards unified ON unified.card_number = legacy.id
        WHERE unified.deleted_at IS NULL
          AND unified.publication_status <> (
              CASE legacy.status WHEN 'approved' THEN 'published' ELSE legacy.status END
          )
        ORDER BY legacy.id
    `);

    // A claimed row legitimately carries freshly copied media at a new
    // object key by design, so only rows a claim has never touched are
    // checked against the migration's original key mapping.
    const mediaCandidates = await client.query(`
        SELECT legacy.id AS legacy_id, legacy.image1_url, legacy.image2_url,
               unified.front_object_key, unified.back_object_key
        FROM public.cards legacy
        JOIN public.fudaba_cards unified ON unified.card_number = legacy.id
        WHERE unified.legacy_card_id IS NULL
        ORDER BY legacy.id
    `);
    const mediaMismatches = [];
    for (const row of mediaCandidates.rows) {
        const expectedFront = legacyMediaObjectKey(row.image1_url);
        const expectedBack = legacyMediaObjectKey(row.image2_url);
        if (
            row.front_object_key !== expectedFront ||
            row.back_object_key !== expectedBack
        ) {
            mediaMismatches.push({
                legacyId: row.legacy_id,
                expectedFrontObjectKey: expectedFront,
                actualFrontObjectKey: row.front_object_key,
                expectedBackObjectKey: expectedBack,
                actualBackObjectKey: row.back_object_key,
            });
        }
    }

    const reactionDrift = await client.query(`
        SELECT legacy.id AS legacy_id, reaction.emoji,
               reaction.count AS legacy_count,
               COALESCE(unified_reaction.count, 0) AS unified_count
        FROM public.card_emojis reaction
        JOIN public.cards legacy ON legacy.id = reaction.card_id
        JOIN public.fudaba_cards unified ON unified.card_number = legacy.id
        LEFT JOIN public.namecard_reactions unified_reaction
          ON unified_reaction.card_id = unified.id
         AND unified_reaction.emoji = reaction.emoji
        WHERE reaction.count <> COALESCE(unified_reaction.count, 0)
        ORDER BY legacy.id, reaction.emoji
    `);

    const reactionOnlyOnUnifiedSide = await client.query(`
        SELECT legacy.id AS legacy_id, unified_reaction.emoji,
               unified_reaction.count
        FROM public.fudaba_cards unified
        JOIN public.cards legacy ON legacy.id = unified.card_number
        JOIN public.namecard_reactions unified_reaction
          ON unified_reaction.card_id = unified.id
        WHERE NOT EXISTS (
            SELECT 1 FROM public.card_emojis reaction
            WHERE reaction.card_id = legacy.id
              AND reaction.emoji = unified_reaction.emoji
        )
        ORDER BY legacy.id, unified_reaction.emoji
    `);

    // Informational only: card_emojis rows whose card_id never had a matching
    // cards row at all (the foreign key between them was added NOT VALID, so
    // these predate it and were never part of any migration's mapping). Not
    // counted against `clean` -- they are a pre-existing anomaly independent
    // of the unification work, and archiving cards/card_emojis as read-only
    // does not change their status either way.
    const orphanedLegacyReactionRows = await client.query(`
        SELECT reaction.card_id, reaction.emoji, reaction.count
        FROM public.card_emojis reaction
        WHERE NOT EXISTS (
            SELECT 1 FROM public.cards legacy WHERE legacy.id = reaction.card_id
        )
        ORDER BY reaction.card_id, reaction.emoji
    `);

    return {
        missingFromUnified: missingFromUnified.rows.map((row) => row.id),
        missingFromLegacy: missingFromLegacy.rows,
        statusMismatches: statusMismatches.rows,
        mediaMismatches,
        reactionDrift: reactionDrift.rows,
        reactionOnlyOnUnifiedSide: reactionOnlyOnUnifiedSide.rows,
        orphanedLegacyReactionRows: orphanedLegacyReactionRows.rows,
    };
}

async function writeManifest(target, report) {
    const fs = require('node:fs/promises');
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, {
        mode: 0o600,
    });
    await fs.rename(temporary, target);
}

function summarize(counts, result) {
    return {
        ...counts,
        missingFromUnified: result.missingFromUnified.length,
        missingFromLegacy: result.missingFromLegacy.length,
        statusMismatches: result.statusMismatches.length,
        mediaMismatches: result.mediaMismatches.length,
        reactionDrift: result.reactionDrift.length,
        reactionOnlyOnUnifiedSide: result.reactionOnlyOnUnifiedSide.length,
        orphanedLegacyReactionRows: result.orphanedLegacyReactionRows.length,
    };
}

function isClean(summary) {
    return (
        summary.missingFromUnified === 0 &&
        summary.missingFromLegacy === 0 &&
        summary.statusMismatches === 0 &&
        summary.mediaMismatches === 0 &&
        summary.reactionDrift === 0 &&
        summary.reactionOnlyOnUnifiedSide === 0
    );
}

async function main() {
    // Plain --env-file-if-exists=.env (see package.json) is enough here: this
    // script only needs DATABASE_URL, unlike scripts that also load the
    // application's own TypeScript modules and therefore need tsx.
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(`${helpText()}\n`);
        return;
    }
    if (!process.env.DATABASE_URL) {
        throw new Error(
            'Namecard unification reconciliation requires configured PostgreSQL',
        );
    }
    const { Client } = require('pg');
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: Number(
            process.env.IMS_PG_CONNECTION_TIMEOUT_MS || 5000,
        ),
    });
    await client.connect();
    try {
        const result = await reconcile(client);
        const totals = await client.query(`
            SELECT
                (SELECT count(*) FROM public.cards)::int AS legacy_cards,
                (SELECT count(*) FROM public.fudaba_cards
                 WHERE origin IN ('guest', 'legacy'))::int AS unified_compat_cards,
                (SELECT count(*) FROM public.card_emojis)::int AS legacy_reaction_rows,
                (SELECT count(*) FROM public.namecard_reactions)::int
                    AS unified_reaction_rows
        `);
        const counts = totals.rows[0];
        const summary = summarize(
            {
                legacyCards: counts.legacy_cards,
                unifiedCompatCards: counts.unified_compat_cards,
                legacyReactionRows: counts.legacy_reaction_rows,
                unifiedReactionRows: counts.unified_reaction_rows,
            },
            result,
        );
        const clean = isClean(summary);
        const report = {
            generatedAt: new Date().toISOString(),
            clean,
            summary,
            details: result,
        };
        await writeManifest(options.manifest, report);
        process.stdout.write(
            `${JSON.stringify({ manifest: options.manifest, ...summary, clean }, null, 2)}\n`,
        );
        if (!clean) {
            process.stderr.write(
                'Namecard unification reconciliation found drift; the legacy ' +
                    'tables are not safe to archive yet.\n',
            );
            process.exitCode = 1;
        }
    } finally {
        await client.end().catch(() => undefined);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    helpText,
    legacyMediaObjectKey,
    parseArguments,
    reconcile,
    isClean,
    summarize,
};
