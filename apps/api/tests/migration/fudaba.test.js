// Merged from 2 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import 'tsx/cjs';
import { applyMissingTransfers, FudabaMediaBlockedError, parseArguments, r2KeyFromLocator, runFudabaMediaMigration } from '../../scripts/migration/fudaba-media';
import { buildImportPlan, canonicalHash, extractSnapshot, FUDABA_COMMIT, FUDABA_D1_DATABASE_ID, FUDABA_MIGRATIONS, FUDABA_R2_BUCKET, importSnapshot, mapSeries, parseTimestamp, reconcileSnapshot, SERIES_MAPPINGS, sha256, sha256File, SOURCE_TABLES, sourceManifestKey } from '../../scripts/migration/fudaba-metadata';
import { createPostgresTestHarness, postgresIntegrationEnabled } from '../integration/postgres-harness.ts';
import { closeSharedPostgresTestAllocator, makePostgresTestConnectionCloseIdempotent } from '../postgres-test-lifecycle.js';
import { writeRestrictedJsonFixture as writeJson } from './json-fixture-file';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import sharp from 'sharp';
import sqlite3Module from 'sqlite3';
import { afterAll, onTestFinished, test } from 'vitest';

// fudaba-media.test.js
{
    // This migration script is CommonJS and pulls in TypeScript modules with plain
    // CJS `require` calls; its production command runs under the tsx loader for
    // exactly that reason. Vitest hands an inlined CommonJS file's own `require`
    // calls to Node, and Node cannot load an ESM-format `.ts` file from this
    // `"type": "commonjs"` package, so the test registers the same tsx CommonJS
    // hook the script ships with. See verification.md, 批次 C.

    const SOURCE_SHA256 = "a".repeat(64);
    const SNAPSHOT_ID = "fixture-media-snapshot";
    const FRONT_KEY =
        "cards/account-a/11111111-1111-4111-8111-111111111111-front.png";
    const BACK_KEY =
        "cards/account-a/22222222-2222-4222-8222-222222222222-back.png";

    function digest(body) {
        return crypto.createHash("sha256").update(body).digest("hex");
    }

    function emptyRows() {
        return Object.fromEntries(
            Object.keys(SOURCE_TABLES).map((table) => [table, []]),
        );
    }

    function descriptor(table, row, classification = "production-user-content") {
        return {
            key: sourceManifestKey(table, row),
            rowSha256: canonicalHash(row),
            classification,
        };
    }

    async function createFixture() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "ims-fudaba-media-"));
        onTestFinished(() => fs.rmSync(root, { force: true, recursive: true }));
        const snapshotDirectory = path.join(root, "snapshot");
        const sourceRoot = path.join(root, "r2-export");
        fs.mkdirSync(snapshotDirectory);
        fs.mkdirSync(path.join(sourceRoot, "objects"), { recursive: true });
        const front = await sharp({
            create: { width: 8, height: 10, channels: 4, background: "#ff3366" },
        })
            .png()
            .toBuffer();
        const back = await sharp({
            create: { width: 10, height: 8, channels: 4, background: "#3366ff" },
        })
            .png()
            .toBuffer();
        fs.writeFileSync(path.join(sourceRoot, "objects", "front.png"), front);
        fs.writeFileSync(path.join(sourceRoot, "objects", "back.png"), back);

        const createdAt = "2026-07-15T01:02:03.000Z";
        const user = {
            id: "account-a",
            display_name: "Alice",
            avatar_url: "",
            home_city: "上海",
            created_at: createdAt,
            bio: "",
            updated_at: createdAt,
        };
        const oauth = {
            provider: "google",
            provider_user_id: "google-a",
            user_id: "account-a",
            provider_username: "alice",
            provider_avatar_url: "",
            created_at: createdAt,
            updated_at: createdAt,
        };
        const series = { name: "SideM" };
        const card = {
            id: "card-a",
            owner_id: "account-a",
            producer_name: "Alice",
            display_name: "Alice card",
            series: "SideM",
            favorite_idol: "冬马",
            front_image: `/media/${FRONT_KEY}`,
            back_image: `/media/${BACK_KEY}`,
            accent: "#4f64dd",
            bio: "",
            trade_note: "",
            available: 1,
            created_at: createdAt,
            source_url: null,
            source_label: null,
            source_credit: null,
        };
        const rows = emptyRows();
        rows.users = [user];
        rows.oauth_accounts = [oauth];
        rows.series_tags = [series];
        rows.cards = [card];
        const tables = {};
        for (const table of Object.keys(SOURCE_TABLES)) {
            if (["sessions", "oauth_states"].includes(table)) {
                tables[table] = {
                    count: 0,
                    migrated: false,
                    redactedFromSnapshot: true,
                };
            } else {
                tables[table] = rows[table].map((row) => descriptor(table, row));
            }
        }
        const rowsManifest = {
            schemaVersion: 1,
            snapshotId: SNAPSHOT_ID,
            sourceSha256: SOURCE_SHA256,
            tables,
        };
        const sourceJson = {
            schemaVersion: 1,
            snapshotId: SNAPSHOT_ID,
            source: {
                commit: FUDABA_COMMIT,
                d1DatabaseId: FUDABA_D1_DATABASE_ID,
                r2Bucket: FUDABA_R2_BUCKET,
                exportedAt: "2026-07-16T03:04:05.000Z",
            },
            sourceExport: { sha256: SOURCE_SHA256 },
        };
        const snapshot = {
            directory: snapshotDirectory,
            sourceJson,
            rowsManifest,
            rows,
            artifactSha256: {
                source: "b".repeat(64),
                rows: "c".repeat(64),
            },
        };
        writeJson(path.join(snapshotDirectory, "media-manifest.json"), {
            schemaVersion: 2,
            snapshotId: SNAPSHOT_ID,
            sourceSha256: SOURCE_SHA256,
            version: 1,
            mediaPlanSha256: null,
            sourceInventorySha256: null,
            entries: [],
        });
        writeJson(path.join(snapshotDirectory, "rights-manifest.json"), {
            schemaVersion: 2,
            snapshotId: SNAPSHOT_ID,
            sourceSha256: SOURCE_SHA256,
            version: 1,
            mediaPlanSha256: null,
            approvals: [],
        });
        const entries = [
            {
                key: FRONT_KEY,
                versionId: null,
                etag: "front-etag",
                bytes: front.byteLength,
                contentType: "image/png",
                sha256: digest(front),
                customMetadata: { ownerId: "account-a", side: "front" },
                exportPath: "objects/front.png",
            },
            {
                key: BACK_KEY,
                versionId: null,
                etag: "back-etag",
                bytes: back.byteLength,
                contentType: "image/png",
                sha256: digest(back),
                customMetadata: { ownerId: "account-a", side: "back" },
                exportPath: "objects/back.png",
            },
        ].sort((left, right) =>
            Buffer.compare(Buffer.from(left.key), Buffer.from(right.key)),
        );
        const inventory = path.join(snapshotDirectory, "source-r2-inventory.json");
        writeJson(inventory, {
            schemaVersion: 1,
            snapshotId: SNAPSHOT_ID,
            sourceSha256: SOURCE_SHA256,
            sourceCommit: FUDABA_COMMIT,
            d1DatabaseId: FUDABA_D1_DATABASE_ID,
            sourceBucket: FUDABA_R2_BUCKET,
            generatedAt: "2026-07-16T03:04:05.000Z",
            complete: true,
            objectCount: entries.length,
            entries,
        });
        return { root, snapshot, snapshotDirectory, sourceRoot, inventory };
    }

    class MemoryTarget {
        constructor() {
            this.objects = new Map();
            this.puts = [];
            this.deletes = [];
            this.nextId = 1;
            this.failOnPut = null;
            this.storage = {
                get: async (key) => {
                    const current = this.objects.get(key);
                    return current
                        ? {
                              body: current.body,
                              size: current.body.byteLength,
                              contentType: current.contentType,
                              etag: current.etag,
                          }
                        : null;
                },
                putIfUnchanged: async (key, expected, body, options) => {
                    assert.equal(expected, null);
                    assert.equal(options.protectedAccess, true);
                    assert.equal(options.deferredPublication, undefined);
                    if (this.failOnPut === key)
                        throw new Error("injected target failure");
                    if (this.objects.has(key)) return null;
                    const objectId = `object-${this.nextId++}`;
                    const current = {
                        body: Buffer.from(body),
                        byteSize: body.byteLength,
                        contentType: options.contentType,
                        sha256: options.sha256,
                        etag: `etag-${objectId}`,
                        objectId,
                        ownerToken: options.ownerToken,
                        physicalObjectKey: `test/__protected/${key}/objects/${objectId}`,
                        state: "ready",
                        storageScope: "private",
                    };
                    this.objects.set(key, current);
                    this.puts.push({ key, options });
                    return {
                        body: current.body,
                        size: current.byteSize,
                        contentType: current.contentType,
                        etag: current.etag,
                    };
                },
                deleteIfOwned: async (key, ownerToken) => {
                    const current = this.objects.get(key);
                    if (!current || current.ownerToken !== ownerToken) return false;
                    this.objects.delete(key);
                    this.deletes.push({ key, fence: "ownerToken" });
                    return true;
                },
                deleteIfObjectId: async (key, objectId) => {
                    const current = this.objects.get(key);
                    if (!current || current.objectId !== objectId) return false;
                    this.objects.delete(key);
                    this.deletes.push({ key, fence: "objectId" });
                    return true;
                },
            };
        }

        inspectTarget = async (key) => {
            const current = this.objects.get(key);
            return current
                ? {
                      state: current.state,
                      objectId: current.objectId,
                      physicalObjectKey: current.physicalObjectKey,
                      storageScope: current.storageScope,
                      byteSize: current.byteSize,
                      contentType: current.contentType,
                      sha256: current.sha256,
                      etag: current.etag,
                      ownerToken: current.ownerToken,
                  }
                : null;
        };

        runtime() {
            return { storage: this.storage, inspectTarget: this.inspectTarget };
        }
    }

    function migrationOptions(fixture, apply = false) {
        return {
            snapshotDirectory: fixture.snapshotDirectory,
            sourceRoot: fixture.sourceRoot,
            inventory: fixture.inventory,
            targetBucket: "imsweb-media-test",
            apply,
        };
    }

    function approveRights(fixture) {
        const filename = path.join(
            fixture.snapshotDirectory,
            "rights-manifest.json",
        );
        const rights = JSON.parse(fs.readFileSync(filename, "utf8"));
        for (const approval of rights.approvals) {
            approval.status = "approved";
            approval.action = "store-protected";
            approval.reviewedBy = "migration-reviewer";
            approval.reviewedAt = "2026-07-17T00:00:00.000Z";
            approval.evidenceSha256 = digest(`evidence:${approval.bindingSha256}`);
        }
        writeJson(filename, rights);
    }

    function applyConfirmations(report) {
        return {
            confirmSnapshotId: report.snapshotId,
            confirmSourceSha256: report.sourceSha256,
            confirmSourceManifestSha256: report.artifactSha256.sourceManifestSha256,
            confirmRowsSha256: report.artifactSha256.rowsSha256,
            confirmInventorySha256: report.artifactSha256.inventorySha256,
            confirmPlanSha256: report.artifactSha256.planSha256,
            confirmRightsSha256: report.artifactSha256.rightsSha256,
            confirmMediaSha256: report.artifactSha256.mediaSha256,
            confirmSourceBucket: report.sourceBucket,
            confirmTargetBucket: report.targetBucket,
        };
    }

    test.describe('Fudaba media', () => {
        test("restricted JSON fixtures keep pretty output, final newline, and private mode", () => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "ims-json-fixture-"));
            onTestFinished(() => fs.rmSync(root, { force: true, recursive: true }));
            const filename = path.join(root, "fixture.json");
            writeJson(filename, { value: "exact" });
            assert.equal(fs.readFileSync(filename, "utf8"), '{\n  "value": "exact"\n}\n');
            assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
        });

        test("CLI is dry-run by default and requires explicit paths", () => {
            assert.equal(
                parseArguments([
                    "--snapshot",
                    "/tmp/snapshot",
                    "--source-root",
                    "/tmp/export",
                ]).apply,
                false,
            );
            assert.throws(() => parseArguments(["--apply"]), /Usage:/);
            assert.throws(() => parseArguments(["--wat"]), /Unknown option/);
            assert.equal(parseArguments(["--help"]).help, true);
        });

        test("Fudaba R2 locators reject encoded, traversing, or ambiguous paths", () => {
            assert.equal(r2KeyFromLocator(`/media/${FRONT_KEY}`), FRONT_KEY);
            for (const locator of [
                "/media/cards/a/%2e%2e/x.png",
                "/media/cards/a/%252e%252e/x.png",
                "/media/cards/a/front.png?version=1",
                "/media/cards/a/front.png#hash",
                "/media/cards\\a\\front.png",
                "/media/cards/a//front.png",
                "/media/cards/a/%zz.png",
            ])
                assert.throws(
                    () => r2KeyFromLocator(locator),
                    /Fudaba|safe normalized/,
                );
        });

        test("dry-run scaffolds v2 rights and performs no target writes", async () => {
            const fixture = await createFixture();
            let targetResolutions = 0;
            const report = await runFudabaMediaMigration(migrationOptions(fixture), {
                snapshot: fixture.snapshot,
                targetBucket: "imsweb-media-test",
                async resolveTarget() {
                    targetResolutions += 1;
                    throw new Error(
                        "target must not be opened while rights are unknown",
                    );
                },
            });
            assert.equal(report.status, "blocked");
            assert.equal(report.summary.blockers, 2);
            assert.equal(targetResolutions, 0);
            const rightsFile = path.join(
                fixture.snapshotDirectory,
                "rights-manifest.json",
            );
            const mediaFile = path.join(
                fixture.snapshotDirectory,
                "media-manifest.json",
            );
            assert.equal(fs.statSync(rightsFile).mode & 0o777, 0o600);
            assert.equal(fs.statSync(mediaFile).mode & 0o777, 0o600);
            assert.deepEqual(
                JSON.parse(fs.readFileSync(rightsFile, "utf8")).approvals.map(
                    (entry) => entry.status,
                ),
                ["unknown", "unknown"],
            );
        });

        test("approved apply writes private-ready objects, reads back, and converges", async () => {
            const fixture = await createFixture();
            await runFudabaMediaMigration(migrationOptions(fixture), {
                snapshot: fixture.snapshot,
                targetBucket: "imsweb-media-test",
            });
            approveRights(fixture);
            const target = new MemoryTarget();
            const dryRun = await runFudabaMediaMigration(migrationOptions(fixture), {
                snapshot: fixture.snapshot,
                targetBucket: "imsweb-media-test",
                targetRuntime: target.runtime(),
            });
            assert.equal(dryRun.status, "ready");
            assert.equal(dryRun.summary.missing, 2);
            assert.equal(target.puts.length, 0);

            const applied = await runFudabaMediaMigration(
                {
                    ...migrationOptions(fixture, true),
                    ...applyConfirmations(dryRun),
                },
                {
                    snapshot: fixture.snapshot,
                    targetBucket: "imsweb-media-test",
                    targetRuntime: target.runtime(),
                },
            );
            assert.equal(applied.status, "passed");
            assert.equal(applied.summary.uploaded, 2);
            assert.equal(target.puts.length, 2);
            assert.ok(
                target.puts.every((entry) => entry.options.protectedAccess === true),
            );
            const media = JSON.parse(
                fs.readFileSync(
                    path.join(fixture.snapshotDirectory, "media-manifest.json"),
                    "utf8",
                ),
            );
            assert.ok(
                media.entries.every(
                    (entry) =>
                        entry.state === "ready" &&
                        entry.storageScope === "private" &&
                        entry.sha256 === entry.readbackSha256 &&
                        entry.objectId,
                ),
            );

            const repeated = await runFudabaMediaMigration(
                {
                    ...migrationOptions(fixture, true),
                    ...applyConfirmations(applied),
                },
                {
                    snapshot: fixture.snapshot,
                    targetBucket: "imsweb-media-test",
                    targetRuntime: target.runtime(),
                },
            );
            assert.equal(repeated.status, "passed");
            assert.equal(repeated.summary.unchanged, 2);
            assert.equal(repeated.summary.uploaded, 0);
            assert.equal(target.puts.length, 2);
        });

        test("apply confirmations fail before the target runtime is resolved", async () => {
            const fixture = await createFixture();
            await runFudabaMediaMigration(migrationOptions(fixture), {
                snapshot: fixture.snapshot,
                targetBucket: "imsweb-media-test",
            });
            approveRights(fixture);
            let resolutions = 0;
            await assert.rejects(
                runFudabaMediaMigration(migrationOptions(fixture, true), {
                    snapshot: fixture.snapshot,
                    targetBucket: "imsweb-media-test",
                    async resolveTarget() {
                        resolutions += 1;
                        return new MemoryTarget().runtime();
                    },
                }),
                (error) =>
                    error instanceof FudabaMediaBlockedError &&
                    /confirm-snapshot-id/.test(error.message),
            );
            assert.equal(resolutions, 0);
        });

        test("a public or different existing target is a non-overwriting conflict", async () => {
            const fixture = await createFixture();
            await runFudabaMediaMigration(migrationOptions(fixture), {
                snapshot: fixture.snapshot,
                targetBucket: "imsweb-media-test",
            });
            approveRights(fixture);
            const target = new MemoryTarget();
            const key = "community/fudaba/cards/card-a/front.png";
            target.objects.set(key, {
                body: Buffer.from("different"),
                byteSize: 9,
                contentType: "image/png",
                sha256: digest("different"),
                etag: "existing",
                objectId: "existing-object",
                ownerToken: null,
                physicalObjectKey: `public/${key}`,
                state: "ready",
                storageScope: "public",
            });
            const report = await runFudabaMediaMigration(migrationOptions(fixture), {
                snapshot: fixture.snapshot,
                targetBucket: "imsweb-media-test",
                targetRuntime: target.runtime(),
            });
            assert.equal(report.status, "blocked");
            assert.equal(report.summary.conflicts, 1);
            assert.equal(target.puts.length, 0);
            assert.equal(target.objects.get(key).objectId, "existing-object");
        });

        test("batch failure compensates only objects created by the migration", async () => {
            const target = new MemoryTarget();
            const entries = ["one", "two"].map((id) => {
                const body = Buffer.from(`body-${id}`);
                return {
                    entityKind: "card",
                    entityId: id,
                    slot: "front",
                    logicalObjectKey: `community/fudaba/cards/${id}/front.png`,
                    sourceObject: {
                        key: `cards/a/${id}-front.png`,
                        etag: `etag-${id}`,
                        bytes: body.byteLength,
                        contentType: "image/png",
                        sha256: digest(body),
                    },
                    sourceBody: body,
                    bindingSha256: digest(`binding-${id}`),
                    sourceReference: `/media/cards/a/${id}-front.png`,
                };
            });
            target.failOnPut = entries[1].logicalObjectKey;
            await assert.rejects(
                applyMissingTransfers(
                    entries,
                    target.runtime(),
                    "fudaba-media:test",
                    "imsweb-media-test",
                ),
                (error) => {
                    assert.equal(error.message, "injected target failure");
                    assert.ok(
                        error.compensation.some((entry) => entry.fence === "objectId"),
                    );
                    return true;
                },
            );
            assert.equal(target.objects.size, 0);
            assert.ok(
                target.deletes.every((entry) =>
                    ["objectId", "ownerToken"].includes(entry.fence),
                ),
            );
        });

        test("a CAS loser cannot compensate an object created by a competing invocation", async () => {
            const target = new MemoryTarget();
            const body = Buffer.from("competing-body");
            const entry = {
                entityKind: "card",
                entityId: "race",
                slot: "front",
                logicalObjectKey: "community/fudaba/cards/race/front.png",
                sourceObject: {
                    key: "cards/account-a/33333333-3333-4333-8333-333333333333-front.png",
                    etag: "source-race",
                    bytes: body.byteLength,
                    contentType: "image/png",
                    sha256: digest(body),
                },
                sourceBody: body,
                bindingSha256: digest("binding-race"),
                sourceReference:
                    "/media/cards/account-a/" +
                    "33333333-3333-4333-8333-333333333333-front.png",
            };
            const competingOwner = "fudaba-media:snapshot:invocation-b";
            target.storage.putIfUnchanged = async (key) => {
                target.objects.set(key, {
                    body,
                    byteSize: body.byteLength,
                    contentType: "image/png",
                    sha256: digest(body),
                    etag: "competing-etag",
                    objectId: "competing-object",
                    ownerToken: competingOwner,
                    physicalObjectKey: `test/__protected/${key}/objects/competing-object`,
                    state: "ready",
                    storageScope: "private",
                });
                return null;
            };
            await assert.rejects(
                applyMissingTransfers(
                    [entry],
                    target.runtime(),
                    "fudaba-media:snapshot:invocation-a",
                    "imsweb-media-test",
                    "snapshot",
                ),
                /Concurrent target mutation/,
            );
            assert.equal(
                target.objects.get(entry.logicalObjectKey).ownerToken,
                competingOwner,
            );
            assert.equal(
                target.objects.get(entry.logicalObjectKey).objectId,
                "competing-object",
            );
            assert.deepEqual(target.deletes, []);
        });

        test("media apply refuses storage adapters without CAS and fenced deletion", async () => {
            await assert.rejects(
                applyMissingTransfers(
                    [],
                    { storage: {} },
                    "fudaba-media:snapshot:invocation",
                    "imsweb-media-test",
                    "snapshot",
                ),
                /requires CAS and fenced object-storage mutations/,
            );
        });

        test("inventory bytes and rights bindings are immutable migration inputs", async () => {
            const fixture = await createFixture();
            const first = await runFudabaMediaMigration(migrationOptions(fixture), {
                snapshot: fixture.snapshot,
                targetBucket: "imsweb-media-test",
            });
            const rightsFile = path.join(
                fixture.snapshotDirectory,
                "rights-manifest.json",
            );
            const rights = JSON.parse(fs.readFileSync(rightsFile, "utf8"));
            rights.approvals[0].bindingSha256 = "f".repeat(64);
            writeJson(rightsFile, rights);
            await assert.rejects(
                runFudabaMediaMigration(migrationOptions(fixture), {
                    snapshot: fixture.snapshot,
                    targetBucket: "imsweb-media-test",
                }),
                /Rights approval does not match/,
            );
            assert.ok(SHA256_PATTERN_OR_THROW(first.artifactSha256.inventorySha256));
        });
    });

    function SHA256_PATTERN_OR_THROW(value) {
        assert.match(value, /^[a-f0-9]{64}$/);
        return true;
    }
}

// fudaba-metadata-import.test.js
{
    // sqlite3.verbose() returns the module itself after extending the statement
    // prototypes with traced wrappers, so the binding keeps the shape the old
    // CommonJS loader produced.
    const sqlite3 = sqlite3Module.verbose();

    // The shared test allocator used to be closed by a module-level hook inside the
    // harness module. The harness is runner-neutral now, so this file owns its own
    // process-end cleanup.
    afterAll(() => closeSharedPostgresTestAllocator());

    const SOURCE_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE "d1_migrations"(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO d1_migrations (name) VALUES
    ('0001_initial.sql'),
    ('0002_official_demo_card_art.sql'),
    ('0003_public_card_users.sql'),
    ('0004_interactive_card_wall.sql'),
    ('0005_oauth_profiles.sql'),
    ('0006_office_series_tags.sql'),
    ('0007_office_management.sql'),
    ('0008_series_office_covers.sql'),
    ('0009_card_interactions.sql'),
    ('0010_email_credentials.sql');

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    avatar_url TEXT NOT NULL,
    home_city TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    bio TEXT NOT NULL DEFAULT '',
    updated_at TEXT
);
CREATE TABLE oauth_accounts (
    provider TEXT NOT NULL CHECK(provider IN ('google', 'github')),
    provider_user_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_username TEXT NOT NULL,
    provider_avatar_url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (provider, provider_user_id)
);
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE oauth_states (
    state_hash TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK(provider IN ('google', 'github')),
    code_verifier TEXT,
    linking_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE email_credentials (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE offices (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    owner_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    intro TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accent TEXT NOT NULL DEFAULT '#ef5b6c',
    cover_image TEXT NOT NULL,
    is_open INTEGER NOT NULL DEFAULT 1,
    visitor_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TEXT,
    updated_at TEXT
);
CREATE TABLE series_tags (
    name TEXT PRIMARY KEY CHECK(length(name) BETWEEN 1 AND 40)
);
CREATE TABLE office_series_tags (
    office_id TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    series_tag TEXT NOT NULL REFERENCES series_tags(name) ON UPDATE CASCADE ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (office_id, series_tag)
);
CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    producer_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    series TEXT NOT NULL,
    favorite_idol TEXT NOT NULL,
    front_image TEXT NOT NULL,
    back_image TEXT NOT NULL,
    accent TEXT NOT NULL DEFAULT '#4f64dd',
    bio TEXT NOT NULL,
    trade_note TEXT NOT NULL,
    available INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source_url TEXT,
    source_label TEXT,
    source_credit TEXT
);
CREATE TABLE office_cards (
    office_id TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    pinned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    position_x REAL NOT NULL DEFAULT 50,
    position_y REAL NOT NULL DEFAULT 50,
    rotation REAL NOT NULL DEFAULT 0,
    z_index INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (office_id, card_id)
);
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 280),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE exchange_requests (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL REFERENCES offices(id),
    requester_id TEXT NOT NULL REFERENCES users(id),
    recipient_id TEXT NOT NULL REFERENCES users(id),
    wanted_card_id TEXT NOT NULL REFERENCES cards(id),
    offered_card_id TEXT REFERENCES cards(id),
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'accepted', 'declined', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE card_likes (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (card_id, user_id)
);
CREATE TABLE card_favorites (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (card_id, user_id)
);

CREATE INDEX offices_coordinates_idx ON offices(latitude, longitude);
CREATE INDEX offices_city_idx ON offices(city);
CREATE INDEX offices_public_idx ON offices(archived_at, visitor_count DESC);
CREATE INDEX office_cards_office_idx ON office_cards(office_id, pinned_at DESC);
CREATE INDEX office_cards_wall_order_idx ON office_cards(office_id, z_index DESC);
CREATE INDEX messages_office_idx ON messages(office_id, created_at DESC);
CREATE INDEX exchange_recipient_idx
    ON exchange_requests(recipient_id, status, created_at DESC);
CREATE INDEX exchange_requester_idx
    ON exchange_requests(requester_id, status, created_at DESC);
CREATE INDEX oauth_accounts_user_idx ON oauth_accounts(user_id);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX oauth_states_expiry_idx ON oauth_states(expires_at);
CREATE INDEX office_series_tags_series_idx
    ON office_series_tags(series_tag, office_id);
CREATE INDEX card_likes_user_idx ON card_likes(user_id, created_at DESC);
CREATE INDEX card_favorites_user_idx ON card_favorites(user_id, created_at DESC);
CREATE INDEX email_credentials_user_idx ON email_credentials(user_id);

CREATE TRIGGER office_cards_require_active_insert
BEFORE INSERT ON office_cards
WHEN (SELECT archived_at FROM offices WHERE id = NEW.office_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'OFFICE_ARCHIVED');
END;
CREATE TRIGGER office_cards_require_active_update
BEFORE UPDATE ON office_cards
WHEN (SELECT archived_at FROM offices WHERE id = NEW.office_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'OFFICE_ARCHIVED');
END;
CREATE TRIGGER messages_require_active_insert
BEFORE INSERT ON messages
WHEN (SELECT archived_at FROM offices WHERE id = NEW.office_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'OFFICE_ARCHIVED');
END;
CREATE TRIGGER exchanges_require_active_insert
BEFORE INSERT ON exchange_requests
WHEN (SELECT archived_at FROM offices WHERE id = NEW.office_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'OFFICE_ARCHIVED');
END;
`;

    const SESSION_CANARY = 'DO_NOT_IMPORT_SESSION_TOKEN_HASH';
    const STATE_CANARY = 'DO_NOT_IMPORT_OAUTH_STATE_HASH';
    const VERIFIER_CANARY = 'DO_NOT_LEAK_CODE_VERIFIER';
    const PASSWORD_CANARY = 'a'.repeat(64);
    const SALT_CANARY = 'DO_NOT_LEAK_PASSWORD_SALT';
    const SERIES = [...SERIES_MAPPINGS.keys()];
    const TARGET_BUCKET = 'imsweb-media-test';

    function open(filename) {
        return new sqlite3.Database(filename);
    }

    function exec(database, sql) {
        return new Promise((resolve, reject) => {
            database.exec(sql, (error) => error ? reject(error) : resolve());
        });
    }

    function run(database, sql, values = []) {
        return new Promise((resolve, reject) => {
            database.run(sql, values, (error) => error ? reject(error) : resolve());
        });
    }

    function close(database) {
        return new Promise((resolve, reject) => {
            database.close((error) => error ? reject(error) : resolve());
        });
    }

    function readJson(filename) {
        return JSON.parse(fs.readFileSync(filename, 'utf8'));
    }

    function mediaEntry(kind, id, slot, sourceReference) {
        const extension = 'png';
        const bases = {
            account: `community/fudaba/accounts/${id}/${slot}.${extension}`,
            office: `community/fudaba/offices/${id}/${slot}.${extension}`,
            card: `community/fudaba/cards/${id}/${slot}.${extension}`
        };
        const digest = sha256(`${kind}:${id}:${slot}`);
        const bindingSha256 = sha256(`binding:${kind}:${id}:${slot}`);
        return {
            entityKind: kind,
            entityId: id,
            slot,
            sourceReference,
            logicalObjectKey: bases[kind],
            state: 'ready',
            disposition: 'store-protected',
            storageScope: 'private',
            targetBucket: 'imsweb-media-test',
            objectId: `object-${kind}-${id}-${slot}`,
            physicalObjectKey: `test/__protected/${bases[kind]}`,
            targetEtag: `etag-${kind}-${id}-${slot}`,
            bytes: 128,
            contentType: 'image/png',
            bindingSha256,
            sha256: digest,
            readbackSha256: digest
        };
    }

    function snapshotConfirmations(directory) {
        const source = readJson(path.join(directory, 'source.json'));
        return {
            confirmSnapshotId: source.snapshotId,
            confirmSourceSha256: source.sourceExport.sha256,
            confirmSourceManifestSha256: sha256File(path.join(directory, 'source.json')),
            confirmRowsSha256: sha256File(path.join(directory, 'rows-manifest.json')),
            confirmMediaPlanSha256: sha256File(path.join(directory, 'media-plan.json')),
            confirmMediaSha256: sha256File(path.join(directory, 'media-manifest.json')),
            confirmRightsSha256: sha256File(path.join(directory, 'rights-manifest.json')),
            confirmTargetBucket: TARGET_BUCKET
        };
    }

    async function seedMediaControlPlane(pool, directory) {
        await pool.query('DELETE FROM public.s3_object_index');
        await pool.query('DELETE FROM public.s3_object_versions');
        const media = readJson(path.join(directory, 'media-manifest.json'));
        const entries = media.entries.filter((entry) => entry.disposition === 'store-protected');
        for (const entry of entries) {
            await pool.query(
                `INSERT INTO public.s3_object_versions
                (object_id, physical_key, storage_scope, byte_size, content_type,
                 sha256, etag, owner_token, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8)`,
                [
                    entry.objectId,
                    entry.physicalObjectKey,
                    entry.storageScope,
                    entry.bytes,
                    entry.contentType,
                    entry.sha256,
                    entry.targetEtag,
                    Date.parse('2026-07-17T00:00:00.000Z')
                ]
            );
            await pool.query(
                `INSERT INTO public.s3_object_index
                (logical_key, object_id, state, incarnation, operation_id, updated_at)
             VALUES ($1, $2, $3, 1, NULL, $4)`,
                [
                    entry.logicalObjectKey,
                    entry.objectId,
                    entry.state,
                    Date.parse('2026-07-17T00:00:00.000Z')
                ]
            );
        }
        return entries;
    }

    async function createSourceFixture(options = {}) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-fudaba-metadata-'));
        onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
        const source = path.join(root, 'source.sqlite');
        const database = open(source);
        await exec(database, SOURCE_SCHEMA);
        const created = '2026-07-15T01:02:03.000Z';
        const updated = '2026-07-16T02:03:04.000Z';
        await run(database, `INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            'account-a', 'Alice', options.externalAvatar || '/media/account-a.png',
            '上海', created, 'Alice bio', updated
        ]);
        await run(database, `INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            'account-b', 'Bob', options.emptyAvatar ? '' : '/media/account-b.png',
            '东京', created, 'Bob bio', updated
        ]);
        await run(database, `INSERT INTO oauth_accounts VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            'google', 'google-alice', 'account-a', 'alice-google',
            'https://images.example/alice.png', created, updated
        ]);
        if (options.duplicateProviderForAccount) {
            await run(database, `INSERT INTO oauth_accounts VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                'google', 'google-alice-second', 'account-a', 'alice-google-2',
                'https://images.example/alice-2.png', created, updated
            ]);
        }
        await run(database, `INSERT INTO sessions VALUES (?, ?, ?, ?)`, [
            SESSION_CANARY, 'account-a', '2026-08-15T00:00:00.000Z', created
        ]);
        await run(database, `INSERT INTO oauth_states VALUES (?, ?, ?, ?, ?, ?)`, [
            STATE_CANARY, 'google', VERIFIER_CANARY, 'account-a',
            '2026-08-15T00:00:00.000Z', created
        ]);
        await run(database, `INSERT INTO email_credentials VALUES (?, ?, ?, ?, ?, ?)`, [
            ' Bob@Example.COM ', 'account-b', PASSWORD_CANARY, SALT_CANARY, created, updated
        ]);
        await run(database, `INSERT INTO offices VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            'office-a', 'shanghai-office', 'account-a', '上海事务所', 'intro', '上海',
            '徐汇区', options.invalidLatitude ? 120 : 31.2304, 121.4737, '#ef5b6c',
            '/media/office-a.png', 1, 42, created, null,
            options.nullOfficeUpdatedAt ? null : updated
        ]);
        for (const value of SERIES) await run(database, 'INSERT INTO series_tags VALUES (?)', [value]);
        await run(database, 'INSERT INTO office_series_tags VALUES (?, ?, ?)', [
            'office-a', '灰姑娘女孩', 0
        ]);
        await run(database, `INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            'card-wanted', 'account-b', 'Bob P', 'Bob Card', '灰姑娘女孩', '凛',
            '/media/card-wanted-front.png', '/media/card-wanted-back.png', '#4f64dd',
            'bio', 'trade', 1, created, null, null, null
        ]);
        await run(database, `INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            'card-offered', 'account-a', 'Alice P', 'Alice Card', '闪耀色彩', '灯织',
            '/media/card-offered-front.png', '/media/card-offered-back.png', '#536ea8',
            'bio', 'trade', 1, created, 'https://example.com/card', 'source', 'owner'
        ]);
        await run(database, 'INSERT INTO office_cards VALUES (?, ?, ?, ?, ?, ?, ?)', [
            'office-a', 'card-wanted', created, 50, 50, 0, 1
        ]);
        await run(database, 'INSERT INTO messages VALUES (?, ?, ?, ?, ?)', [
            'message-a', 'office-a', 'account-a', 'Welcome', created
        ]);
        await run(database, `INSERT INTO exchange_requests VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            'exchange-a', 'office-a', 'account-a', 'account-b', 'card-wanted',
            options.invalidExchangeOwnership ? 'card-wanted' : 'card-offered',
            'Trade?', 'pending', created, updated
        ]);
        await run(database, 'INSERT INTO card_likes VALUES (?, ?, ?)', [
            'card-wanted', 'account-a', created
        ]);
        await run(database, 'INSERT INTO card_favorites VALUES (?, ?, ?)', [
            'card-wanted', 'account-a', created
        ]);
        if (options.archivedOffice) {
            await run(database, `
            UPDATE offices
            SET archived_at = ?, updated_at = ?
            WHERE id = 'office-a'
        `, [updated, updated]);
        }
        await close(database);
        return { root, source };
    }

    async function createApprovedSnapshot(options = {}) {
        const fixture = await createSourceFixture(options);
        const sourceHashBefore = sha256(fs.readFileSync(fixture.source));
        const result = await extractSnapshot({
            source: fixture.source,
            snapshotId: options.snapshotId || 'fixture-snapshot',
            snapshotRoot: fixture.root,
            d1DatabaseId: 'e585a1b9-16dd-460a-92b2-94f0017a1ead',
            r2Bucket: 'imas-world-card-images',
            appVersion: '0.1.0',
            exportTime: '2026-07-16T03:04:05.000Z',
            fudabaCommit: FUDABA_COMMIT
        });
        assert.equal(sha256(fs.readFileSync(fixture.source)), sourceHashBefore);
        const directory = result.snapshotDirectory;
        const rowsManifest = readJson(path.join(directory, 'rows-manifest.json'));
        for (const [table, rows] of Object.entries(rowsManifest.tables)) {
            if (!Array.isArray(rows)) continue;
            for (const descriptor of rows) {
                descriptor.classification = ['sessions', 'oauth_states'].includes(table)
                    ? 'demo-or-synthetic'
                    : 'production-user-content';
            }
        }
        writeJson(path.join(directory, 'rows-manifest.json'), rowsManifest);

        const entries = [
            mediaEntry(
                'account', 'account-a', 'avatar',
                options.externalAvatar || '/media/account-a.png'
            ),
            ...(options.emptyAvatar
                ? []
                : [mediaEntry('account', 'account-b', 'avatar', '/media/account-b.png')]),
            mediaEntry('office', 'office-a', 'cover', '/media/office-a.png'),
            mediaEntry('card', 'card-wanted', 'front', '/media/card-wanted-front.png'),
            mediaEntry('card', 'card-wanted', 'back', '/media/card-wanted-back.png'),
            mediaEntry('card', 'card-offered', 'front', '/media/card-offered-front.png'),
            mediaEntry('card', 'card-offered', 'back', '/media/card-offered-back.png')
        ];
        const sourceInventorySha256 = sha256('fixture-source-inventory');
        if (options.externalAvatar) {
            const avatar = entries.find((entry) =>
                entry.entityKind === 'account' && entry.entityId === 'account-a' &&
                entry.slot === 'avatar');
            Object.assign(avatar, {
                logicalObjectKey: null,
                state: 'external',
                disposition: 'retain-external',
                storageScope: null,
                targetBucket: null,
                objectId: null,
                physicalObjectKey: null,
                targetEtag: null,
                bytes: null,
                contentType: null,
                sha256: null,
                readbackSha256: null,
                externalUrl: options.externalAvatar
            });
        }
        if (options.omitOfficeCover) {
            const cover = entries.find((entry) =>
                entry.entityKind === 'office' && entry.entityId === 'office-a' &&
                entry.slot === 'cover');
            Object.assign(cover, {
                state: 'omitted',
                disposition: 'omit',
                storageScope: null,
                targetBucket: null,
                objectId: null,
                physicalObjectKey: null,
                targetEtag: null,
                readbackSha256: null
            });
        }
        const planEntries = entries.map((entry) => {
            const external = entry.state === 'external';
            const required = entry.entityKind === 'card';
            const planned = {
                entityKind: entry.entityKind,
                entityId: entry.entityId,
                slot: entry.slot,
                required,
                sourceReference: entry.sourceReference,
                sourceType: external ? 'external' : 'r2',
                requestedAction: external ? 'retain-external' : 'store-protected',
                logicalObjectKey: entry.logicalObjectKey,
                sourceObject: external ? null : {
                    key: entry.sourceReference.replace(/^\/media\//, ''),
                    versionId: null,
                    etag: `source-${entry.entityKind}-${entry.entityId}-${entry.slot}`,
                    bytes: entry.bytes,
                    contentType: entry.contentType,
                    sha256: entry.sha256,
                    metadataSha256: sha256(
                        `metadata:${entry.entityKind}:${entry.entityId}:${entry.slot}`
                    )
                },
                image: external ? null : {
                    format: 'png',
                    width: 8,
                    height: 8,
                    contentType: entry.contentType
                },
                blocker: null
            };
            const bindingSha256 = canonicalHash(planned);
            entry.bindingSha256 = bindingSha256;
            return { ...planned, bindingSha256 };
        });
        const mediaPlan = {
            schemaVersion: 2,
            snapshotId: rowsManifest.snapshotId,
            sourceSha256: rowsManifest.sourceSha256,
            sourceCommit: FUDABA_COMMIT,
            sourceBucket: 'imas-world-card-images',
            sourceInventorySha256,
            entries: planEntries
        };
        writeJson(path.join(directory, 'media-plan.json'), mediaPlan);
        const mediaPlanSha256 = sha256File(path.join(directory, 'media-plan.json'));
        const identity = {
            schemaVersion: 2,
            snapshotId: rowsManifest.snapshotId,
            sourceSha256: rowsManifest.sourceSha256,
            version: 1,
            mediaPlanSha256
        };
        writeJson(path.join(directory, 'media-manifest.json'), {
            ...identity,
            sourceInventorySha256,
            entries
        });
        writeJson(path.join(directory, 'rights-manifest.json'), {
            ...identity,
            approvals: entries.map((entry) => ({
                entityKind: entry.entityKind,
                entityId: entry.entityId,
                slot: entry.slot,
                sourceReference: entry.sourceReference,
                logicalObjectKey: entry.logicalObjectKey,
                bindingSha256: entry.bindingSha256,
                sourceSha256: entry.sha256,
                bytes: entry.bytes,
                contentType: entry.contentType,
                status: entry.state === 'omitted' ? 'denied' : 'approved',
                action: entry.state === 'omitted'
                    ? 'omit'
                    : entry.state === 'external'
                        ? 'retain-external'
                        : 'store-protected',
                reviewedBy: 'fixture-reviewer',
                reviewedAt: '2026-07-16T03:04:05.000Z',
                evidenceSha256: sha256(`evidence:${entry.bindingSha256}`)
            }))
        });
        return { ...fixture, directory, sourceHashBefore };
    }

    function poolFor(harness) {
        const pool = makePostgresTestConnectionCloseIdempotent(new Pool({
            connectionString: harness.databaseUrl,
            max: 1,
            allowExitOnIdle: true
        }));
        return harness.registerConnection(pool, () => pool.end());
    }

    test.describe('Fudaba metadata import', () => {
        test('timestamp and series conversion accept only the locked source contract', () => {
            assert.equal(
                parseTimestamp('2026-07-15 01:02:03', 'created_at').iso,
                '2026-07-15T01:02:03.000Z'
            );
            assert.equal(mapSeries('vα-liv').code, null);
            assert.notEqual(mapSeries('vα-liv').code, '876');
            assert.equal(mapSeries('本家 / 765AS').code, '765');
            assert.throws(() => mapSeries('  SideM  '), /Unknown Fudaba series/);
            assert.throws(() => parseTimestamp('2026-02-31T00:00:00Z', 'created_at'), /invalid/);
            assert.throws(() => parseTimestamp(' 2026-02-01T00:00:00Z', 'created_at'), /invalid/);
            assert.throws(() => parseTimestamp('2026-02-01T00:00:00.0001Z', 'created_at'), /ISO\/SQLite/);
            assert.throws(() => parseTimestamp('now', 'created_at'), /ISO\/SQLite/);
        });

        test('extract creates an immutable, classified snapshot without leaking security rows', async () => {
            const fixture = await createSourceFixture();
            const sourceHash = sha256(fs.readFileSync(fixture.source));
            await assert.rejects(() => extractSnapshot({
                source: fixture.source,
                snapshotId: 'missing-commit'
            }), /Fudaba commit must be/);
            const result = await extractSnapshot({
                source: fixture.source,
                snapshotId: 'extract-contract',
                snapshotRoot: fixture.root,
                d1DatabaseId: 'e585a1b9-16dd-460a-92b2-94f0017a1ead',
                r2Bucket: 'imas-world-card-images',
                appVersion: '0.1.0',
                exportTime: '2026-07-16T03:04:05.000Z',
                fudabaCommit: FUDABA_COMMIT
            });
            assert.equal(sha256(fs.readFileSync(fixture.source)), sourceHash);
            for (const filename of [
                'source.json', 'database.sqlite', 'rows-manifest.json',
                'media-manifest.json', 'rights-manifest.json', 'reconciliation.json'
            ]) {
                const artifact = path.join(result.snapshotDirectory, filename);
                assert.equal(fs.existsSync(artifact), true, filename);
                assert.equal(fs.statSync(artifact).mode & 0o777, 0o600, `${filename} mode`);
            }
            const source = readJson(path.join(result.snapshotDirectory, 'source.json'));
            assert.equal(source.source.commit, FUDABA_COMMIT);
            assert.deepEqual(source.source.migrations, FUDABA_MIGRATIONS);
            assert.equal(source.sourceExport.sha256, sourceHash);
            assert.notEqual(source.database.sha256, sourceHash);
            const rows = readJson(path.join(result.snapshotDirectory, 'rows-manifest.json'));
            assert.equal(rows.summary.total, 22);
            assert.equal(rows.summary.classifications.unknown, 22);
            assert.equal(rows.summary.operationalRowsExcluded, 2);
            assert.deepEqual(rows.tables.sessions, {
                count: 1,
                migrated: false,
                redactedFromSnapshot: true
            });
            assert.deepEqual(rows.tables.oauth_states, {
                count: 1,
                migrated: false,
                redactedFromSnapshot: true
            });
            const redactedDatabase = fs.readFileSync(
                path.join(result.snapshotDirectory, 'database.sqlite')
            );
            for (const secret of [SESSION_CANARY, STATE_CANARY, VERIFIER_CANARY]) {
                assert.equal(redactedDatabase.includes(Buffer.from(secret)), false, secret);
            }
            const auditText = [
                'source.json', 'rows-manifest.json', 'media-manifest.json',
                'rights-manifest.json', 'reconciliation.json'
            ].map((filename) => fs.readFileSync(path.join(result.snapshotDirectory, filename), 'utf8'))
                .join('\n');
            for (const secret of [
                SESSION_CANARY, STATE_CANARY, VERIFIER_CANARY, PASSWORD_CANARY, SALT_CANARY
            ]) assert.equal(auditText.includes(secret), false, secret);
        });

        test('planning preserves count provenance and excludes ephemeral auth state', async () => {
            const snapshot = await createApprovedSnapshot();
            const plan = await buildImportPlan(snapshot.directory);
            assert.deepEqual(plan.summary, { included: 20, excluded: 2, failed: 0 });
            assert.deepEqual(plan.sourceTables.sessions, {
                source: 1,
                included: 0,
                excluded: 1,
                failed: 0
            });
            for (const table of Object.values(plan.sourceTables)) {
                assert.equal(table.source, table.included + table.excluded + table.failed);
            }
            assert.equal(plan.operations.length, 21);
            assert.equal(plan.operations.some(({ table }) =>
                ['platform_oauth_states', 'platform_refresh_sessions'].includes(table)), false);
            const office = plan.rows.find(({ sourceTable }) => sourceTable === 'offices');
            assert.deepEqual(office.visitorCount, {
                source: 42,
                imported: 0,
                verifiedProductionCount: false,
                evidence: null
            });
            const serialized = JSON.stringify({ rows: plan.rows, operations: plan.operations.map(
                ({ row, ...operation }) => ({ ...operation, row: Object.fromEntries(
                    Object.entries(row).filter(([key]) => !['password_hash', 'salt'].includes(key))
                ) })
            ) });
            for (const secret of [SESSION_CANARY, STATE_CANARY, VERIFIER_CANARY]) {
                assert.equal(serialized.includes(secret), false);
            }
        });

        test('planning handles source-null update times and empty optional avatars exactly', async () => {
            const snapshot = await createApprovedSnapshot({
                snapshotId: 'nullable-source-fields',
                emptyAvatar: true,
                nullOfficeUpdatedAt: true
            });
            const plan = await buildImportPlan(snapshot.directory);
            const profile = plan.operations.find(({ table, row }) =>
                table === 'platform_profiles' && row.account_id === 'account-b');
            const office = plan.operations.find(({ table }) => table === 'fudaba_offices');
            assert.equal(profile.row.avatar_object_key, null);
            assert.equal(profile.row.avatar_external_url, null);
            assert.equal(office.row.updated_at, office.row.created_at);
        });

        test('planning consumes explicitly retained external avatars and denied optional covers', async () => {
            const externalAvatar = 'https://images.example/alice-retained.png';
            const snapshot = await createApprovedSnapshot({
                snapshotId: 'optional-media-dispositions',
                externalAvatar,
                omitOfficeCover: true
            });
            const plan = await buildImportPlan(snapshot.directory);
            assert.equal(plan.summary.failed, 0);
            const profile = plan.operations.find(({ table, row }) =>
                table === 'platform_profiles' && row.account_id === 'account-a');
            const office = plan.operations.find(({ table }) => table === 'fudaba_offices');
            assert.equal(profile.row.avatar_object_key, null);
            assert.equal(profile.row.avatar_external_url, externalAvatar);
            assert.equal(office.row.cover_object_key, null);
        });

        test('planning rejects public media and a manifest detached from its media plan', async () => {
            const publicSnapshot = await createApprovedSnapshot({
                snapshotId: 'public-media-rejected'
            });
            const publicFile = path.join(publicSnapshot.directory, 'media-manifest.json');
            const publicManifest = readJson(publicFile);
            const publicEntry = publicManifest.entries.find((entry) =>
                entry.entityKind === 'card' && entry.entityId === 'card-wanted' &&
                entry.slot === 'back');
            publicEntry.storageScope = 'public';
            writeJson(publicFile, publicManifest);
            const publicPlan = await buildImportPlan(publicSnapshot.directory);
            assert.equal(publicPlan.summary.failed > 0, true);
            assert.equal(publicPlan.blockers.some(({ reason }) =>
                reason.includes('Media is not verified ready')), true);

            const detachedSnapshot = await createApprovedSnapshot({
                snapshotId: 'detached-media-plan'
            });
            const detachedFile = path.join(detachedSnapshot.directory, 'media-manifest.json');
            const detachedManifest = readJson(detachedFile);
            detachedManifest.entries[0].bindingSha256 = sha256('tampered-binding');
            writeJson(detachedFile, detachedManifest);
            await assert.rejects(
                () => buildImportPlan(detachedSnapshot.directory),
                /media manifest entry does not match the media plan/
            );
        });

        test('planning recomputes every media-plan binding after a plan reseal', async () => {
            const snapshot = await createApprovedSnapshot({
                snapshotId: 'recomputed-media-binding'
            });
            const planFile = path.join(snapshot.directory, 'media-plan.json');
            const plan = readJson(planFile);
            plan.entries[0].image.width += 1;
            writeJson(planFile, plan);
            const resealedPlanSha256 = sha256File(planFile);
            for (const filename of ['media-manifest.json', 'rights-manifest.json']) {
                const artifactFile = path.join(snapshot.directory, filename);
                const artifact = readJson(artifactFile);
                artifact.mediaPlanSha256 = resealedPlanSha256;
                writeJson(artifactFile, artifact);
            }
            await assert.rejects(
                () => buildImportPlan(snapshot.directory),
                /media plan binding SHA-256 is invalid/
            );
        });

        test.describe('extract rejects', () => {
            test('schema drift and classification keys absent from the source', async () => {
                const schemaDrift = await createSourceFixture();
                const database = open(schemaDrift.source);
                await exec(database, 'CREATE TABLE unexpected_application_table (id TEXT)');
                await close(database);
                await assert.rejects(() => extractSnapshot({
                    source: schemaDrift.source,
                    snapshotId: 'schema-drift',
                    snapshotRoot: schemaDrift.root,
                    d1DatabaseId: 'e585a1b9-16dd-460a-92b2-94f0017a1ead',
                    r2Bucket: 'imas-world-card-images',
                    appVersion: '0.1.0',
                    exportTime: '2026-07-16T03:04:05.000Z',
                    fudabaCommit: FUDABA_COMMIT
                }), /Unexpected Fudaba source table/);

                const classificationDrift = await createSourceFixture();
                await assert.rejects(() => extractSnapshot({
                    source: classificationDrift.source,
                    snapshotId: 'classification-drift',
                    snapshotRoot: classificationDrift.root,
                    d1DatabaseId: 'e585a1b9-16dd-460a-92b2-94f0017a1ead',
                    r2Bucket: 'imas-world-card-images',
                    appVersion: '0.1.0',
                    exportTime: '2026-07-16T03:04:05.000Z',
                    fudabaCommit: FUDABA_COMMIT,
                    classifications: [{
                        table: 'users',
                        key: { id: 'missing-account' },
                        classification: 'production-user-content'
                    }]
                }), /do not match source rows/);
            });

            test('migration-ledger, index and trigger provenance drift', async () => {
                const fixtures = await Promise.all([
                    createSourceFixture(),
                    createSourceFixture(),
                    createSourceFixture()
                ]);
                const mutations = [
                    "UPDATE d1_migrations SET name = '0001_rewritten.sql' WHERE id = 1",
                    'DROP INDEX offices_city_idx',
                    'DROP TRIGGER messages_require_active_insert'
                ];
                const patterns = [/migration ledger/, /indexes/, /triggers/];
                for (let index = 0; index < fixtures.length; index += 1) {
                    const fixture = fixtures[index];
                    const database = open(fixture.source);
                    await exec(database, mutations[index]);
                    await close(database);
                    await assert.rejects(() => extractSnapshot({
                        source: fixture.source,
                        snapshotId: `provenance-drift-${index}`,
                        snapshotRoot: fixture.root,
                        d1DatabaseId: 'e585a1b9-16dd-460a-92b2-94f0017a1ead',
                        r2Bucket: 'imas-world-card-images',
                        appVersion: '0.1.0',
                        exportTime: '2026-07-16T03:04:05.000Z',
                        fudabaCommit: FUDABA_COMMIT
                    }), patterns[index]);
                }
            });

            test('full table, trigger and ledger DDL rewrites', async () => {
                const fixtures = await Promise.all([
                    createSourceFixture(),
                    createSourceFixture(),
                    createSourceFixture()
                ]);
                const mutations = [
                    `
            DROP INDEX email_credentials_user_idx;
            DROP TABLE email_credentials;
            CREATE TABLE email_credentials (
                email TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX email_credentials_user_idx ON email_credentials(user_id);
        `,
                    `
            DROP TRIGGER messages_require_active_insert;
            CREATE TRIGGER messages_require_active_insert
            BEFORE INSERT ON messages
            WHEN (SELECT archived_at FROM offices WHERE id = NEW.office_id) IS NOT NULL AND 0
            BEGIN
                SELECT RAISE(ABORT, 'OFFICE_ARCHIVED');
            END;
        `,
                    `
            DROP TABLE d1_migrations;
            CREATE TABLE "d1_migrations"(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            );
            INSERT INTO d1_migrations (name) VALUES
                ('0001_initial.sql'),
                ('0002_official_demo_card_art.sql'),
                ('0003_public_card_users.sql'),
                ('0004_interactive_card_wall.sql'),
                ('0005_oauth_profiles.sql'),
                ('0006_office_series_tags.sql'),
                ('0007_office_management.sql'),
                ('0008_series_office_covers.sql'),
                ('0009_card_interactions.sql'),
                ('0010_email_credentials.sql');
        `
                ];
                const patterns = [
                    /source table DDL drift: email_credentials/,
                    /source trigger DDL drift: messages_require_active_insert/,
                    /source table DDL drift: d1_migrations/
                ];
                for (let index = 0; index < fixtures.length; index += 1) {
                    const fixture = fixtures[index];
                    const database = open(fixture.source);
                    await exec(database, mutations[index]);
                    await close(database);
                    await assert.rejects(() => extractSnapshot({
                        source: fixture.source,
                        snapshotId: `full-ddl-drift-${index}`,
                        snapshotRoot: fixture.root,
                        d1DatabaseId: 'e585a1b9-16dd-460a-92b2-94f0017a1ead',
                        r2Bucket: 'imas-world-card-images',
                        appVersion: '0.1.0',
                        exportTime: '2026-07-16T03:04:05.000Z',
                        fudabaCommit: FUDABA_COMMIT
                    }), patterns[index]);
                }
            });
        });

        test('apply confirmation seals source.json independently from the source export', async () => {
            const snapshot = await createApprovedSnapshot({ snapshotId: 'source-manifest-seal' });
            const confirmations = snapshotConfirmations(snapshot.directory);
            const sourceFile = path.join(snapshot.directory, 'source.json');
            const source = readJson(sourceFile);
            source.source.appVersion = 'tampered-after-approval';
            writeJson(sourceFile, source);
            await assert.rejects(() => importSnapshot({
                snapshotDirectory: snapshot.directory,
                connectionString: 'postgresql://unused:unused@127.0.0.1:1/unused',
                targetBucket: TARGET_BUCKET,
                apply: true,
                ...confirmations
            }), /confirm-source-manifest-sha256/);
        });

        test('planning rejects tampered operational-row provenance', async () => {
            const snapshot = await createApprovedSnapshot({
                snapshotId: 'operational-count-provenance'
            });
            const sourceFile = path.join(snapshot.directory, 'source.json');
            const source = readJson(sourceFile);
            source.validation.operationalRows.sessions.sourceCount += 1;
            writeJson(sourceFile, source);
            await assert.rejects(
                () => buildImportPlan(snapshot.directory),
                /Operational row provenance mismatch for sessions/
            );
        });

        test('planning rejects values that only PostgreSQL would otherwise catch', async () => {
            const invalidLocation = await createApprovedSnapshot({
                snapshotId: 'invalid-location',
                invalidLatitude: true
            });
            const locationPlan = await buildImportPlan(invalidLocation.directory);
            assert.equal(locationPlan.blockers.some(({ sourceTable }) => sourceTable === 'offices'), true);
            assert.equal(locationPlan.blockers.find(({ sourceTable }) =>
                sourceTable === 'offices').reasonCode, 'source-row-invalid');

            const duplicateProvider = await createApprovedSnapshot({
                snapshotId: 'duplicate-provider',
                duplicateProviderForAccount: true
            });
            const providerPlan = await buildImportPlan(duplicateProvider.directory);
            assert.equal(providerPlan.blockers.some(({ sourceTable, reason }) =>
                sourceTable === 'oauth_accounts' && reason.includes('provider')), true);

            const invalidExchange = await createApprovedSnapshot({
                snapshotId: 'invalid-exchange',
                invalidExchangeOwnership: true
            });
            const exchangePlan = await buildImportPlan(invalidExchange.directory);
            assert.equal(exchangePlan.blockers.some(({ sourceTable }) =>
                sourceTable === 'exchange_requests'), true);
        });

        test.describe('real PostgreSQL', () => {
            test('dry-run, apply, repeat and reconciliation are exact', {
                skip: !postgresIntegrationEnabled()
            }, async () => {
                const harness = await createPostgresTestHarness();
                let pool;
                onTestFinished(async () => {
                    await pool?.end();
                    await harness.close();
                });
                const snapshot = await createApprovedSnapshot({ snapshotId: 'postgres-apply' });
                pool = poolFor(harness);
                await seedMediaControlPlane(pool, snapshot.directory);
                const dryRun = await importSnapshot({
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET
                });
                assert.equal(dryRun.committed, false);
                assert.equal(dryRun.summary.missing, 15);
                assert.equal(dryRun.summary.unchanged, 6);
                assert.deepEqual(dryRun.artifactSha256, {
                    source: sha256File(path.join(snapshot.directory, 'source.json')),
                    rows: sha256File(path.join(snapshot.directory, 'rows-manifest.json')),
                    mediaPlan: sha256File(path.join(snapshot.directory, 'media-plan.json')),
                    media: sha256File(path.join(snapshot.directory, 'media-manifest.json')),
                    rights: sha256File(path.join(snapshot.directory, 'rights-manifest.json'))
                });

                assert.equal(Number((await pool.query('SELECT COUNT(*) FROM platform_accounts')).rows[0].count), 0);

                const confirmations = snapshotConfirmations(snapshot.directory);
                await assert.rejects(() => importSnapshot({
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET,
                    apply: true,
                    confirmSnapshotId: confirmations.confirmSnapshotId,
                    confirmSourceSha256: confirmations.confirmSourceSha256
                }), /confirm-source-manifest-sha256/);
                const applied = await importSnapshot({
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET,
                    apply: true,
                    ...confirmations
                });
                assert.equal(applied.committed, true);
                assert.equal(applied.summary.inserted, 15);
                const repeated = await importSnapshot({
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET,
                    apply: true,
                    ...confirmations
                });
                assert.equal(repeated.summary.inserted, 0);
                assert.equal(repeated.summary.unchanged, 21);
                const reconciled = await reconcileSnapshot({
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET,
                    write: false
                });
                assert.equal(reconciled.status, 'passed');
                assert.equal(reconciled.targetTables.fudaba_messages.states.unchanged, 1);

                const credential = (await pool.query(
                    'SELECT algorithm, parameters_json, password_hash, salt FROM platform_email_credentials'
                )).rows[0];
                assert.equal(credential.algorithm, 'pbkdf2-sha256');
                assert.equal(credential.password_hash, PASSWORD_CANARY);
                assert.equal(credential.salt, SALT_CANARY);
                assert.deepEqual(JSON.parse(credential.parameters_json), {
                    iterations: 100000,
                    hash: 'sha256',
                    keyLength: 32,
                    encoding: 'hex',
                    saltEncoding: 'utf8'
                });
                assert.equal(Number((await pool.query('SELECT COUNT(*) FROM platform_oauth_states')).rows[0].count), 0);
                assert.equal(Number((await pool.query('SELECT COUNT(*) FROM platform_refresh_sessions')).rows[0].count), 0);

                await pool.query("UPDATE fudaba_messages SET content='drift' WHERE id='message-a'");
                const drift = await reconcileSnapshot({
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET,
                    write: false
                });
                assert.equal(drift.status, 'failed');
                assert.equal(drift.summary.different, 1);
                assert.deepEqual(
                    drift.targets.find(({ table, state }) => table === 'fudaba_messages' && state === 'different')
                        .differentColumns,
                    ['content']
                );
            });

            test('blocks missing or drifted media control-plane state', {
                skip: !postgresIntegrationEnabled()
            }, async () => {
                const harness = await createPostgresTestHarness();
                const pool = poolFor(harness);
                onTestFinished(async () => {
                    await pool.end();
                    await harness.close();
                });
                const snapshot = await createApprovedSnapshot({
                    snapshotId: 'postgres-media-control-plane'
                });
                const cases = [
                    {
                        name: 'missing',
                        column: 'logicalObjectKey',
                        mutate: (entry) => pool.query(
                            'DELETE FROM public.s3_object_index WHERE logical_key=$1',
                            [entry.logicalObjectKey]
                        )
                    },
                    {
                        name: 'public',
                        column: 'storageScope',
                        mutate: (entry) => pool.query(
                            "UPDATE public.s3_object_versions SET storage_scope='public' WHERE object_id=$1",
                            [entry.objectId]
                        )
                    },
                    {
                        name: 'pending',
                        column: 'state',
                        mutate: (entry) => pool.query(
                            "UPDATE public.s3_object_index SET state='pending' WHERE logical_key=$1",
                            [entry.logicalObjectKey]
                        )
                    },
                    {
                        name: 'object-id',
                        column: 'objectId',
                        async mutate(entry) {
                            await pool.query(
                                `INSERT INTO public.s3_object_versions
                        (object_id, physical_key, storage_scope, byte_size, content_type,
                         sha256, etag, owner_token, created_at)
                     SELECT $1, physical_key || '-drift', storage_scope, byte_size,
                            content_type, sha256, etag, owner_token, created_at
                     FROM public.s3_object_versions WHERE object_id=$2`,
                                ['drift-object-id', entry.objectId]
                            );
                            await pool.query(
                                'UPDATE public.s3_object_index SET object_id=$1 WHERE logical_key=$2',
                                ['drift-object-id', entry.logicalObjectKey]
                            );
                        }
                    },
                    {
                        name: 'physical-key',
                        column: 'physicalObjectKey',
                        mutate: (entry) => pool.query(
                            "UPDATE public.s3_object_versions SET physical_key=physical_key || '-drift' WHERE object_id=$1",
                            [entry.objectId]
                        )
                    },
                    {
                        name: 'byte-size',
                        column: 'byteSize',
                        mutate: (entry) => pool.query(
                            'UPDATE public.s3_object_versions SET byte_size=byte_size + 1 WHERE object_id=$1',
                            [entry.objectId]
                        )
                    },
                    {
                        name: 'content-type',
                        column: 'contentType',
                        mutate: (entry) => pool.query(
                            "UPDATE public.s3_object_versions SET content_type='image/webp' WHERE object_id=$1",
                            [entry.objectId]
                        )
                    },
                    {
                        name: 'sha256',
                        column: 'sha256',
                        mutate: (entry) => pool.query(
                            'UPDATE public.s3_object_versions SET sha256=$1 WHERE object_id=$2',
                            ['f'.repeat(64), entry.objectId]
                        )
                    },
                    {
                        name: 'etag',
                        column: 'etag',
                        mutate: (entry) => pool.query(
                            "UPDATE public.s3_object_versions SET etag=etag || '-drift' WHERE object_id=$1",
                            [entry.objectId]
                        )
                    }
                ];
                for (const scenario of cases) {
                    const [entry] = await seedMediaControlPlane(pool, snapshot.directory);
                    await scenario.mutate(entry);
                    await assert.rejects(() => importSnapshot({
                        snapshotDirectory: snapshot.directory,
                        connectionString: harness.databaseUrl,
                        targetBucket: TARGET_BUCKET
                    }), (error) => {
                        assert.match(error.message, /media target conflict/);
                        assert.equal(error.report.summary.mediaConflicts, 1, scenario.name);
                        const target = error.report.mediaTargets.find((candidate) =>
                            candidate.logicalObjectKey === entry.logicalObjectKey);
                        assert.ok(target.differentColumns.includes(scenario.column), scenario.name);
                        return true;
                    });
                }
                assert.equal(Number((await pool.query(
                    'SELECT COUNT(*) FROM platform_accounts'
                )).rows[0].count), 0);
            });

            test('reports alternate unique-key conflicts before writing', {
                skip: !postgresIntegrationEnabled()
            }, async () => {
                const harness = await createPostgresTestHarness();
                const pool = poolFor(harness);
                onTestFinished(async () => {
                    await pool.end();
                    await harness.close();
                });
                const snapshot = await createApprovedSnapshot({ snapshotId: 'postgres-unique-conflict' });
                await seedMediaControlPlane(pool, snapshot.directory);
                await pool.query(`
        INSERT INTO platform_accounts
            (id, status, token_version, created_at, updated_at, deleted_at)
        VALUES ('existing-account', 'active', 0, 1, 1, NULL);
        INSERT INTO fudaba_offices (
            id, owner_account_id, slug, name, intro, city, address,
            latitude, longitude, accent, cover_object_key, is_open,
            visitor_count, status, revision, created_at, updated_at, archived_at
        ) VALUES (
            'existing-office', 'existing-account', 'shanghai-office', 'Existing', '',
            '上海', 'Existing address', 31, 121, '#ef5b6c', NULL, TRUE,
            0, 'active', 0, '2026-07-15T01:02:03.000Z',
            '2026-07-15T01:02:03.000Z', NULL
        );
    `);
                await assert.rejects(() => importSnapshot({
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET
                }), (error) => {
                    const conflict = error.report.targets.find(({ table, state }) =>
                        table === 'fudaba_offices' && state === 'conflict');
                    assert.deepEqual(conflict.differentColumns, ['unique:slug']);
                    assert.equal(error.report.summary.conflicts, 1);
                    return true;
                });
                assert.equal(Number((await pool.query(
                    "SELECT COUNT(*) FROM platform_accounts WHERE id = 'account-a'"
                )).rows[0].count), 0);
            });

            test('imports historical children before restoring an archived office', {
                skip: !postgresIntegrationEnabled()
            }, async () => {
                const harness = await createPostgresTestHarness();
                const pool = poolFor(harness);
                onTestFinished(async () => {
                    await pool.end();
                    await harness.close();
                });
                const snapshot = await createApprovedSnapshot({
                    snapshotId: 'postgres-archived-office',
                    archivedOffice: true
                });
                await seedMediaControlPlane(pool, snapshot.directory);
                const applied = await importSnapshot({
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET,
                    apply: true,
                    ...snapshotConfirmations(snapshot.directory)
                });
                assert.equal(applied.committed, true);
                const office = (await pool.query(
                    "SELECT status, archived_at FROM fudaba_offices WHERE id = 'office-a'"
                )).rows[0];
                assert.equal(office.status, 'archived');
                assert.equal(office.archived_at.toISOString(), '2026-07-16T02:03:04.000Z');
                for (const table of ['fudaba_office_cards', 'fudaba_messages', 'fudaba_exchange_requests']) {
                    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM ${table}`)).rows[0].count), 1);
                }
                const repeated = await importSnapshot({
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET,
                    apply: true,
                    ...snapshotConfirmations(snapshot.directory)
                });
                assert.equal(repeated.summary.unchanged, 21);
                assert.equal(repeated.summary.inserted, 0);
                const reconciliation = await reconcileSnapshot({
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET,
                    write: false
                });
                assert.equal(reconciliation.status, 'passed');
            });

            test('reconciles a lost commit acknowledgement before reporting success', {
                skip: !postgresIntegrationEnabled()
            }, async () => {
                const harness = await createPostgresTestHarness();
                const pool = poolFor(harness);
                onTestFinished(async () => {
                    await pool.end();
                    await harness.close();
                });
                const snapshot = await createApprovedSnapshot({
                    snapshotId: 'postgres-commit-acknowledgement'
                });
                await seedMediaControlPlane(pool, snapshot.directory);
                const recovered = await importSnapshot({
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET,
                    apply: true,
                    ...snapshotConfirmations(snapshot.directory),
                    afterCommitSent() {
                        throw new Error('simulated lost commit acknowledgement');
                    }
                });
                assert.equal(recovered.commitAttempted, true);
                assert.equal(recovered.commitOutcome, 'reconciled');
                assert.equal(recovered.outcomeUnknown, false);
                assert.equal(recovered.committed, true);
                assert.equal(recovered.rolledBack, false);
                assert.equal(recovered.reconciliation.status, 'passed');
                assert.equal(Number((await pool.query('SELECT COUNT(*) FROM platform_accounts')).rows[0].count), 2);
                assert.equal(Number((await pool.query('SELECT COUNT(*) FROM fudaba_messages')).rows[0].count), 1);
            });

            test('serializes concurrent identical applies into one exact dataset', {
                skip: !postgresIntegrationEnabled()
            }, async () => {
                const harness = await createPostgresTestHarness();
                onTestFinished(() => harness.close());
                const snapshot = await createApprovedSnapshot({ snapshotId: 'postgres-concurrent' });
                const seedPool = poolFor(harness);
                await seedMediaControlPlane(seedPool, snapshot.directory);
                await seedPool.end();
                const options = {
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET,
                    apply: true,
                    ...snapshotConfirmations(snapshot.directory)
                };
                const reports = await Promise.all([
                    importSnapshot(options),
                    importSnapshot(options)
                ]);
                assert.deepEqual(
                    reports.map(({ summary }) => summary.inserted).sort((a, b) => a - b),
                    [0, 15]
                );
                assert.equal(reports.every(({ committed }) => committed), true);

                const pool = poolFor(harness);
                try {
                    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM platform_accounts')).rows[0].count), 2);
                    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM fudaba_cards')).rows[0].count), 2);
                    assert.equal(Number((await pool.query('SELECT COUNT(*) FROM fudaba_exchange_requests')).rows[0].count), 1);
                } finally {
                    await pool.end();
                }
            });

            test('rolls back the entire import after a late write failure', {
                skip: !postgresIntegrationEnabled()
            }, async () => {
                const harness = await createPostgresTestHarness();
                const snapshot = await createApprovedSnapshot({ snapshotId: 'postgres-rollback' });
                const pool = poolFor(harness);
                onTestFinished(async () => {
                    await pool.end();
                    await harness.close();
                });
                await seedMediaControlPlane(pool, snapshot.directory);
                await pool.query(`
        CREATE FUNCTION fail_fudaba_like_import() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'test late import failure';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER fail_fudaba_like_import
        BEFORE INSERT ON fudaba_card_likes
        FOR EACH ROW EXECUTE FUNCTION fail_fudaba_like_import();
    `);
                await assert.rejects(() => importSnapshot({
                    snapshotDirectory: snapshot.directory,
                    connectionString: harness.databaseUrl,
                    targetBucket: TARGET_BUCKET,
                    apply: true,
                    ...snapshotConfirmations(snapshot.directory)
                }), /late import failure/);
                for (const table of [
                    'platform_accounts', 'fudaba_offices', 'fudaba_cards', 'fudaba_messages'
                ]) {
                    const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
                    assert.equal(Number(result.rows[0].count), 0, table);
                }
            });
        });
    });
}
