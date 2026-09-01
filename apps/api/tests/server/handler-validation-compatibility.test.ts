import { namecardPageSchema } from '@imsweb/contracts/namecards';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHonoApp } from '@/app';
import type { ObjectStorage } from '@/ports/object-storage';
import type {
    AdminAccountRepository,
    AuditLogInput,
    AuditRepository,
    BackofficeAuthRepository,
    EventRepository,
    NamecardRepository,
    NewsRepository,
    StoryRepository
} from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';

interface CompatibilityCalls {
    adminDelete: number[];
    audit: AuditLogInput[];
    authFind: number[];
    eventDelete: number[];
    eventFind: number[];
    eventFindMedia: number[];
    namecardApprove: number[];
    namecardDelete: number[];
    namecardFindApproved: number[];
    namecardFindMedia: number[];
    namecardListAdmin: Array<[number, number]>;
    namecardListApproved: Array<[number, number]>;
    newsDelete: number[];
    newsFindMedia: number[];
    storyReads: number;
    storageGet: number;
    storageWrites: number;
}

function createCompatibilityFixture(
    namecardOverrides: Partial<NamecardRepository> = {},
    serviceOverrides: Partial<RuntimeServices> = {}
) {
    const calls: CompatibilityCalls = {
        adminDelete: [],
        audit: [],
        authFind: [],
        eventDelete: [],
        eventFind: [],
        eventFindMedia: [],
        namecardApprove: [],
        namecardDelete: [],
        namecardFindApproved: [],
        namecardFindMedia: [],
        namecardListAdmin: [],
        namecardListApproved: [],
        newsDelete: [],
        newsFindMedia: [],
        storyReads: 0,
        storageGet: 0,
        storageWrites: 0
    };
    const events: EventRepository = {
        async insertEvent() { throw new Error('unexpected event insert'); },
    async updateEvent() { return false; },
    async findEventByOperationKey() { return null; },
    async markEventReady() { return false; },
        async countEvents() { return 0; },
        async listEvents() { return []; },
        async findLatestEventId() { return null; },
        async listEventsByCursor() { return []; },
        async findEvent(id) {
            calls.eventFind.push(id);
            return null;
        },
        async findEventMedia(id) {
            calls.eventFindMedia.push(id);
            return null;
        },
        async countEventMediaReferences() { return 0; },
        async deleteEvent(id) {
            calls.eventDelete.push(id);
            return false;
        }
    };
    const namecards: NamecardRepository = {
        async findCardByOrderedHashes() { return null; },
        async insertPendingCard() { throw new Error('unexpected namecard insert'); },
        async countApprovedCards() { return 0; },
        async countAdminCards() { return 0; },
        async listApprovedCards(limit, offset) {
            calls.namecardListApproved.push([limit, offset]);
            return [];
        },
        async findApprovedCardMedia(id) {
            calls.namecardFindApproved.push(id);
            return null;
        },
        async listAdminCards(limit, offset) {
            calls.namecardListAdmin.push([limit, offset]);
            return [];
        },
        async beginCardApproval(id) {
            calls.namecardApprove.push(id);
            return { status: 'not-found' };
        },
        async completeCardApproval() { return { status: 'not-found' }; },
        async findCardMedia(id) {
            calls.namecardFindMedia.push(id);
            return null;
        },
        async deleteCard(id) {
            calls.namecardDelete.push(id);
            return { status: 'not-found' };
        },
        async findSubmissionByTokenHash() { return null; },
        async withdrawSubmission() { return { status: 'not-found' }; },
        async rejectSubmission() { return { status: 'not-found' }; },
        async purgeTerminalCards() { return []; },
        async findSubmissionWithHashesByTokenHash() { return null; },
        async replaceSubmissionImage() { return { status: 'not-found' }; },
        async resubmitSubmission() { return { status: 'not-found' }; },
        async findCardByMediaUrl() { return null; },
        ...namecardOverrides
    };
    const news: NewsRepository = {
        async listPublicNews() { return []; },
        async findLatestPublicNewsId() { return null; },
        async listPublicNewsByCursor() { return []; },
        async listAdminNews() { return []; },
        async insertNews() { throw new Error('unexpected news insert'); },
        async findNewsMedia(id) {
            calls.newsFindMedia.push(id);
            return null;
        },
        async deleteNews(id) { calls.newsDelete.push(id); }
    };
    const backofficeAuth: BackofficeAuthRepository = {
        async findUserByUsername() { return null; },
        async findUserById(id) {
            calls.authFind.push(id);
            if (id === 99) {
                return {
                    id,
                    username: 'super-operator',
                    password: 'stored-digest',
                    dept: 'op',
                    producername: 'Super Operator',
                    admin_role: 'super_admin'
                };
            }
            if (id === 98) {
                return {
                    id,
                    username: 'regular-operator',
                    password: 'stored-digest',
                    dept: 'op',
                    producername: 'Regular Operator',
                    admin_role: 'admin'
                };
            }
            if (id === 1 || id === 10) {
                return {
                    id,
                    username: `admin-${id}`,
                    password: 'stored-digest',
                    dept: 'op',
                    producername: `Admin ${id}`,
                    admin_role: 'admin'
                };
            }
            return null;
        },
        async createRefreshSession() { throw new Error('unexpected refresh session create'); },
        async findRefreshSessionByTokenHash() { return null; },
        async rotateRefreshSession() { return false; },
        async revokeRefreshSession() { throw new Error('unexpected refresh session revoke'); },
        async deleteExpiredRefreshSessions() {}
    };
    const adminAccounts: AdminAccountRepository = {
        async ensureSuperAdmin() {},
        async listAdminAccounts() { return []; },
        async createAdminAccount() { throw new Error('unexpected admin account create'); },
        async deleteAdminAccount(id) {
            calls.adminDelete.push(id);
            return 'deleted';
        }
    };
    const audit: AuditRepository = {
        async insertAuditLog(input) { calls.audit.push(input); },
        async listRecentAuditLogs() { return []; }
    };
    const story = new Proxy({} as StoryRepository, {
        get() {
            calls.storyReads += 1;
            return async () => {
                throw new Error('unexpected Wiki repository call');
            };
        }
    });
    const storage: ObjectStorage = {
        async get() {
            calls.storageGet += 1;
            return null;
        },
        async put() {
            calls.storageWrites += 1;
            throw new Error('unexpected storage write');
        },
        async delete() { calls.storageWrites += 1; },
        async publish() { calls.storageWrites += 1; },
        async exists() { return true; },
        async copy() { calls.storageWrites += 1; },
        async move() { calls.storageWrites += 1; },
        async list() { return []; },
        async deletePrefix() { calls.storageWrites += 1; }
    };
    const services: RuntimeServices = {
        adminAccounts,
        audit,
        backofficeAuth,
        events,
        namecards,
        news,
        story,
        storage,
        backofficeTokens: {
            async sign() { return 'op-token'; },
            async verify(token) {
                if (token === 'regular-token') {
                    return {
                        id: 98,
                        username: 'regular-operator',
                        producername: 'Regular Operator',
                        dept: 'op',
                        adminRole: 'admin',
                        csrfSecret: 'csrf'
                    };
                }
                return {
                    id: 99,
                    username: 'super-operator',
                    producername: 'Super Operator',
                    dept: 'op',
                    adminRole: 'super_admin',
                    csrfSecret: 'csrf'
                };
            }
        },
        ...serviceOverrides
    };
    const app = createHonoApp(() => services);
    return {
        calls,
        request(pathname: string, init?: RequestInit) {
            return app.request(`http://ims.test${pathname}`, init);
        }
    };
}

async function responseJson(response: Response): Promise<unknown> {
    return response.json();
}

test('invalid event IDs preserve legacy 404 bodies without repository side effects', async () => {
    const fixture = createCompatibilityFixture();
    const get = await fixture.request('/api/events/not-an-id');
    assert.equal(get.status, 404);
    assert.deepEqual(await responseJson(get), { error: '活动不存在' });

    const deletion = await fixture.request('/api/events/not-an-id', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer op-token' }
    });
    assert.equal(deletion.status, 404);
    assert.deepEqual(await responseJson(deletion), { error: '不存在' });
    assert.deepEqual(fixture.calls.eventFind, []);
    assert.deepEqual(fixture.calls.eventFindMedia, []);
    assert.deepEqual(fixture.calls.eventDelete, []);
    assert.deepEqual(fixture.calls.audit, []);
    assert.equal(fixture.calls.storageWrites, 0);
});

test('event creation rejects a missing idempotency key before parsing uploads', async () => {
    const fixture = createCompatibilityFixture();
    const response = await fixture.request('/api/events', {
        method: 'POST',
        headers: { Authorization: 'Bearer op-token' }
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await responseJson(response), {
        error: 'Idempotency-Key is required'
    });
    assert.equal(fixture.calls.storageWrites, 0);
    assert.deepEqual(fixture.calls.audit, []);
});

test('anonymous submission receipts do not reveal whether an ID exists', async () => {
    const fixture = createCompatibilityFixture();
    const missingToken = await fixture.request('/api/namecards/submissions/19');
    const wrongToken = await fixture.request('/api/namecards/submissions/19', {
        headers: { 'X-Namecard-Withdrawal-Token': 'wrong-token' }
    });
    const withdrawn = await fixture.request('/api/namecards/submissions/19/withdraw', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Namecard-Withdrawal-Token': 'wrong-token'
        },
        body: JSON.stringify({ expected_revision: 0 })
    });

    for (const response of [missingToken, wrongToken, withdrawn]) {
        assert.equal(response.status, 404);
        assert.deepEqual(await responseJson(response), {
            error: 'Submission not found'
        });
    }
    assert.equal(fixture.calls.storageWrites, 0);
    assert.deepEqual(fixture.calls.audit, []);
});

test('a valid anonymous receipt can read and withdraw only the pending revision', async () => {
    const seenHashes: string[] = [];
    const seenWithdrawals: Array<[number, string, number]> = [];
    const pending = {
        id: 19,
        seriesCode: null,
        favoriteIdols: [],
        image1_url: '/uploads/namecard/original/front.webp',
        image2_url: '/uploads/namecard/original/back.webp',
        status: 'pending' as const,
        created_at: '2026-08-11T00:00:00.000Z',
        revision: 2
    };
    const fixture = createCompatibilityFixture({
        async findSubmissionByTokenHash(id, tokenHash) {
            assert.equal(id, 19);
            seenHashes.push(tokenHash);
            return pending;
        },
        async withdrawSubmission(id, tokenHash, expectedRevision) {
            seenWithdrawals.push([id, tokenHash, expectedRevision]);
            return {
                status: 'updated',
                card: { ...pending, status: 'withdrawn', revision: 3 }
            };
        }
    });
    const headers = {
        'X-Namecard-Withdrawal-Token': 'a'.repeat(64)
    };

    const detail = await fixture.request('/api/namecards/submissions/19', { headers });
    assert.equal(detail.status, 200);
    assert.deepEqual(await responseJson(detail), { submission: pending });

    const withdrawn = await fixture.request('/api/namecards/submissions/19/withdraw', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_revision: 2 })
    });
    assert.equal(withdrawn.status, 200);
    assert.deepEqual(await responseJson(withdrawn), {
        success: true,
        submission: {
            id: 19,
            seriesCode: null,
            favoriteIdols: [],
            image1_url: '/uploads/namecard/original/front.webp',
            image2_url: '/uploads/namecard/original/back.webp',
            status: 'withdrawn',
            created_at: '2026-08-11T00:00:00.000Z',
            revision: 3
        }
    });

    assert.equal(seenHashes.length, 1);
    assert.match(seenHashes[0], /^[a-f0-9]{64}$/);
    assert.deepEqual(seenWithdrawals, [[19, seenHashes[0], 2]]);
    assert.equal(fixture.calls.storageWrites, 0);
    assert.deepEqual(fixture.calls.audit.map(({ action, target, username }) => ({
        action,
        target,
        username
    })), [{
        action: '撤回名片投稿',
        target: 'card_id=19;revision=3',
        username: 'anonymous'
    }]);
});

test('namecard approval publishes originals and thumbnails before the final CAS transition', async () => {
    const fixture = createCompatibilityFixture({
        async beginCardApproval(id, expectedRevision) {
            assert.equal(id, 19);
            assert.equal(expectedRevision, 2);
            return {
                status: 'claimed',
                card: {
                    id,
                    image1_url: '/uploads/namecard/original/front.webp',
                    image2_url: '/uploads/namecard/original/back.webp',
                    status: 'approving',
                    created_at: null,
                    revision: 3
                }
            };
        },
        async completeCardApproval(id, approvingRevision) {
            assert.equal(id, 19);
            assert.equal(approvingRevision, 3);
            return {
                status: 'updated',
                card: {
                    id,
                    image1_url: '/uploads/namecard/original/front.webp',
                    image2_url: '/uploads/namecard/original/back.webp',
                    status: 'approved',
                    created_at: null,
                    revision: 4
                }
            };
        }
    });
    const response = await fixture.request('/api/admin/cards/approve/19', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer op-token',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expected_revision: 2 })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await responseJson(response), { success: true, revision: 4 });
    assert.equal(fixture.calls.storageWrites, 4);
    assert.deepEqual(fixture.calls.audit.map(({ action, target }) => ({ action, target })), [{
        action: '审核图片通过',
        target: 'card_id=19;revision=4'
    }]);
});

test('namecard approval heals legacy uploads whose thumbnails were never stored', async () => {
    const writtenKeys: string[] = [];
    const publishedKeys: string[] = [];
    const originals = new Map([
        ['community/namecards/assets/front/image.webp', new Uint8Array([9, 9])],
        ['community/namecards/assets/back/image.webp', new Uint8Array([7])]
    ]);
    const fixture = createCompatibilityFixture({
        async beginCardApproval(id, expectedRevision) {
            assert.equal(id, 19);
            assert.equal(expectedRevision, 2);
            return {
                status: 'claimed',
                card: {
                    id,
                    image1_url: '/uploads/namecard/original/front.webp',
                    image2_url: '/uploads/namecard/original/back.webp',
                    status: 'approving',
                    created_at: null,
                    revision: 3
                }
            };
        },
        async completeCardApproval(id, approvingRevision) {
            assert.equal(id, 19);
            assert.equal(approvingRevision, 3);
            return {
                status: 'updated',
                card: {
                    id,
                    image1_url: '/uploads/namecard/original/front.webp',
                    image2_url: '/uploads/namecard/original/back.webp',
                    status: 'approved',
                    created_at: null,
                    revision: 4
                }
            };
        }
    }, {
        images: {
            async validate() { throw new Error('unexpected validate'); },
            async toWebp() { throw new Error('unexpected toWebp'); },
            async thumbnailPng() { throw new Error('unexpected thumbnailPng'); },
            async resizeJpeg(body) { return new Uint8Array(body.byteLength + 4); }
        },
        storage: {
            async get(key) {
                const original = originals.get(key);
                return original ? {
                    body: original,
                    size: original.byteLength,
                    contentType: 'image/webp',
                    etag: 'etag'
                } : null;
            },
            async put(key, body) {
                writtenKeys.push(key);
                return { body, size: body.byteLength, contentType: 'image/jpeg', etag: 'etag' };
            },
            async delete() {},
            async exists(key) { return !key.endsWith('/thumbnail.jpg'); },
            async publish(key) { publishedKeys.push(key); },
            async copy() {},
            async move() {},
            async list() { return []; },
            async deletePrefix() {}
        }
    });
    const response = await fixture.request('/api/admin/cards/approve/19', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer op-token',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expected_revision: 2 })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await responseJson(response), { success: true, revision: 4 });
    assert.deepEqual(writtenKeys, [
        'community/namecards/assets/front/thumbnail.jpg',
        'community/namecards/assets/back/thumbnail.jpg'
    ]);
    assert.deepEqual(publishedKeys, [
        'community/namecards/assets/front/image.webp',
        'community/namecards/assets/front/thumbnail.jpg',
        'community/namecards/assets/back/image.webp',
        'community/namecards/assets/back/thumbnail.jpg'
    ]);
    assert.deepEqual(fixture.calls.audit.map(({ action, target }) => ({ action, target })), [{
        action: '审核图片通过',
        target: 'card_id=19;revision=4'
    }]);
});

test('reject namecard soft-rejects a pending submission and audits it', async () => {
    const pending = {
        id: 19,
        image1_url: '/uploads/namecard/original/front.webp',
        image2_url: '/uploads/namecard/original/back.webp',
        status: 'pending' as const,
        created_at: '2026-08-11T00:00:00.000Z',
        revision: 2
    };
    const fixture = createCompatibilityFixture({
        async rejectSubmission(id, expectedRevision) {
            assert.equal(id, 19);
            assert.equal(expectedRevision, 2);
            return {
                status: 'updated',
                card: { ...pending, status: 'rejected', revision: 3 }
            };
        }
    });
    const response = await fixture.request('/api/admin/cards/reject/19', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer op-token',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expected_revision: 2 })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await responseJson(response), { success: true });
    assert.equal(fixture.calls.storageWrites, 0);
    assert.deepEqual(fixture.calls.audit.map(({ action, target }) => ({ action, target })), [{
        action: '驳回名片投稿',
        target: 'card_id=19;revision=3'
    }]);
});

test('approve and reject surface 用户已撤回 (410) once the user withdraws', async () => {
    const fixture = createCompatibilityFixture({
        async beginCardApproval() {
            return { status: 'withdrawn', revision: 3 };
        },
        async rejectSubmission() {
            return { status: 'withdrawn', revision: 3 };
        }
    });
    for (const pathname of ['/api/admin/cards/approve/19', '/api/admin/cards/reject/19']) {
        const response = await fixture.request(pathname, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer op-token',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ expected_revision: 2 })
        });
        assert.equal(response.status, 410);
        assert.deepEqual(await responseJson(response), {
            error: '用户已撤回',
            revision: 3
        });
    }
    assert.deepEqual(fixture.calls.audit, []);
});

test('guest namecard image replacement and resubmission routes are not exposed', async () => {
    const fixture = createCompatibilityFixture({
        async resubmitSubmission() { throw new Error('must not resubmit'); },
        async replaceSubmissionImage() { throw new Error('must not replace'); }
    });
    for (const pathname of [
        '/api/namecards/submissions/19/resubmit',
        '/api/namecards/submissions/19/images/front?expected_revision=3'
    ]) {
        const response = await fixture.request(pathname, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Namecard-Withdrawal-Token': 'a'.repeat(64)
            },
            body: JSON.stringify({ expected_revision: 3 })
        });
        assert.equal(response.status, 404);
    }
    assert.deepEqual(fixture.calls.audit, []);
    assert.equal(fixture.calls.storageWrites, 0);
});

test('legacy Information reads remain available while the retired admin write API is gone', async () => {
    const fixture = createCompatibilityFixture();
    const detail = await fixture.request('/api/information/not-valid');
    assert.equal(detail.status, 404);
    assert.deepEqual(await responseJson(detail), { error: '活动内容不存在' });

    const content = await fixture.request('/information/not-valid/content');
    assert.equal(content.status, 404);
    assert.equal(await content.text(), '活动内容不存在');

    const readsBeforeUpdate = fixture.calls.storageGet;
    const update = await fixture.request('/api/admin/information/x', {
        method: 'PUT',
        headers: {
            Authorization: 'Bearer op-token',
            'Content-Type': 'application/json'
        },
        body: '{}'
    });
    assert.equal(update.status, 410);
    assert.deepEqual(await responseJson(update), {
        error: '活动资讯后台已整合至社区帖子，请使用 /api/admin/community-posts'
    });
    assert.equal(fixture.calls.storageGet, readsBeforeUpdate);
    assert.equal(fixture.calls.storageWrites, 0);
    assert.deepEqual(fixture.calls.audit, []);
});

test('About and Producer Map validate content before stale revision reads after auth and CSRF', async () => {
    const scenarios = [
        {
            pathname: '/api/admin/about',
            error: '关于页配置格式无效'
        },
        {
            pathname: '/api/admin/producer-map',
            error: '制作人地图配置格式无效'
        }
    ] as const;

    for (const scenario of scenarios) {
        const fixture = createCompatibilityFixture();
        const body = JSON.stringify({ content: null, revision: 'stale-revision' });
        const unauthenticated = await fixture.request(scenario.pathname, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body
        });
        assert.equal(unauthenticated.status, 401, scenario.pathname);
        assert.deepEqual(await responseJson(unauthenticated), {
            success: false,
            message: '未登录'
        });

        const missingCsrf = await fixture.request(scenario.pathname, {
            method: 'PUT',
            headers: {
                Cookie: 'token=op-token; csrf_token=csrf',
                'Content-Type': 'application/json'
            },
            body
        });
        assert.equal(missingCsrf.status, 403, scenario.pathname);
        assert.deepEqual(await responseJson(missingCsrf), {
            success: false,
            message: 'CSRF token invalid'
        });

        const invalidContent = await fixture.request(scenario.pathname, {
            method: 'PUT',
            headers: {
                Cookie: 'token=op-token; csrf_token=csrf',
                'Content-Type': 'application/json',
                'X-CSRFToken': 'csrf'
            },
            body
        });
        assert.equal(invalidContent.status, 400, scenario.pathname);
        assert.deepEqual(await responseJson(invalidContent), { error: scenario.error });
        assert.equal(fixture.calls.storageGet, 0, `${scenario.pathname} revision read`);
        assert.equal(fixture.calls.storageWrites, 0, `${scenario.pathname} storage write`);
        assert.equal(fixture.calls.storyReads, 0, `${scenario.pathname} repository read`);
        assert.deepEqual(fixture.calls.audit, [], scenario.pathname);
    }
});

test('News DELETE preserves Number aliases after auth and CSRF at the stub repository boundary', async () => {
    const fixture = createCompatibilityFixture();
    const unauthenticated = await fixture.request('/api/admin/news/not-an-id', {
        method: 'DELETE'
    });
    assert.equal(unauthenticated.status, 401);
    assert.deepEqual(await responseJson(unauthenticated), {
        success: false,
        message: '未登录'
    });

    const missingCsrf = await fixture.request('/api/admin/news/not-an-id', {
        method: 'DELETE',
        headers: { Cookie: 'token=op-token; csrf_token=csrf' }
    });
    assert.equal(missingCsrf.status, 403);
    assert.deepEqual(await responseJson(missingCsrf), {
        success: false,
        message: 'CSRF token invalid'
    });
    assert.deepEqual(fixture.calls.newsFindMedia, []);
    assert.deepEqual(fixture.calls.newsDelete, []);
    assert.deepEqual(fixture.calls.audit, []);

    const headers = {
        Cookie: 'token=op-token; csrf_token=csrf',
        'X-CSRFToken': 'csrf'
    };
    for (const id of ['not-an-id', '01', '1e1']) {
        const response = await fixture.request(`/api/admin/news/${id}`, {
            method: 'DELETE',
            headers
        });
        assert.equal(response.status, 200, id);
        assert.deepEqual(await responseJson(response), { success: true });
    }
    assert.equal(Number.isNaN(fixture.calls.newsFindMedia[0]), true);
    assert.equal(Number.isNaN(fixture.calls.newsDelete[0]), true);
    assert.deepEqual(fixture.calls.newsFindMedia.slice(1), [1, 10]);
    assert.deepEqual(fixture.calls.newsDelete.slice(1), [1, 10]);
    assert.deepEqual(fixture.calls.audit.map(({ action, target }) => ({ action, target })), [
        { action: '删除新闻', target: 'ID=NaN' },
        { action: '删除新闻', target: 'ID=1' },
        { action: '删除新闻', target: 'ID=10' }
    ]);
    assert.equal(fixture.calls.storageWrites, 0);
});

test('Admin Accounts DELETE validates aliases after auth, super-admin, and CSRF checks', async () => {
    const fixture = createCompatibilityFixture();
    const unauthenticated = await fixture.request('/api/admin/accounts/not-an-id', {
        method: 'DELETE'
    });
    assert.equal(unauthenticated.status, 401);
    assert.deepEqual(await responseJson(unauthenticated), {
        success: false,
        message: '未登录'
    });
    assert.deepEqual(fixture.calls.authFind, []);

    const regularAdmin = await fixture.request('/api/admin/accounts/not-an-id', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer regular-token' }
    });
    assert.equal(regularAdmin.status, 403);
    assert.deepEqual(await responseJson(regularAdmin), {
        success: false,
        message: '仅最高管理员可执行此操作'
    });
    assert.deepEqual(fixture.calls.authFind, [98]);
    assert.deepEqual(fixture.calls.adminDelete, []);

    fixture.calls.authFind.length = 0;
    const missingCsrf = await fixture.request('/api/admin/accounts/not-an-id', {
        method: 'DELETE',
        headers: { Cookie: 'token=op-token; csrf_token=csrf' }
    });
    assert.equal(missingCsrf.status, 403);
    assert.deepEqual(await responseJson(missingCsrf), {
        success: false,
        message: 'CSRF token invalid'
    });
    assert.deepEqual(fixture.calls.authFind, [99]);
    assert.deepEqual(fixture.calls.adminDelete, []);

    const headers = {
        Cookie: 'token=op-token; csrf_token=csrf',
        'X-CSRFToken': 'csrf'
    };
    for (const invalidId of ['not-an-id', '0']) {
        fixture.calls.authFind.length = 0;
        const response = await fixture.request(`/api/admin/accounts/${invalidId}`, {
            method: 'DELETE',
            headers
        });
        assert.equal(response.status, 400, invalidId);
        assert.deepEqual(await responseJson(response), {
            success: false,
            message: '管理员账号 ID 无效'
        });
        assert.deepEqual(fixture.calls.authFind, [99]);
        assert.deepEqual(fixture.calls.adminDelete, []);
        assert.deepEqual(fixture.calls.audit, []);
    }

    for (const [alias, id] of [['01', 1], ['1e1', 10]] as const) {
        fixture.calls.authFind.length = 0;
        fixture.calls.adminDelete.length = 0;
        fixture.calls.audit.length = 0;
        const response = await fixture.request(`/api/admin/accounts/${alias}`, {
            method: 'DELETE',
            headers
        });
        assert.equal(response.status, 200, alias);
        assert.deepEqual(await responseJson(response), { success: true });
        assert.deepEqual(fixture.calls.authFind, [99, id]);
        assert.deepEqual(fixture.calls.adminDelete, [id]);
        assert.deepEqual(fixture.calls.audit.map(({ action, target }) => ({ action, target })), [{
            action: '删除管理员',
            target: `admin-${id}`
        }]);
    }
});

test('namecard public and admin pagination preserve parseInt aliases and fallbacks', async () => {
    const fixture = createCompatibilityFixture();
    const publicCases = [
        ['page=abc&size=abc', [25, 0]],
        ['page=0&size=0', [25, 0]],
        ['page=1foo&size=1foo', [1, 0]],
        ['page=101&size=101', [101, 10_100]]
    ] as const;
    for (const [query, repositoryArgs] of publicCases) {
        const response = await fixture.request(`/api/cards?${query}`);
        assert.equal(response.status, 200, query);
        const cardsBody = await responseJson(response);
        namecardPageSchema.parse(cardsBody);
        assert.deepEqual(cardsBody, { list: [], total: 0, totalPage: 0 });
        assert.deepEqual(fixture.calls.namecardListApproved.at(-1), repositoryArgs, query);
    }

    const unauthenticated = await fixture.request('/api/admin/cards?page=101');
    assert.equal(unauthenticated.status, 401);
    assert.deepEqual(fixture.calls.namecardListAdmin, []);

    const adminCases = [
        ['page=abc&size=101', [10, 0]],
        ['page=0&size=0', [10, 0]],
        ['page=1foo&size=1foo', [10, 0]],
        ['page=101&size=abc', [10, 1_000]]
    ] as const;
    for (const [query, repositoryArgs] of adminCases) {
        const response = await fixture.request(`/api/admin/cards?${query}`, {
            headers: { Authorization: 'Bearer op-token' }
        });
        assert.equal(response.status, 200, query);
        assert.deepEqual(await responseJson(response), {
            success: true,
            data: [],
            pageInfo: {
                page: repositoryArgs[1] / 10 + 1,
                pageSize: 10,
                total: 0,
                totalPages: 0,
                hasNextPage: false
            }
        });
        assert.deepEqual(fixture.calls.namecardListAdmin.at(-1), repositoryArgs, query);
    }
});

test('invalid namecard IDs preserve public/admin responses after auth and CSRF checks', async () => {
    const fixture = createCompatibilityFixture();
    const publicCard = await fixture.request('/api/card/not-a-number');
    assert.equal(publicCard.status, 200);
    assert.deepEqual(await responseJson(publicCard), {});
    assert.deepEqual(fixture.calls.namecardFindApproved, []);

    fixture.calls.namecardFindMedia.length = 0;
    fixture.calls.namecardApprove.length = 0;
    fixture.calls.namecardDelete.length = 0;
    fixture.calls.audit.length = 0;
    const unauthenticated = await fixture.request('/api/admin/cards/approve/not-a-number', {
        method: 'POST'
    });
    assert.equal(unauthenticated.status, 401);
    assert.deepEqual(await responseJson(unauthenticated), { success: false, message: '未登录' });

    const missingCsrf = await fixture.request('/api/admin/cards/not-a-number', {
        method: 'DELETE',
        headers: { Cookie: 'token=op-token; csrf_token=csrf' }
    });
    assert.equal(missingCsrf.status, 403);
    assert.deepEqual(await responseJson(missingCsrf), {
        success: false,
        message: 'CSRF token invalid'
    });
    assert.deepEqual(fixture.calls.namecardFindMedia, []);
    assert.deepEqual(fixture.calls.namecardApprove, []);
    assert.deepEqual(fixture.calls.namecardDelete, []);
    assert.deepEqual(fixture.calls.audit, []);

    const approved = await fixture.request('/api/admin/cards/approve/not-a-number', {
        method: 'POST',
        headers: {
            Cookie: 'token=op-token; csrf_token=csrf',
            'X-CSRFToken': 'csrf',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expected_revision: 0 })
    });
    assert.equal(approved.status, 404);
    assert.deepEqual(await responseJson(approved), {
        error: 'Namecard not found'
    });

    const deleted = await fixture.request('/api/admin/cards/not-a-number?expected_revision=0', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer op-token' }
    });
    assert.equal(deleted.status, 404);
    assert.deepEqual(await responseJson(deleted), {
        error: 'Namecard not found'
    });
    assert.deepEqual(fixture.calls.namecardFindMedia, []);
    assert.deepEqual(fixture.calls.namecardApprove, [0]);
    assert.deepEqual(fixture.calls.namecardDelete, [0]);
    assert.deepEqual(fixture.calls.audit, []);
    assert.equal(fixture.calls.storageWrites, 0);
});

test('Wiki admin authentication precedes shared numeric param validation', async () => {
    const fixture = createCompatibilityFixture();
    const pathname = '/api/admin/wiki/agencies/not-an-id/story-cover-assets';
    const unauthenticated = await fixture.request(pathname);
    assert.equal(unauthenticated.status, 401);
    assert.deepEqual(await responseJson(unauthenticated), {
        status: 'error',
        msg: '未登录，请先登录'
    });
    assert.equal(fixture.calls.storyReads, 0);

    for (const id of ['not-an-id', '0']) {
        const response = await fixture.request(
            `/api/admin/wiki/agencies/${id}/story-cover-assets`,
            { headers: { Cookie: 'token=op-token' } }
        );
        assert.equal(response.status, 400, id);
        assert.deepEqual(await responseJson(response), {
            status: 'error',
            msg: '企划 ID 无效'
        });
        assert.equal(fixture.calls.storyReads, 0, id);
    }
});

test('Wiki JSON field validation rejects before the route handler reads its repository', async () => {
    const fixture = createCompatibilityFixture();
    const response = await fixture.request('/api/admin/wiki/agencies', {
        method: 'POST',
        headers: {
            Cookie: 'token=op-token',
            'Content-Type': 'application/json',
            'X-CSRFToken': 'csrf'
        },
        body: '{}'
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await responseJson(response), {
        status: 'error',
        msg: '企划名称无效'
    });
    assert.equal(fixture.calls.storyReads, 0);
    assert.equal(fixture.calls.storageWrites, 0);
    assert.deepEqual(fixture.calls.audit, []);
});
