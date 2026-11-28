import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
    adminPrivacyPolicySnapshotSchema,
    adminPrivacyPolicyUpdateSchema,
    privacyPolicyErrorResponseSchema,
    privacyPolicyPublicResponseSchema
} from '@imsweb/contracts/privacy-policy';
import { createHonoApp } from '@/app';
import { DEFAULT_PRIVACY_POLICY_BODY, DEFAULT_PRIVACY_POLICY_TITLE } from '@/domains/content/privacy-policy/default-content';
import type {
    ListedObject,
    ObjectStorage,
    PutObjectOptions,
    StoredObject
} from '@/ports/object-storage';
import type { AuditLogInput } from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';
import { assertContractJson } from '../contracts/contract-json';

class MemoryStorage implements ObjectStorage {
    private readonly objects = new Map<string, StoredObject>();
    private revision = 0;

    async get(key: string): Promise<StoredObject | null> {
        const object = this.objects.get(key);
        return object ? { ...object, body: Uint8Array.from(object.body) } : null;
    }

    async put(
        key: string,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject> {
        this.revision += 1;
        const object = {
            body: Uint8Array.from(body),
            size: body.byteLength,
            contentType: options.contentType || 'application/octet-stream',
            etag: `"revision-${this.revision}"`
        };
        this.objects.set(key, object);
        return { ...object, body: Uint8Array.from(object.body) };
    }

    async putIfUnchanged(
        key: string,
        expectedEtag: string | null,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject | null> {
        if ((this.objects.get(key)?.etag ?? null) !== expectedEtag) return null;
        return this.put(key, body, options);
    }

    async delete(key: string): Promise<void> { this.objects.delete(key); }
    async exists(key: string): Promise<boolean> { return this.objects.has(key); }
    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        const source = await this.get(sourceKey);
        if (!source) throw new Error('source missing');
        await this.put(destinationKey, source.body, { contentType: source.contentType });
    }
    async move(sourceKey: string, destinationKey: string): Promise<void> {
        await this.copy(sourceKey, destinationKey);
        await this.delete(sourceKey);
    }
    async list(prefix: string): Promise<ListedObject[]> {
        return [...this.objects.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, value]) => ({ key, size: value.size, etag: value.etag }));
    }
    async deletePrefix(prefix: string): Promise<void> {
        for (const key of this.objects.keys()) {
            if (key.startsWith(prefix)) this.objects.delete(key);
        }
    }
}

function fixture() {
    const storage = new MemoryStorage();
    const audit: AuditLogInput[] = [];
    const services: RuntimeServices = {
        storage,
        audit: {
            async insertAuditLog(input) { audit.push(input); },
            async listRecentAuditLogs() { return []; }
        },
        backofficeTokens: {
            async sign() { return 'privacy-token'; },
            async verify() {
                return {
                    id: 1,
                    username: 'privacy-editor',
                    producername: 'Privacy Editor',
                    dept: 'op',
                    csrfSecret: 'privacy-csrf'
                };
            }
        }
    };
    const app = createHonoApp(() => services);
    const request = (path: string, init?: RequestInit) =>
        app.request(`http://ims.test${path}`, init);
    return { request, audit };
}

const authHeaders = {
    Authorization: 'Bearer privacy-token',
    'Content-Type': 'application/json'
};

test.describe('privacy policy', () => {
    test('publishes the built-in policy until an admin saves a change', async () => {
        const { request } = fixture();
        const response = await request('/api/privacy-policy');
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-cache');
        const body = await assertContractJson(
            response,
            200,
            privacyPolicyPublicResponseSchema
        );
        assert.equal(body.policy?.enabled, true);
        assert.equal(body.policy?.title, DEFAULT_PRIVACY_POLICY_TITLE);
        assert.equal(body.policy?.body, DEFAULT_PRIVACY_POLICY_BODY);
        assert.equal(body.policy?.updatedAt, null);
    });

    test('admin reads require authentication and start from the built-in draft', async () => {
        const { request } = fixture();
        assert.equal((await request('/api/admin/privacy-policy')).status, 401);

        const response = await request('/api/admin/privacy-policy', {
            headers: authHeaders
        });
        const snapshot = await assertContractJson(
            response,
            200,
            adminPrivacyPolicySnapshotSchema
        );
        assert.deepEqual(snapshot, {
            content: {
                enabled: true,
                title: DEFAULT_PRIVACY_POLICY_TITLE,
                body: DEFAULT_PRIVACY_POLICY_BODY,
                updatedAt: null
            },
            revision: null
        });
    });

    test('saved edits are audited, revision guarded, and publicly readable', async () => {
        const { request, audit } = fixture();
        const edited = {
            enabled: true,
            title: '测试隐私条款',
            body: '第一段\n\n第二段'
        };
        const savedResponse = await request('/api/admin/privacy-policy', {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({ content: edited, revision: null })
        });
        const saved = await assertContractJson(
            savedResponse,
            200,
            adminPrivacyPolicyUpdateSchema
        );
        assert.match(saved.revision, /revision-1/);
        assert.equal(saved.content.title, edited.title);
        assert.equal(saved.content.body, edited.body);
        assert.ok(saved.content.updatedAt);
        assert.equal(audit.at(-1)?.action, '更新隐私条款');
        assert.equal(audit.at(-1)?.target, edited.title);

        const publicResponse = await request('/api/privacy-policy');
        const publicBody = await assertContractJson(
            publicResponse,
            200,
            privacyPolicyPublicResponseSchema
        );
        assert.equal(publicBody.policy?.title, edited.title);
        assert.equal(publicBody.policy?.body, edited.body);

        const staleResponse = await request('/api/admin/privacy-policy', {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({ content: edited, revision: null })
        });
        assert.equal(staleResponse.status, 409);
        const stale = await assertContractJson(
            staleResponse,
            409,
            privacyPolicyErrorResponseSchema
        );
        assert.match(stale.error, /刷新后重试/);
    });

    test('disabling the policy removes the login entry and rejects invalid drafts', async () => {
        const { request } = fixture();
        const savedResponse = await request('/api/admin/privacy-policy', {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({
                content: {
                    enabled: false,
                    title: '隐私条款',
                    body: '已关闭的条款。'
                },
                revision: null
            })
        });
        const saved = await assertContractJson(
            savedResponse,
            200,
            adminPrivacyPolicyUpdateSchema
        );

        const publicResponse = await request('/api/privacy-policy');
        const publicBody = await assertContractJson(
            publicResponse,
            200,
            privacyPolicyPublicResponseSchema
        );
        assert.equal(publicBody.policy, null);

        const blankBody = await request('/api/admin/privacy-policy', {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({
                content: { enabled: true, title: '隐私条款', body: '   ' },
                revision: saved.revision
            })
        });
        assert.equal(blankBody.status, 400);

        const unknownKey = await request('/api/admin/privacy-policy', {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({
                content: { enabled: true, title: '隐私条款', body: '正文' },
                revision: saved.revision,
                extra: true
            })
        });
        assert.equal(unknownKey.status, 400);
    });
});
