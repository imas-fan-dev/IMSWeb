'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { after, before, test: nodeTest } = require('node:test');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const sharp = require('sharp');
const {
    closeSharedPostgresTestAllocator,
    getSharedPostgresTestAllocator,
    postgresIntegrationEnabled
} = require('../postgres-test-lifecycle.js');
const {
    legacyMediaObjectKey
} = require('../../scripts/migration/namecard-unification-reconcile.js');
const auth = require('./auth.owner.js');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'dist/server/main.js');
const LEGACY_SERVER_ENTRY = path.join(PROJECT_ROOT, 'js/server.js');

function createNodeSecurityFixture() {
    const test = postgresIntegrationEnabled() ? nodeTest : nodeTest.skip;
    const TEST_FILE_PREFIX = `security-${process.pid}-${Date.now()}`;
    const APPROVED_FRONT_URL = `/uploads/namecard/original/${TEST_FILE_PREFIX}-approved-front.png`;
    const APPROVED_BACK_URL = `/uploads/namecard/original/${TEST_FILE_PREFIX}-approved-back.png`;
    const PENDING_FRONT_URL = `/uploads/namecard/original/${TEST_FILE_PREFIX}-pending-front.png`;
    const PENDING_BACK_URL = `/uploads/namecard/original/${TEST_FILE_PREFIX}-pending-back.png`;
    const APPROVED_FRONT_THUMBNAIL_URL =
        `/uploads/namecard/thumbnail/${path.basename(APPROVED_FRONT_URL)}.jpg`;
    const APPROVED_BACK_THUMBNAIL_URL =
        `/uploads/namecard/thumbnail/${path.basename(APPROVED_BACK_URL)}.jpg`;
    const PENDING_FRONT_THUMBNAIL_URL =
        `/uploads/namecard/thumbnail/${path.basename(PENDING_FRONT_URL)}.jpg`;

    let NAMECARD_DIR;
    let EVENT_DIR;
    let approvedCardId;
    let baseUrl;
    let chronicleBase;
    let databaseUrl;
    let fixturePool;
    let pendingCardId;
    let server;
    let tempDir;
    let testDatabase;
    let validJpeg;
    let validPng;

    function run(db, sql, params = []) {
        return db.query(translateParameters(sql), params).then((result) => ({
            changes: result.rowCount,
            lastID: result.rows[0]?.id
        }));
    }

    function get(db, sql, params = []) {
        return db.query(translateParameters(sql), params).then((result) => result.rows[0]);
    }

    function translateParameters(sql) {
        let index = 0;
        return sql.replace(/\?/g, () => `$${++index}`);
    }

    async function seedLegacyNamecard(db, card) {
        const { frontUrl, backUrl, hash1 = null, hash2 = null, ip = null, status } = card;
        const inserted = await run(
            db,
            `INSERT INTO cards (image1_url, image2_url, hash1, hash2, ip, status)
             VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
            [frontUrl, backUrl, hash1, hash2, ip, status]
        );
        const legacyId = inserted.lastID;
        await run(
            db,
            `INSERT INTO fudaba_cards
                (id, card_number, origin, producer_name, display_name,
                 series_code, favorite_idol, accent, bio, trade_note,
                 front_object_key, back_object_key, available,
                 media_rights_status, publication_status, legacy_card_id,
                 revision, created_at, updated_at, deleted_at)
             VALUES (?, ?, 'legacy', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                     ?, ?, FALSE, 'approved', ?, NULL, 0, CURRENT_TIMESTAMP,
                     CURRENT_TIMESTAMP, NULL)`,
            [
                `legacy-${legacyId}`,
                legacyId,
                legacyMediaObjectKey(frontUrl),
                legacyMediaObjectKey(backUrl),
                status === 'approved' ? 'published' : status
            ]
        );
        return legacyId;
    }

    function isolatedServerEnv(label) {
        return {
            ...process.env,
            NODE_ENV: 'test',
            IMS_JWT_SECRET: 'test-only-secret-with-sufficient-entropy',
            DATABASE_URL: databaseUrl,
            IMS_OBJECT_STORAGE: 'filesystem',
            IMS_COMPENSATION_DIR: path.join(tempDir, `${label}-compensation`),
            IMS_UPLOADS_DIR: path.join(tempDir, `${label}-uploads`),
            IMS_EVENT_BASE_DIR: path.join(tempDir, `${label}-events`)
        };
    }

    function namecardObjectPath(publicUrl) {
        const filename = path.basename(publicUrl);
        const extension = path.extname(filename).toLowerCase();
        const stem = path.basename(filename, extension);
        return path.join(NAMECARD_DIR, stem, `image${extension}`);
    }

    function namecardThumbnailObjectPath(publicUrl) {
        const filename = path.basename(publicUrl);
        const extension = path.extname(filename).toLowerCase();
        const stem = path.basename(filename, extension);
        return path.join(NAMECARD_DIR, stem, 'thumbnail.jpg');
    }

    function rawRequest(requestPath, options = {}) {
        const address = server.address();
        return new Promise((resolve, reject) => {
            const request = http.request({
                host: '127.0.0.1',
                port: address.port,
                path: requestPath,
                method: options.method || 'GET',
                headers: options.headers || {}
            }, response => {
                response.resume();
                response.on('end', () => resolve(response));
            });
            request.on('error', reject);
            request.end(options.body);
        });
    }

    const fixture = {
        get APPROVED_BACK_THUMBNAIL_URL() { return APPROVED_BACK_THUMBNAIL_URL; },
        get APPROVED_BACK_URL() { return APPROVED_BACK_URL; },
        get APPROVED_FRONT_THUMBNAIL_URL() { return APPROVED_FRONT_THUMBNAIL_URL; },
        get APPROVED_FRONT_URL() { return APPROVED_FRONT_URL; },
        get EVENT_DIR() { return EVENT_DIR; },
        get LEGACY_SERVER_ENTRY() { return LEGACY_SERVER_ENTRY; },
        get NAMECARD_DIR() { return NAMECARD_DIR; },
        get PENDING_FRONT_THUMBNAIL_URL() { return PENDING_FRONT_THUMBNAIL_URL; },
        get PENDING_FRONT_URL() { return PENDING_FRONT_URL; },
        get PROJECT_ROOT() { return PROJECT_ROOT; },
        get SERVER_ENTRY() { return SERVER_ENTRY; },
        get TEST_FILE_PREFIX() { return TEST_FILE_PREFIX; },
        get approvedCardId() { return approvedCardId; },
        get baseUrl() { return baseUrl; },
        get chronicleBase() { return chronicleBase; },
        get databaseUrl() { return databaseUrl; },
        get fixturePool() { return fixturePool; },
        get pendingCardId() { return pendingCardId; },
        get tempDir() { return tempDir; },
        get validJpeg() { return validJpeg; },
        get validPng() { return validPng; },
        get,
        getOpSession() { return auth.getOpSession(fixture); },
        getOpToken() { return auth.getOpToken(fixture); },
        isolatedServerEnv,
        namecardObjectPath,
        namecardThumbnailObjectPath,
        rawRequest,
        run,
        seedLegacyNamecard,
        test
    };

    before(async () => {
        if (!postgresIntegrationEnabled()) return;
        process.env.IMS_ENV_FILE = '';
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-node-security-'));
        const uploadsDir = path.join(tempDir, 'uploads');
        NAMECARD_DIR = path.join(uploadsDir, 'community/namecards/assets');
        EVENT_DIR = path.join(uploadsDir, 'editorial/events/assets');
        fs.mkdirSync(NAMECARD_DIR, { recursive: true });
        fs.mkdirSync(EVENT_DIR, { recursive: true });
        testDatabase = await getSharedPostgresTestAllocator().allocate({
            label: 'node-security'
        });
        databaseUrl = testDatabase.databaseUrl;
        fixturePool = testDatabase.registerConnection(new Pool({
            connectionString: databaseUrl,
            allowExitOnIdle: true
        }));
        await run(fixturePool, 'ALTER TABLE public.cards DISABLE TRIGGER ALL');
        await run(fixturePool, 'ALTER TABLE public.card_emojis DISABLE TRIGGER ALL');
        const passwordHash = await bcrypt.hash('test-password', 4);

        for (let id = 1; id <= 3; id += 1) {
            await run(
                fixturePool,
                `INSERT INTO news (title, image, thumbnail, content, date, author)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    `Seed news ${id}`,
                    `/uploads/news/original/${id}.webp`,
                    `/uploads/news/thumb/${id}.webp`,
                    `https://example.test/news/${id}`,
                    `2026-07-0${id}`,
                    'Security fixture'
                ]
            );
        }
        approvedCardId = await seedLegacyNamecard(fixturePool, {
            frontUrl: APPROVED_FRONT_URL,
            backUrl: APPROVED_BACK_URL,
            hash1: 'private-hash-1',
            hash2: 'private-hash-2',
            ip: '203.0.113.8',
            status: 'approved'
        });
        pendingCardId = await seedLegacyNamecard(fixturePool, {
            frontUrl: PENDING_FRONT_URL,
            backUrl: PENDING_BACK_URL,
            hash1: 'pending-hash-1',
            hash2: 'pending-hash-2',
            ip: '198.51.100.9',
            status: 'pending'
        });
        await run(
            fixturePool,
            'INSERT INTO users (username, password, dept, producername) VALUES (?, ?, ?, ?)',
            ['security-test-op', passwordHash, 'op', 'Security Test']
        );
        const image = sharp({
            create: {
                width: 2,
                height: 2,
                channels: 3,
                background: { r: 120, g: 40, b: 200 }
            }
        });
        validPng = await image.clone().png().toBuffer();
        validJpeg = await image.clone().jpeg().toBuffer();
        for (const mediaUrl of [
            APPROVED_FRONT_URL,
            APPROVED_BACK_URL,
            PENDING_FRONT_URL,
            PENDING_BACK_URL
        ]) {
            const target = namecardObjectPath(mediaUrl);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, validPng);
            fs.writeFileSync(namecardThumbnailObjectPath(mediaUrl), validJpeg);
        }

        process.env.NODE_ENV = 'test';
        process.env.IMS_JWT_SECRET = 'test-only-secret-with-sufficient-entropy';
        process.env.DATABASE_URL = databaseUrl;
        process.env.IMS_OBJECT_STORAGE = 'filesystem';
        process.env.IMS_COMPENSATION_DIR = path.join(tempDir, 'compensation');
        process.env.IMS_UPLOADS_DIR = uploadsDir;
        process.env.IMS_COOKIE_SECURE = 'false';
        process.env.IMS_CLIENT_ADDRESS_SOURCE = 'nginx';
        chronicleBase = path.join(tempDir, 'event-chronicle');
        process.env.IMS_EVENT_BASE_DIR = chronicleBase;

        const serverModule = require(SERVER_ENTRY);
        server = serverModule.startServer({ host: '127.0.0.1', port: 0 });
        testDatabase.registerConnection(server, async () => {
            if (!server) return;
            const activeServer = server;
            try {
                await serverModule.shutdownServer(activeServer);
                server = undefined;
            } catch (shutdownError) {
                const errors = [shutdownError];
                await serverModule.closeDatabase().catch((error) => errors.push(error));
                if (!activeServer.listening) server = undefined;
                if (errors.length === 1) throw shutdownError;
                throw new AggregateError(errors, 'Failed to close compiled Node listener');
            }
        });
        await once(server, 'listening');
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
        const errors = [];
        if (testDatabase) {
            await testDatabase.close().catch((error) => errors.push(error));
        }
        try {
            if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (error) {
            errors.push(error);
        }
        await closeSharedPostgresTestAllocator().catch((error) => errors.push(error));
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) {
            throw new AggregateError(errors, 'Node security test cleanup failed');
        }
    });

    return fixture;
}

module.exports = { createNodeSecurityFixture };
