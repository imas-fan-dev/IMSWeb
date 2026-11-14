'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const sharp = require('sharp');
const {
    closeSharedPostgresTestAllocator,
    getSharedPostgresTestAllocator,
    postgresIntegrationEnabled
} = require('../postgres-test-lifecycle.js');
const auth = require('./auth.owner.js');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'dist/server/main.js');
const LEGACY_SERVER_ENTRY = path.join(PROJECT_ROOT, 'js/server.js');

// Runner registration is injected by the owning test file
// (`tests/node-security.test.js`): this helper stays CommonJS, and Vitest's
// entry point cannot be loaded through `require` from a CommonJS module.
// `test` arrives already wrapped by the Vitest PostgreSQL adapter, so the
// disabled run still reports a skip with the shared reason.
function createNodeSecurityFixture({ test, beforeAll, afterAll }) {
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
    /** Public event poster the shared GET/HEAD/range media matrix reads. */
    const EVENT_POSTER_URL = '/uploads/event/original/security-fixture-poster.png';
    // `fudaba_card_pages` 是唯一媒体来源：每张种子名片都带一行 live 正/反面，
    // 版本固定，页面行与落盘对象路径共用这份定义。
    const CARD_PAGE_SEEDS = [
        { pageId: 'front', order: 1, version: '11111111-1111-4111-8111-111111111111' },
        { pageId: 'back', order: 2, version: '22222222-2222-4222-8222-222222222222' }
    ];

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
    let uploadsDir;
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

    /**
     * 版本化页面对象在文件系统存储里的落盘路径：`community/*` 命名空间挂在
     * uploads 根目录下（见 `FilesystemObjectStorage.resolveKey`）。
     */
    function cardPageObjectPath(cardId, pageId, version) {
        return path.join(
            uploadsDir,
            'community/fudaba/cards',
            cardId,
            'live',
            `${pageId}.${version}.webp`
        );
    }

    async function seedLegacyNamecard(db, card) {
        // `public.cards` is the retired legacy archive: no runtime surface reads
        // its media columns any more (docs/architecture/namecard-surfaces.md §1),
        // but they are NOT NULL, so a caller that seeds no legacy upload URL
        // still needs an inert placeholder instead of resurrecting the old
        // upload layout.
        const LEGACY_ARCHIVE_FRONT_URL = '/legacy-archive/namecard/front.png';
        const LEGACY_ARCHIVE_BACK_URL = '/legacy-archive/namecard/back.png';
        const {
            frontUrl = LEGACY_ARCHIVE_FRONT_URL,
            backUrl = LEGACY_ARCHIVE_BACK_URL,
            hash1 = null,
            hash2 = null,
            ip = null,
            status
        } = card;
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
                (id, card_number, origin, producer_name, exchange_mode,
                 trade_note, publication_status, legacy_card_id,
                 revision, created_at, updated_at, deleted_at)
             VALUES (?, ?, 'legacy', NULL, 'none', NULL,
                     ?, NULL, 0, CURRENT_TIMESTAMP,
                     CURRENT_TIMESTAMP, NULL)`,
            [
                `legacy-${legacyId}`,
                legacyId,
                status === 'approved' ? 'published' : status
            ]
        );
        const pageValues = CARD_PAGE_SEEDS.map(() =>
            "(?, 'live', ?, ?, ?::uuid, 'live', 100, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)").join(', ');
        await run(
            db,
            `INSERT INTO public.fudaba_card_pages
                (card_id, queue, page_id, display_order, object_version,
                 object_queue, width, height, created_at, updated_at)
             VALUES ${pageValues}`,
            CARD_PAGE_SEEDS.flatMap((page) => [`legacy-${legacyId}`, page.pageId, page.order, page.version])
        );
        // 页面行是唯一媒体来源，所以夹具必须把对应对象真正落盘：审核只发布
        // 页面行解析出的版本化 key，公开媒体路由也只从这里读。
        for (const page of CARD_PAGE_SEEDS) {
            const objectPath = cardPageObjectPath(`legacy-${legacyId}`, page.pageId, page.version);
            fs.mkdirSync(path.dirname(objectPath), { recursive: true });
            fs.writeFileSync(objectPath, validPng);
        }
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
        get APPROVED_FRONT_ROUTE_URL() { return `/api/cards/${approvedCardId}/media/front`; },

        get APPROVED_BACK_ROUTE_URL() { return `/api/cards/${approvedCardId}/media/back`; },

        get APPROVED_FRONT_THUMBNAIL_URL() { return APPROVED_FRONT_THUMBNAIL_URL; },
        get APPROVED_FRONT_URL() { return APPROVED_FRONT_URL; },
        get EVENT_DIR() { return EVENT_DIR; },
        get EVENT_POSTER_URL() { return EVENT_POSTER_URL; },
        get LEGACY_SERVER_ENTRY() { return LEGACY_SERVER_ENTRY; },
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
        get validPng() { return validPng; },
        get,
        getOpSession() { return auth.getOpSession(fixture); },
        getOpToken() { return auth.getOpToken(fixture); },
        isolatedServerEnv,
        rawRequest,
        run,
        seedLegacyNamecard,
        test
    };

    beforeAll(async () => {
        if (!postgresIntegrationEnabled()) return;
        process.env.IMS_ENV_FILE = '';
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-node-security-'));
        uploadsDir = path.join(tempDir, 'uploads');
        EVENT_DIR = path.join(uploadsDir, 'editorial/events/assets');
        fs.mkdirSync(EVENT_DIR, { recursive: true });
        // 种子页面对象与事件海报共用同一份 PNG 字节，所以先生成再落盘。
        validPng = await sharp({
            create: {
                width: 2,
                height: 2,
                channels: 3,
                background: { r: 120, g: 40, b: 200 }
            }
        }).png().toBuffer();
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
        const eventPoster = path.join(EVENT_DIR, 'security-fixture-poster', 'poster.png');
        fs.mkdirSync(path.dirname(eventPoster), { recursive: true });
        fs.writeFileSync(eventPoster, validPng);

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
        // The chronicle cases write their own metadata fixtures, and the suite
        // only ever created this directory as a side effect of an earlier case
        // issuing a request. Creating it with the rest of the fixture keeps the
        // cases independent of the order they run in.
        fs.mkdirSync(path.join(chronicleBase, 'metadata'), { recursive: true });

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

    afterAll(async () => {
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
