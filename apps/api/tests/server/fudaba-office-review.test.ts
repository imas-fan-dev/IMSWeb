import { expect, vi } from 'vitest';
import {
    createPostgresTestDatabase,
    connectPostgresTestDatabase,
    postgresTest as test,
} from '../postgres-test-database';
import {
    insertBackofficeAccount,
    insertFudabaOfficePublicLocation,
} from '../fixtures/rows';
import {
    bearerTokenHeaders,
    cookieCsrfHeaders,
    fixtureSha256Hex,
} from '../fixtures/auth-request';
import {
    BACKOFFICE_ACCESS_TOKEN_COOKIE,
    BACKOFFICE_CSRF_TOKEN_COOKIE,
} from '@/domains/admin/backoffice-auth/backoffice-auth-session';
import { ProtectedMemoryStorage } from '../fixtures/owner-route-fixture';
import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import { createTestApp, testRequest } from './test-app';
import { assertContractJson } from '../contracts/contract-json';
import { SqlFudabaRepository } from '@/infra/db/repositories/fudaba-repository';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import { SqlBackofficeAuthRepository } from '@/infra/db/repositories/backoffice-auth-repository';
import { SqlAuditRepository } from '@/infra/db/repositories/audit-repository';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { HmacPlatformTokenService } from '@/infra/security/hmac/platform-token-service';
import { HmacBackofficeTokenService } from '@/infra/security/hmac/token-service';
import type { RuntimeServices } from '@/ports/runtime-services';
import type { FudabaOwnerOffice } from '@imsweb/contracts/fudaba';
import {
    fudabaOfficeMutationResponseSchema,
    fudabaOfficePageSchema,
    fudabaMapOfficeListSchema,
    fudabaSeriesListSchema,
} from '@imsweb/contracts/fudaba';
import {
    adminOfficeMutationSchema,
    adminOfficeReviewListSchema,
    adminOfficeReviewDetailSchema,
    adminOfficeHttpErrorSchema,
} from '@imsweb/contracts/fudaba/office-review';

const SECRET = 'office-review-tests-with-distinct-audiences-32-bytes';
const fields = {
    name: 'Review office',
    intro: 'Office intro',
    city: '上海市',
    address: '测试街道123号',
    latitude: 31.230412345,
    longitude: 121.473712345,
    accent: '#2581c7',
    isOpen: true,
    seriesCodes: ['765'],
};

class ReviewStorage extends ProtectedMemoryStorage {
    readonly protections: string[] = [];
    failPublish = false;
    failProtect = false;
    async publish(key: string): Promise<void> {
        await super.publish(key);
        if (this.failPublish) throw new Error('publish response lost');
    }
    async protect(key: string): Promise<void> {
        this.protections.push(key);
        if (this.failProtect) throw new Error('protect unavailable');
        const object = this.objects.get(key);
        if (object)
            object.options = { ...object.options, protectedAccess: true };
    }
}

async function fixture(email = true) {
    const db = await createPostgresTestDatabase('office-review');
    const schema = new PostgresqlSchemaStrategy();
    await schema.initializeCore(db);
    await seedCanonicalFudabaAgencies(db);
    const repo = new SqlFudabaRepository(db, schema);
    const platform = new SqlPlatformAccountRepository(db, schema);
    await Promise.all([repo.initialize(), platform.initialize()]);
    const ownerId = 'office-review-owner',
        now = Date.now(),
        csrf = 'office-review-csrf';
    const account = {
        id: ownerId,
        status: 'active' as const,
        tokenVersion: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        profile: {
            displayName: 'OAuth制作人',
            avatarObjectKey: null,
            avatarExternalUrl: null,
            homeCity: null,
            bio: '',
            updatedAt: now,
        },
    };
    if (email)
        await platform.createEmailAccount({
            ...account,
            credential: {
                normalizedEmail: 'producer@example.test',
                algorithm: 'bcrypt',
                parametersJson: '{}',
                passwordHash: 'test-hash',
                createdAt: now,
                updatedAt: now,
            },
        });
    else await platform.createAccountWithProfile(account);
    const adminId = await insertBackofficeAccount(db, 'office-review-admin', {
        producername: 'Office Reviewer',
    });
    const platformTokens = new HmacPlatformTokenService(SECRET),
        backofficeTokens = new HmacBackofficeTokenService(SECRET);
    await platform.createRefreshSession({
        id: 'office-review-session',
        accountId: ownerId,
        accountTokenVersion: 0,
        tokenHash: fixtureSha256Hex('office-review-refresh'),
        csrfHash: fixtureSha256Hex(csrf),
        createdAt: now,
        expiresAt: now + 3_600_000,
        event: {
            id: 'office-review-session-event',
            accountId: ownerId,
            eventType: 'auth.session.created',
            requestId: null,
            ipAddress: null,
            userAgent: null,
            metadataJson: '{}',
            createdAt: now,
        },
    });
    const ownerToken = await platformTokens.sign(
        {
            id: ownerId,
            tokenVersion: 0,
            sessionId: 'office-review-session',
            csrfSecret: csrf,
        },
        3600,
    );
    const adminToken = await backofficeTokens.sign(
        {
            id: adminId,
            username: 'office-review-admin',
            producername: 'Office Reviewer',
            dept: 'op',
            adminRole: 'admin',
            csrfSecret: csrf,
        },
        3600,
    );
    const storage = new ReviewStorage();
    const runtime: RuntimeServices = {
        fudaba: repo,
        platformAccounts: platform,
        backofficeAuth: new SqlBackofficeAuthRepository(db),
        audit: new SqlAuditRepository(db),
        platformTokens,
        backofficeTokens,
        storage,
        rateLimiter: {
            consume: async () => ({
                allowed: true,
                remaining: 99,
                resetAt: Date.now() + 1000,
            }),
        },
        config: {
            cookieSecure: false,
            fudabaPublicReadEnabled: true,
            fudabaWriteEnabled: true,
            fudabaMapEnabled: true,
        },
    };
    const app = createTestApp(runtime);
    const ownerHeaders = bearerTokenHeaders(ownerToken),
        adminHeaders = bearerTokenHeaders(adminToken);
    const request = (
        url: string,
        headers = adminHeaders,
        method = 'GET',
        body?: unknown,
    ) =>
        testRequest(app, url, {
            method,
            headers: { ...headers, 'Content-Type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    async function create() {
        const response = await testRequest(
            app,
            '/api/community/exchange/offices',
            {
                method: 'POST',
                headers: {
                    ...ownerHeaders,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': crypto.randomUUID(),
                },
                body: JSON.stringify(fields),
            },
        );
        return (
            await assertContractJson(
                response,
                201,
                fudabaOfficeMutationResponseSchema,
            )
        ).office;
    }
    async function approve(office: FudabaOwnerOffice) {
        const response = await request(
            `/api/admin/community/exchange/offices/${office.id}/review`,
            adminHeaders,
            'PUT',
            {
                decision: 'publish',
                expectedRevision: office.revision,
                note: '',
            },
        );
        return (
            await assertContractJson(response, 200, adminOfficeMutationSchema)
        ).item;
    }
    async function publics() {
        const list = await assertContractJson(
            await request('/api/community/exchange/offices', ownerHeaders),
            200,
            fudabaOfficePageSchema,
        );
        const map = await assertContractJson(
            await request(
                '/api/community/exchange/map/offices?bbox=120,30,123,33',
                ownerHeaders,
            ),
            200,
            fudabaMapOfficeListSchema,
        );
        const series = await assertContractJson(
            await request('/api/community/exchange/series', ownerHeaders),
            200,
            fudabaSeriesListSchema,
        );
        return { list, map, series };
    }
    return {
        db,
        schema,
        repo,
        platform,
        ownerId,
        adminId,
        storage,
        runtime,
        request,
        create,
        approve,
        publics,
        ownerHeaders,
        adminHeaders,
        adminToken,
        csrf,
    };
}

test('whole-office approval is required for directory, search, detail, map and series counts; coordinates stay exact', async () => {
    const f = await fixture();
    const office = await f.create();
    expect(office).toMatchObject({
        reviewState: 'pending',
        reviewedBy: null,
        reviewInProgress: false,
        location: {
            latitude: fields.latitude,
            longitude: fields.longitude,
            precision: 'exact',
        },
    });
    // Legacy regional approvals must not grant whole-office publication or supply coordinates.
    await insertFudabaOfficePublicLocation(
        f.db,
        office.id,
        new Date().toISOString(),
        {
            review_state: 'published',
            reviewed_at: new Date().toISOString(),
            reviewed_by: f.adminId,
            review_audit_id: crypto.randomUUID(),
            latitude_e1: 400,
            longitude_e1: 500,
        },
    );
    expect((await f.publics()).map.items).toHaveLength(0);
    expect((await f.publics()).list.items).toHaveLength(0);
    expect(
        (
            await f.request(
                `/api/community/exchange/offices/${office.slug}`,
                f.ownerHeaders,
            )
        ).status,
    ).toBe(404);
    expect(
        (
            await assertContractJson(
                await f.request(
                    '/api/community/exchange/offices?q=Review',
                    f.ownerHeaders,
                ),
                200,
                fudabaOfficePageSchema,
            )
        ).items,
    ).toHaveLength(0);
    const approved = await f.approve(office);
    expect(approved.reviewer).toEqual({
        id: f.adminId,
        username: 'office-review-admin',
        displayName: 'Office Reviewer',
    });
    const result = await f.publics();
    expect(result.map.items[0]?.location).toEqual({
        latitude: fields.latitude,
        longitude: fields.longitude,
        precision: 'exact',
    });
    expect(result.list.items).toHaveLength(1);
    expect(
        result.series.items.find((item) => item.code === '765')
            ?.activeOfficeCount,
    ).toBe(1);
    expect(
        (
            await f.request(
                `/api/community/exchange/offices/${office.slug}`,
                f.ownerHeaders,
            )
        ).status,
    ).toBe(200);
});

for (const [field, value] of Object.entries({
    name: 'Renamed office',
    intro: 'Updated intro',
    city: '上海',
    address: '另一街道456号',
    latitude: 31.231234,
    longitude: 121.481234,
    accent: '#345678',
    isOpen: false,
    seriesCodes: [],
})) {
    test(`changing office ${field} resubmits the entire office and removes every public listing`, async () => {
        const f = await fixture(),
            initial = await f.create(),
            approved = await f.approve(initial);
        const response = await f.request(
            `/api/community/exchange/me/offices/${initial.id}`,
            f.ownerHeaders,
            'PUT',
            {
                ...fields,
                [field]: value,
                expectedRevision: approved.office.revision,
            },
        );
        const saved = (
            await assertContractJson(
                response,
                200,
                fudabaOfficeMutationResponseSchema,
            )
        ).office;
        expect(saved.reviewState).toBe('pending');
        expect(saved.reviewedBy).toBeNull();
        const publicData = await f.publics();
        expect(publicData.list.items).toHaveLength(0);
        expect(publicData.map.items).toHaveLength(0);
        expect(
            publicData.series.items.find((item) => item.code === '765')
                ?.activeOfficeCount,
        ).toBe(0);
        expect(
            (
                await f.request(
                    `/api/community/exchange/offices/${initial.slug}`,
                    f.ownerHeaders,
                )
            ).status,
        ).toBe(404);
        expect(
            (
                await f.request(
                    `/api/admin/community/exchange/offices/${initial.id}/review`,
                    f.adminHeaders,
                    'PUT',
                    {
                        decision: 'publish',
                        expectedRevision: approved.office.revision,
                        note: '',
                    },
                )
            ).status,
        ).toBe(409);
    });
}

test('an identical save retains approval while explicit resubmission after rejection returns to pending', async () => {
    const f = await fixture(),
        created = await f.create(),
        approved = await f.approve(created);
    const same = await assertContractJson(
        await f.request(
            `/api/community/exchange/me/offices/${created.id}`,
            f.ownerHeaders,
            'PUT',
            { ...fields, expectedRevision: approved.office.revision },
        ),
        200,
        fudabaOfficeMutationResponseSchema,
    );
    expect(same.office.revision).toBe(approved.office.revision);
    expect(same.office.reviewState).toBe('published');
    const changed = (
        await assertContractJson(
            await f.request(
                `/api/community/exchange/me/offices/${created.id}`,
                f.ownerHeaders,
                'PUT',
                {
                    ...fields,
                    intro: 'Needs review',
                    expectedRevision: same.office.revision,
                },
            ),
            200,
            fudabaOfficeMutationResponseSchema,
        )
    ).office;
    const rejected = (
        await assertContractJson(
            await f.request(
                `/api/admin/community/exchange/offices/${created.id}/review`,
                f.adminHeaders,
                'PUT',
                {
                    decision: 'reject',
                    expectedRevision: changed.revision,
                    note: '请补充说明',
                },
            ),
            200,
            adminOfficeMutationSchema,
        )
    ).item.office;
    const resubmitted = (
        await assertContractJson(
            await f.request(
                `/api/community/exchange/me/offices/${created.id}`,
                f.ownerHeaders,
                'PUT',
                {
                    ...fields,
                    intro: 'Needs review',
                    expectedRevision: rejected.revision,
                },
            ),
            200,
            fudabaOfficeMutationResponseSchema,
        )
    ).office;
    expect(resubmitted.reviewState).toBe('pending');
    expect(resubmitted.reviewNote).toBe('');
});

test('admin office edits use the current revision, preserve owner identity and audit only actual successful changes', async () => {
    const f = await fixture(false),
        created = await f.create(),
        approved = await f.approve(created);
    const before = await f.db
        .prepare('SELECT COUNT(*) AS count FROM logs')
        .first<{ count: string }>();
    const changed = await assertContractJson(
        await f.request(
            `/api/admin/community/exchange/offices/${created.id}`,
            f.adminHeaders,
            'PUT',
            {
                ...fields,
                intro: '管理员修订',
                expectedRevision: approved.office.revision,
            },
        ),
        200,
        adminOfficeMutationSchema,
    );
    expect(changed.item.owner).toEqual({
        id: f.ownerId,
        email: null,
        displayName: 'OAuth制作人',
    });
    expect(changed.item.office).toMatchObject({
        reviewState: 'pending',
        intro: '管理员修订',
    });
    const stale = await f.request(
        `/api/admin/community/exchange/offices/${created.id}`,
        f.adminHeaders,
        'PUT',
        {
            ...fields,
            intro: '旧窗口覆盖',
            expectedRevision: approved.office.revision,
        },
    );
    expect(stale.status).toBe(409);
    const after = await f.db
        .prepare('SELECT COUNT(*) AS count FROM logs')
        .first<{ count: string }>();
    expect(Number(after?.count)).toBe(Number(before?.count) + 1);
    const latest = await assertContractJson(
        await f.request(`/api/admin/community/exchange/offices/${created.id}`),
        200,
        adminOfficeReviewDetailSchema,
    );
    expect(latest.item.office.intro).toBe('管理员修订');
});

test('cross-connection review CAS locks the exact snapshot and never duplicates an audit on repeated completion', async () => {
    const f = await fixture(),
        office = await f.create();
    const connection = connectPostgresTestDatabase(f.db),
        sibling = new SqlFudabaRepository(connection, f.schema);
    await sibling.initialize();
    try {
        const attempts = await Promise.all([
            f.repo.beginOfficeReview({
                officeId: office.id,
                expectedRevision: office.revision,
                operationId: 'review-a',
            }),
            sibling.beginOfficeReview({
                officeId: office.id,
                expectedRevision: office.revision,
                operationId: 'review-b',
            }),
        ]);
        expect(
            attempts.filter((result) => result.status === 'saved'),
        ).toHaveLength(1);
        const won = attempts.findIndex((result) => result.status === 'saved'),
            claimed = attempts[won]!;
        if (claimed.status !== 'saved')
            throw new Error('expected one claimed snapshot');
        const operationId = won === 0 ? 'review-a' : 'review-b';
        const edit = await f.repo.updateOfficeForOwner({
            ...fields,
            intro: '不能在审核中修改',
            officeId: office.id,
            ownerAccountId: f.ownerId,
            expectedRevision: claimed.office.revision,
            updatedAt: new Date().toISOString(),
        });
        expect(edit.status).toBe('conflict');
        const command = {
            officeId: office.id,
            expectedRevision: claimed.office.revision,
            operationId,
            decision: 'publish' as const,
            reviewedAt: new Date().toISOString(),
            reviewedBy: f.adminId,
            reviewNote: '',
            pendingCoverObjectKey: null,
            audit: {
                username: 'office-review-admin',
                producername: 'Office Reviewer',
                action: 'review-test',
                target: office.id,
                ip: '127.0.0.1',
                time: new Date().toISOString(),
            },
        };
        expect((await f.repo.completeOfficeReview(command)).status).toBe(
            'saved',
        );
        expect((await sibling.completeOfficeReview(command)).status).toBe(
            'conflict',
        );
        const count = await f.db
            .prepare(
                "SELECT COUNT(*) AS count FROM logs WHERE action='review-test'",
            )
            .first<{ count: string }>();
        expect(Number(count?.count)).toBe(1);
    } finally {
        await connection.close();
    }
});

for (const outcome of ['normal', 'commit-lost', 'audit-failed']) {
    test(`published office withdrawal preserves its exact snapshot and media: ${outcome}`, async () => {
        const f = await fixture(),
            created = await f.create();
        const key = `protected/fudaba/offices/${created.id}/cover.webp`;
        f.storage.seed(key);
        const reserved = await f.repo.reservePendingOfficeCoverForOwner({
            officeId: created.id,
            ownerAccountId: f.ownerId,
            objectKey: key,
            expectedRevision: created.revision,
            submittedAt: new Date().toISOString(),
        });
        if (reserved.status !== 'saved') throw new Error('reservation failed');
        const approved = await f.approve({
            ...created,
            revision: reserved.office.revision,
        });
        const publish = vi.spyOn(f.storage, 'publish');
        if (outcome === 'commit-lost') {
            const complete = f.repo.completeOfficeReview.bind(f.repo);
            vi.spyOn(f.repo, 'completeOfficeReview').mockImplementationOnce(
                async (input) => {
                    await complete(input);
                    throw new Error('withdraw response lost');
                },
            );
        }
        if (outcome === 'audit-failed') {
            await f.db
                .prepare(
                    `CREATE FUNCTION reject_withdraw_audit() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'forced withdrawal audit failure'; END; $$`,
                )
                .run();
            await f.db
                .prepare(
                    `CREATE TRIGGER reject_withdraw_audit BEFORE INSERT ON logs
                FOR EACH ROW EXECUTE FUNCTION reject_withdraw_audit()`,
                )
                .run();
        }
        const body = {
            decision: 'withdraw',
            expectedRevision: approved.office.revision,
            note: '',
        };
        const path = `/api/admin/community/exchange/offices/${created.id}/review`;
        const response = await f.request(path, f.adminHeaders, 'PUT', body);
        expect(publish).not.toHaveBeenCalled();
        expect(f.storage.protections).toHaveLength(0);
        expect(f.storage.objects.get(key)?.options.protectedAccess).toBe(false);
        if (outcome === 'audit-failed') {
            expect(response.status).toBe(500);
            const current = await f.repo.findOfficeById(created.id);
            expect(current?.review_state).toBe('published');
            expect(current?.review_operation_id).toBeNull();
            expect((await f.publics()).map.items).toHaveLength(1);
        } else {
            const withdrawn = (
                await assertContractJson(
                    response,
                    200,
                    adminOfficeMutationSchema,
                )
            ).item;
            expect(withdrawn.office).toMatchObject({
                reviewState: 'pending',
                reviewedAt: null,
                reviewedBy: null,
                reviewNote: '',
                reviewInProgress: false,
                location: approved.office.location,
            });
            expect((await f.publics()).map.items).toHaveLength(0);
            expect((await f.publics()).list.items).toHaveLength(0);
            expect(
                (await f.request(path, f.adminHeaders, 'PUT', body)).status,
            ).toBe(409);
            expect((await f.approve(withdrawn.office)).office.reviewState).toBe(
                'published',
            );
            expect((await f.publics()).map.items).toHaveLength(1);
            expect(publish).not.toHaveBeenCalled();
            const audit = await f.db
                .prepare(
                    "SELECT COUNT(*) AS count FROM logs WHERE action='撤回 Fudaba 事务所发布'",
                )
                .first<{ count: string }>();
            expect(Number(audit?.count)).toBe(1);
        }
    });
}

test('pending covers require whole-office review and are promoted only with the approved snapshot', async () => {
    const f = await fixture(),
        created = await f.create(),
        approved = await f.approve(created);
    const key = `protected/fudaba/offices/${created.id}/pending.webp`;
    f.storage.seed(key);
    const reserved = await f.repo.reservePendingOfficeCoverForOwner({
        officeId: created.id,
        ownerAccountId: f.ownerId,
        objectKey: key,
        expectedRevision: approved.office.revision,
        submittedAt: new Date().toISOString(),
    });
    if (reserved.status !== 'saved')
        throw new Error('cover reservation failed');
    expect(reserved.office.review_state).toBe('pending');
    expect((await f.publics()).map.items).toHaveLength(0);
    const latest = (
        await assertContractJson(
            await f.request(
                `/api/admin/community/exchange/offices/${created.id}`,
            ),
            200,
            adminOfficeReviewDetailSchema,
        )
    ).item;
    expect(latest.office.pendingCoverUrl).toContain(
        '/api/admin/community/exchange/offices/',
    );
    const result = await f.approve(latest.office);
    expect(result.office.pendingCoverUrl).toBeNull();
    expect(f.storage.objects.get(key)?.options.protectedAccess).toBe(false);
    expect((await f.publics()).map.items).toHaveLength(1);
});

for (const outcome of ['publish-lost', 'commit-lost', 'protect-failed']) {
    test(`office cover review safely reconciles ${outcome}`, async () => {
        const f = await fixture(),
            office = await f.create(),
            key = `protected/fudaba/offices/${office.id}/pending.webp`;
        f.storage.seed(key);
        const reserved = await f.repo.reservePendingOfficeCoverForOwner({
            officeId: office.id,
            ownerAccountId: f.ownerId,
            objectKey: key,
            expectedRevision: office.revision,
            submittedAt: new Date().toISOString(),
        });
        if (reserved.status !== 'saved')
            throw new Error('cover reservation failed');
        if (outcome === 'publish-lost') f.storage.failPublish = true;
        if (outcome === 'commit-lost') {
            const complete = f.repo.completeOfficeReview.bind(f.repo);
            vi.spyOn(f.repo, 'completeOfficeReview').mockImplementationOnce(
                async (input) => {
                    await complete(input);
                    throw new Error('completion response lost');
                },
            );
        }
        if (outcome === 'protect-failed') {
            f.storage.failPublish = true;
            f.storage.failProtect = true;
        }
        const response = await f.request(
            `/api/admin/community/exchange/offices/${office.id}/review`,
            f.adminHeaders,
            'PUT',
            {
                decision: 'publish',
                expectedRevision: reserved.office.revision,
                note: '',
            },
        );
        expect(response.status).toBe(outcome === 'commit-lost' ? 200 : 500);
        const current = await f.repo.findOfficeById(office.id);
        expect(current?.review_state).toBe(
            outcome === 'commit-lost' ? 'published' : 'pending',
        );
        expect(current?.review_operation_id !== null).toBe(
            outcome === 'protect-failed',
        );
        expect(f.storage.objects.get(key)?.options.protectedAccess).toBe(
            outcome === 'publish-lost',
        );
        if (outcome === 'commit-lost')
            expect(f.storage.protections).toHaveLength(0);
    });
}

test('admin office media GET and HEAD require Backoffice op and preserve private delivery', async () => {
    const f = await fixture(),
        office = await f.create(),
        key = `protected/fudaba/offices/${office.id}/pending.webp`;
    f.storage.seed(key);
    await f.repo.reservePendingOfficeCoverForOwner({
        officeId: office.id,
        ownerAccountId: f.ownerId,
        objectKey: key,
        expectedRevision: office.revision,
        submittedAt: new Date().toISOString(),
    });
    const url = `/api/admin/community/exchange/offices/${office.id}/media/pending-cover`;
    await assertContractJson(
        await f.request(url, {}),
        401,
        adminOfficeHttpErrorSchema,
    );
    await assertContractJson(
        await f.request(url, f.ownerHeaders),
        401,
        adminOfficeHttpErrorSchema,
    );
    for (const method of ['GET', 'HEAD']) {
        const response = await f.request(url, f.adminHeaders, method);
        expect(response.status).toBe(307);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(response.headers.get('Vary')).toContain('Cookie');
        expect(f.storage.readUrls.at(-1)).toEqual({ key, method });
    }
    const binaryApp = createTestApp({
        ...f.runtime,
        storage: {
            get: f.storage.get.bind(f.storage),
            put: f.storage.put.bind(f.storage),
            delete: f.storage.delete.bind(f.storage),
            exists: f.storage.exists.bind(f.storage),
            copy: f.storage.copy.bind(f.storage),
            move: f.storage.move.bind(f.storage),
            list: f.storage.list.bind(f.storage),
            deletePrefix: f.storage.deletePrefix.bind(f.storage),
        },
    });
    const binary = await testRequest(binaryApp, url, {
        headers: f.adminHeaders,
    });
    expect(binary.status).toBe(200);
    expect(binary.headers.get('Content-Type')).toContain('image/webp');
    expect((await binary.arrayBuffer()).byteLength).toBeGreaterThan(0);
    await assertContractJson(
        await f.request(url.replace('pending-cover', 'missing')),
        404,
        adminOfficeHttpErrorSchema,
    );
});

test('approving a legacy private current cover makes it readable without inventing a new pending upload', async () => {
    const f = await fixture(),
        office = await f.create(),
        key = `protected/fudaba/offices/${office.id}/legacy.webp`;
    f.storage.seed(key);
    await f.db
        .prepare('UPDATE fudaba_offices SET cover_object_key=? WHERE id=?')
        .bind(key, office.id)
        .run();
    const approved = await f.approve(office);
    expect(approved.office.pendingCoverUrl).toBeNull();
    expect(f.storage.objects.get(key)?.options.protectedAccess).toBe(false);
    expect((await f.publics()).list.items).toHaveLength(1);
});

test('unknown completion after a later content edit never protects an already-approved cover', async () => {
    const f = await fixture(),
        office = await f.create(),
        key = `protected/fudaba/offices/${office.id}/pending.webp`;
    f.storage.seed(key);
    const reserved = await f.repo.reservePendingOfficeCoverForOwner({
        officeId: office.id,
        ownerAccountId: f.ownerId,
        objectKey: key,
        expectedRevision: office.revision,
        submittedAt: new Date().toISOString(),
    });
    if (reserved.status !== 'saved') throw new Error('reservation failed');
    const complete = f.repo.completeOfficeReview.bind(f.repo);
    vi.spyOn(f.repo, 'completeOfficeReview').mockImplementationOnce(
        async (input) => {
            const result = await complete(input);
            if (result.status !== 'saved') throw new Error('completion failed');
            await f.repo.updateOfficeForOwner({
                ...fields,
                intro: '提交完成后的新修改',
                officeId: office.id,
                ownerAccountId: f.ownerId,
                expectedRevision: result.office.revision,
                updatedAt: new Date().toISOString(),
            });
            throw new Error('completion acknowledgement lost');
        },
    );
    const response = await f.request(
        `/api/admin/community/exchange/offices/${office.id}/review`,
        f.adminHeaders,
        'PUT',
        {
            decision: 'publish',
            expectedRevision: reserved.office.revision,
            note: '',
        },
    );
    expect(response.status).toBe(500);
    expect(f.storage.protections).toHaveLength(0);
    expect(f.storage.objects.get(key)?.options.protectedAccess).toBe(false);
    expect((await f.repo.findOfficeById(office.id))?.review_state).toBe(
        'pending',
    );
});

test('an unfinished pending upload cannot publish an office and does not leave a review lock', async () => {
    const f = await fixture(),
        office = await f.create(),
        key = `protected/fudaba/offices/${office.id}/unfinished.webp`;
    const reserved = await f.repo.reservePendingOfficeCoverForOwner({
        officeId: office.id,
        ownerAccountId: f.ownerId,
        objectKey: key,
        expectedRevision: office.revision,
        submittedAt: new Date().toISOString(),
    });
    if (reserved.status !== 'saved') throw new Error('reservation failed');
    f.storage.failProtect = true;
    const response = await f.request(
        `/api/admin/community/exchange/offices/${office.id}/review`,
        f.adminHeaders,
        'PUT',
        {
            decision: 'publish',
            expectedRevision: reserved.office.revision,
            note: '',
        },
    );
    expect(response.status).toBe(500);
    const current = await f.repo.findOfficeById(office.id);
    expect(current?.review_state).toBe('pending');
    expect(current?.review_operation_id).toBeNull();
});

test('legacy location publication endpoints no longer provide a second review or coordinate source', async () => {
    const f = await fixture(),
        office = await f.create();
    for (const method of ['GET', 'PUT', 'DELETE'])
        expect(
            (
                await f.request(
                    `/api/community/exchange/me/offices/${office.id}/location`,
                    f.ownerHeaders,
                    method,
                    method === 'GET'
                        ? undefined
                        : {
                              latitude: 31.2,
                              longitude: 121.5,
                              expectedRevision: 0,
                              precision: 'regional',
                          },
                )
            ).status,
        ).toBe(404);
    expect(
        (await f.request('/api/admin/community/exchange/office-locations'))
            .status,
    ).toBe(404);
    expect((await f.publics()).map.items).toHaveLength(0);
});

test('whole-office review keeps Backoffice op and cookie CSRF boundaries independently of rollout flags', async () => {
    const f = await fixture(),
        office = await f.create();
    const app = createTestApp({
        ...f.runtime,
        config: {
            ...f.runtime.config,
            fudabaPublicReadEnabled: false,
            fudabaMapEnabled: false,
            fudabaWriteEnabled: false,
        },
    });
    const list = '/api/admin/community/exchange/offices?state=pending&limit=20';
    await assertContractJson(
        await testRequest(app, list),
        401,
        adminOfficeHttpErrorSchema,
    );
    await assertContractJson(
        await testRequest(app, list, { headers: f.ownerHeaders }),
        401,
        adminOfficeHttpErrorSchema,
    );
    const queue = await assertContractJson(
        await testRequest(app, list, { headers: f.adminHeaders }),
        200,
        adminOfficeReviewListSchema,
    );
    expect(queue.items[0]?.office.address).toBe(fields.address);
    const nonOp = await insertBackofficeAccount(f.db, 'non-op-reviewer', {
        dept: 'story',
        admin_role: null,
    });
    const token = await f.runtime.backofficeTokens!.sign(
        {
            id: nonOp,
            username: 'non-op-reviewer',
            producername: 'Reader',
            dept: 'story',
            adminRole: null,
            csrfSecret: f.csrf,
        },
        3600,
    );
    await assertContractJson(
        await testRequest(app, list, { headers: bearerTokenHeaders(token) }),
        403,
        adminOfficeHttpErrorSchema,
    );
    const cookies: [string, string][] = [
        [BACKOFFICE_ACCESS_TOKEN_COOKIE, f.adminToken],
        [BACKOFFICE_CSRF_TOKEN_COOKIE, f.csrf],
    ];
    const url = `/api/admin/community/exchange/offices/${office.id}/review`;
    const body = JSON.stringify({
        decision: 'publish',
        expectedRevision: office.revision,
        note: '',
    });
    await assertContractJson(
        await testRequest(app, url, {
            method: 'PUT',
            headers: cookieCsrfHeaders(cookies, null, {
                'content-type': 'application/json',
            }),
            body,
        }),
        403,
        adminOfficeHttpErrorSchema,
    );
    const approved = await assertContractJson(
        await testRequest(app, url, {
            method: 'PUT',
            headers: cookieCsrfHeaders(cookies, f.csrf, {
                'content-type': 'application/json',
            }),
            body,
        }),
        200,
        adminOfficeMutationSchema,
    );
    expect(approved.item.office.reviewState).toBe('published');
});

test('the combined office submission retains the Platform write budget without changing its revision', async () => {
    const f = await fixture(),
        office = await f.create();
    vi.spyOn(f.runtime.rateLimiter!, 'consume').mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 1000,
    });
    const response = await f.request(
        `/api/community/exchange/me/offices/${office.id}`,
        f.ownerHeaders,
        'PUT',
        {
            ...fields,
            name: 'throttled change',
            expectedRevision: office.revision,
        },
    );
    expect(response.status).toBe(429);
    const current = await f.repo.findOfficeById(office.id);
    expect(current?.revision).toBe(office.revision);
    expect(current?.name).toBe(fields.name);
});

test('a failed audit insert rolls back publication and releases only its own pending review lock', async () => {
    const f = await fixture(),
        office = await f.create();
    await f.db
        .prepare(
            `CREATE FUNCTION reject_office_review_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'forced whole-office audit failure'; END; $$`,
        )
        .run();
    await f.db
        .prepare(
            `CREATE TRIGGER reject_office_review_audit BEFORE INSERT ON logs
        FOR EACH ROW EXECUTE FUNCTION reject_office_review_audit()`,
        )
        .run();
    const response = await f.request(
        `/api/admin/community/exchange/offices/${office.id}/review`,
        f.adminHeaders,
        'PUT',
        { decision: 'publish', expectedRevision: office.revision, note: '' },
    );
    expect(response.status).toBe(500);
    const current = await f.repo.findOfficeById(office.id);
    expect(current?.review_state).toBe('pending');
    expect(current?.review_operation_id).toBeNull();
    expect((await f.publics()).map.items).toHaveLength(0);
    expect(
        Number(
            (
                await f.db
                    .prepare('SELECT COUNT(*) AS count FROM logs')
                    .first<{ count: string }>()
            )?.count,
        ),
    ).toBe(0);
});
