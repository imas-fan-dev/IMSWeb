import assert from 'node:assert/strict';
import test from 'node:test';
import { createHonoApp } from '@/app';
import type { ObjectStorage } from '@/ports/object-storage';
import type {
    AdminAccountRepository,
    AuditLogInput,
    AuditRepository,
    AuthRepository,
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

function createCompatibilityFixture() {
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
        async approveCard(id) { calls.namecardApprove.push(id); },
        async findCardMedia(id) {
            calls.namecardFindMedia.push(id);
            return null;
        },
        async deleteCard(id) { calls.namecardDelete.push(id); },
        async findCardByMediaUrl() { return null; }
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
    const auth: AuthRepository = {
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
            return true;
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
        async exists() { return false; },
        async copy() { calls.storageWrites += 1; },
        async move() { calls.storageWrites += 1; },
        async list() { return []; },
        async deletePrefix() { calls.storageWrites += 1; }
    };
    const services: RuntimeServices = {
        adminAccounts,
        audit,
        auth,
        events,
        namecards,
        news,
        story,
        storage,
        tokens: {
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
        }
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

test('invalid information IDs retain not-found responses and JSON body validation precedence', async () => {
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
    assert.equal(update.status, 400);
    assert.deepEqual(await responseJson(update), { error: '请填写 1-200 字的标题' });
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
        assert.deepEqual(await responseJson(response), { list: [], total: 0, totalPage: 0 });
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
        assert.deepEqual(await responseJson(response), { success: true, data: [] });
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
            'X-CSRFToken': 'csrf'
        }
    });
    assert.equal(approved.status, 200);
    assert.deepEqual(await responseJson(approved), { success: false });

    const deleted = await fixture.request('/api/admin/cards/not-a-number', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer op-token' }
    });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await responseJson(deleted), { success: true });
    assert.deepEqual(fixture.calls.namecardFindMedia, [0, 0]);
    assert.deepEqual(fixture.calls.namecardApprove, []);
    assert.deepEqual(fixture.calls.namecardDelete, [0]);
    assert.deepEqual(fixture.calls.audit.map(({ action, target }) => ({ action, target })), [{
        action: '删除图片',
        target: 'card_id=0'
    }]);
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
