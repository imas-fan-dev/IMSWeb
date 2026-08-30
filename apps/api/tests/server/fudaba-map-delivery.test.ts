import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHonoApp } from '@/app';
import type {
    ListedObject,
    ObjectStorage,
    PutObjectOptions,
    StoredObject
} from '@/ports/object-storage';
import type { AuditLogInput } from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';
import { FUDABA_MAP_DELIVERY_OBJECT_KEY } from '@/utils/storage/business-object-keys';

const TOKEN = 'map-delivery-admin-token';

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
        const object: StoredObject = {
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

    async delete(key: string): Promise<void> {
        this.objects.delete(key);
    }

    async exists(key: string): Promise<boolean> {
        return this.objects.has(key);
    }

    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        const source = await this.get(sourceKey);
        if (!source) throw new Error('source missing');
        await this.put(destinationKey, source.body, {
            contentType: source.contentType
        });
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
        config: {
            fudabaPublicReadEnabled: true,
            fudabaMapEnabled: true,
            fudabaMapStyleUrl: '/maps/exchange-style.json',
            fudabaMapPrefixes: [
                '/maps/',
                '/maps/releases/v2/',
                'https://objects.example.test/exchange/releases/v3/'
            ]
        },
        backofficeTokens: {
            async sign() {
                return TOKEN;
            },
            async verify(token: string) {
                if (token !== TOKEN) throw new Error('wrong token realm');
                return {
                    iss: 'imsweb' as const,
                    aud: 'ims-backoffice' as const,
                    kind: 'backoffice' as const,
                    id: 7,
                    username: 'map-operator',
                    producername: 'Map Operator',
                    dept: 'op',
                    csrfSecret: 'map-delivery-csrf'
                };
            }
        },
        backofficeAuth: {
            async findUserById(id: number) {
                return id === 7
                    ? {
                        id: 7,
                        username: 'map-operator',
                        password: 'unused-password-hash',
                        producername: 'Map Operator',
                        dept: 'op',
                        admin_role: 'super_admin' as const
                    }
                    : null;
            }
        } as NonNullable<RuntimeServices['backofficeAuth']>,
        audit: {
            async insertAuditLog(input) {
                audit.push(input);
            },
            async listRecentAuditLogs() {
                return [];
            }
        }
    };
    const app = createHonoApp(() => services);
    const request = (pathname: string, init?: RequestInit) =>
        app.request(`http://ims.test${pathname}`, init);
    const authHeaders = (headers: Record<string, string> = {}) => ({
        authorization: `Bearer ${TOKEN}`,
        ...headers
    });
    return { storage, audit, request, authHeaders };
}

test('map delivery falls back cold, validates writes, uses CAS, and rejects poisoned storage', async () => {
    const { storage, audit, request, authHeaders } = fixture();

    const coldConfig = await request('/api/community/exchange/map/config');
    assert.equal(coldConfig.status, 200);
    assert.deepEqual(await coldConfig.json(), {
        styleUrl: '/maps/exchange-style.json'
    });

    const unauthorized = await request(
        '/api/admin/community/exchange/map-delivery'
    );
    assert.equal(unauthorized.status, 401);

    const coldAdmin = await request(
        '/api/admin/community/exchange/map-delivery',
        { headers: authHeaders() }
    );
    assert.equal(coldAdmin.status, 200);
    assert.deepEqual(await coldAdmin.json(), {
        selectedPrefix: null,
        availablePrefixes: [
            '/maps/',
            '/maps/releases/v2/',
            'https://objects.example.test/exchange/releases/v3/'
        ],
        effectivePrefix: '/maps/',
        revision: null
    });

    const malformed = await request(
        '/api/admin/community/exchange/map-delivery',
        {
            method: 'PUT',
            headers: authHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify({ prefix: 'maps/', revision: null })
        }
    );
    assert.equal(malformed.status, 422);

    const outsideAllowlist = await request(
        '/api/admin/community/exchange/map-delivery',
        {
            method: 'PUT',
            headers: authHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify({
                prefix: 'https://attacker.example/maps/',
                revision: null
            })
        }
    );
    assert.equal(outsideAllowlist.status, 422);

    const updated = await request(
        '/api/admin/community/exchange/map-delivery',
        {
            method: 'PUT',
            headers: authHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify({
                prefix: 'https://objects.example.test/exchange/releases/v3/',
                revision: null
            })
        }
    );
    assert.equal(updated.status, 200);
    const updatePayload = (await updated.json()) as {
        delivery: { revision: string };
    };
    assert.equal(updatePayload.delivery.revision, '"revision-1"');
    assert.equal(audit.length, 1);

    const selectedConfig = await request('/api/community/exchange/map/config');
    assert.equal(selectedConfig.status, 200);
    assert.deepEqual(await selectedConfig.json(), {
        styleUrl:
            'https://objects.example.test/exchange/releases/v3/' +
            'exchange-style.json'
    });

    const stale = await request('/api/admin/community/exchange/map-delivery', {
        method: 'PUT',
        headers: authHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ prefix: '/maps/releases/v2/', revision: null })
    });
    assert.equal(stale.status, 409);

    await storage.put(
        FUDABA_MAP_DELIVERY_OBJECT_KEY,
        new TextEncoder().encode(
            JSON.stringify({
                prefix: 'https://attacker.example/maps/',
                updatedAt: new Date().toISOString()
            })
        ),
        { contentType: 'application/json; charset=utf-8' }
    );

    const poisonedConfig = await request('/api/community/exchange/map/config');
    assert.equal(poisonedConfig.status, 200);
    assert.deepEqual(await poisonedConfig.json(), {
        styleUrl: '/maps/exchange-style.json'
    });

    const poisonedAdmin = await request(
        '/api/admin/community/exchange/map-delivery',
        { headers: authHeaders() }
    );
    assert.equal(poisonedAdmin.status, 200);
    const poisonedPayload = (await poisonedAdmin.json()) as {
        selectedPrefix: string | null;
        effectivePrefix: string;
        revision: string | null;
    };
    assert.equal(poisonedPayload.selectedPrefix, null);
    assert.equal(poisonedPayload.effectivePrefix, '/maps/');
    assert.equal(poisonedPayload.revision, '"revision-2"');
});
