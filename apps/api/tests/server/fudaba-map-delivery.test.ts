import assert from 'node:assert/strict';
import { readContractJson as contractJson } from '../contracts/contract-json';
import { bearerTokenHeaders } from '../fixtures/auth-request';
import { test } from 'node:test';
import {
    fudabaMapDeliveryErrorSchema,
    fudabaMapDeliveryMutationSchema,
    fudabaMapDeliverySnapshotSchema,
} from '@imsweb/contracts/fudaba/map-delivery';
import { createHonoApp } from '@/app';
import type {
    ListedObject,
    ObjectStorage,
    PutObjectOptions,
    StoredObject,
} from '@/ports/object-storage';
import type { AuditLogInput } from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';
import { FUDABA_MAP_DELIVERY_OBJECT_KEY } from '@/utils/storage/business-object-keys';

const TOKEN = 'map-delivery-admin-token';
const OFFICIAL_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const SELF_HOSTED_STYLE = '/maps/exchange-style.json';
const OBJECT_STORAGE_STYLE =
    'https://objects.example.test/exchange/releases/v3/exchange-style.json';
const DYNAMIC_STYLE =
    'https://dynamic.example.test/openmap/v4/exchange-style.json';
const EDITED_DYNAMIC_STYLE =
    'https://dynamic.example.test/openmap/v5/exchange-style.json';

class MemoryStorage implements ObjectStorage {
    private readonly objects = new Map<string, StoredObject>();
    private revision = 0;

    async get(key: string): Promise<StoredObject | null> {
        const object = this.objects.get(key);
        return object
            ? { ...object, body: Uint8Array.from(object.body) }
            : null;
    }

    async put(
        key: string,
        body: Uint8Array,
        options: PutObjectOptions = {},
    ): Promise<StoredObject> {
        this.revision += 1;
        const object: StoredObject = {
            body: Uint8Array.from(body),
            size: body.byteLength,
            contentType: options.contentType || 'application/octet-stream',
            etag: `"revision-${this.revision}"`,
        };
        this.objects.set(key, object);
        return { ...object, body: Uint8Array.from(object.body) };
    }

    async putIfUnchanged(
        key: string,
        expectedEtag: string | null,
        body: Uint8Array,
        options: PutObjectOptions = {},
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
            contentType: source.contentType,
        });
    }

    async move(sourceKey: string, destinationKey: string): Promise<void> {
        await this.copy(sourceKey, destinationKey);
        await this.delete(sourceKey);
    }

    async list(prefix: string): Promise<ListedObject[]> {
        return [...this.objects.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, value]) => ({
                key,
                size: value.size,
                etag: value.etag,
            }));
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
            fudabaMapStyleUrl: OFFICIAL_STYLE,
            fudabaMapStyleUrls: [
                OFFICIAL_STYLE,
                SELF_HOSTED_STYLE,
                OBJECT_STORAGE_STYLE,
            ],
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
                    csrfSecret: 'map-delivery-csrf',
                };
            },
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
                          admin_role: 'super_admin' as const,
                      }
                    : null;
            },
        } as NonNullable<RuntimeServices['backofficeAuth']>,
        audit: {
            async insertAuditLog(input) {
                audit.push(input);
            },
            async listRecentAuditLogs() {
                return [];
            },
        },
    };
    const app = createHonoApp(() => services);
    const request = (pathname: string, init?: RequestInit) =>
        app.request(`http://ims.test${pathname}`, init);
    const authHeaders = (headers: Record<string, string> = {}) =>
        bearerTokenHeaders(TOKEN, headers);
    const mutation = (
        pathname: string,
        method: 'POST' | 'PUT' | 'DELETE',
        body: unknown,
    ) =>
        request(pathname, {
            method,
            headers: authHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify(body),
        });
    return { storage, audit, request, authHeaders, mutation };
}

interface SourcePayload {
    id: string;
    name: string;
    styleUrl: string;
}

interface DeliveryPayload {
    success: true;
    delivery: {
        sources: SourcePayload[];
        activeSourceId: string;
        effectiveStyleUrl: string;
        revision: string | null;
    };
}

test('map delivery validates raw JSON responses without projecting emitted fields', async () => {
    const { request, authHeaders, mutation } = fixture();

    const unauthorized = await request('/api/admin/community/exchange/map-delivery');
    assert.equal(unauthorized.status, 401);
    await contractJson(unauthorized, fudabaMapDeliveryErrorSchema);

    const read = await request('/api/admin/community/exchange/map-delivery', {
        headers: authHeaders(),
    });
    assert.equal(read.status, 200);
    await contractJson(read, fudabaMapDeliverySnapshotSchema);

    const created = await mutation(
        '/api/admin/community/exchange/map-delivery/sources',
        'POST',
        { name: 'Boundary source', styleUrl: DYNAMIC_STYLE, revision: null },
    );
    assert.equal(created.status, 201);
    await contractJson(created, fudabaMapDeliveryMutationSchema);

    const invalidCases: Array<[string, RequestInit, string]> = [
        [
            '/api/admin/community/exchange/map-delivery/sources',
            {
                method: 'POST',
                headers: authHeaders({ 'content-type': 'application/json' }),
                body: '{',
            },
            '请求正文必须为 JSON',
        ],
        [
            '/api/admin/community/exchange/map-delivery/sources',
            {
                method: 'POST',
                headers: authHeaders({ 'content-type': 'application/json' }),
                body: '[]',
            },
            '请求正文必须为 JSON 对象',
        ],
        [
            '/api/admin/community/exchange/map-delivery/sources',
            {
                method: 'POST',
                headers: authHeaders({ 'content-type': 'application/json' }),
                body: JSON.stringify({
                    name: 'Boundary source',
                    styleUrl: DYNAMIC_STYLE,
                    revision: null,
                    unexpected: true,
                }),
            },
            '地图源请求格式无效',
        ],
        [
            '/api/admin/community/exchange/map-delivery/sources',
            {
                method: 'POST',
                headers: authHeaders({ 'content-type': 'application/json' }),
                body: JSON.stringify({
                    name: 'Boundary\u0001source',
                    styleUrl: DYNAMIC_STYLE,
                    revision: null,
                }),
            },
            '地图源名称格式无效',
        ],
        [
            '/api/admin/community/exchange/map-delivery/sources/invalid_id',
            {
                method: 'PUT',
                headers: authHeaders({ 'content-type': 'application/json' }),
                body: JSON.stringify({
                    name: 'Boundary source',
                    styleUrl: DYNAMIC_STYLE,
                    revision: null,
                }),
            },
            '地图源 ID 格式无效',
        ],
    ];
    for (const [path, init, message] of invalidCases) {
        const response = await request(path, init);
        assert.equal(response.status, 422, path);
        assert.deepEqual(await contractJson(response, fudabaMapDeliveryErrorSchema), {
            error: message,
        });
    }
});

test('map delivery manages a dynamic source collection with CAS and legacy fallback', async () => {
    const { storage, audit, request, authHeaders, mutation } = fixture();

    const coldConfig = await request('/api/community/exchange/map/config');
    assert.equal(coldConfig.status, 200);
    assert.deepEqual(await coldConfig.json(), { styleUrl: OFFICIAL_STYLE });

    const unauthorized = await request(
        '/api/admin/community/exchange/map-delivery',
    );
    assert.equal(unauthorized.status, 401);

    const coldAdmin = await request(
        '/api/admin/community/exchange/map-delivery',
        { headers: authHeaders() },
    );
    assert.equal(coldAdmin.status, 200);
    const coldSnapshot =
        (await coldAdmin.json()) as DeliveryPayload['delivery'];
    assert.equal(coldSnapshot.sources.length, 3);
    assert.equal(coldSnapshot.sources[0]?.name, 'OpenFreeMap Positron');
    assert.equal(coldSnapshot.activeSourceId, coldSnapshot.sources[0]?.id);
    assert.equal(coldSnapshot.effectiveStyleUrl, OFFICIAL_STYLE);
    assert.equal(coldSnapshot.revision, null);

    const malformed = await mutation(
        '/api/admin/community/exchange/map-delivery/sources',
        'POST',
        { name: 'Broken', styleUrl: 'maps/style.json', revision: null },
    );
    assert.equal(malformed.status, 422);

    const created = await mutation(
        '/api/admin/community/exchange/map-delivery/sources',
        'POST',
        { name: 'Dynamic edge', styleUrl: DYNAMIC_STYLE, revision: null },
    );
    assert.equal(created.status, 201);
    const createdPayload = (await created.json()) as DeliveryPayload;
    const dynamicSource = createdPayload.delivery.sources.find(
        (source) => source.styleUrl === DYNAMIC_STYLE,
    );
    assert.ok(dynamicSource);
    assert.equal(createdPayload.delivery.revision, '"revision-1"');

    const storedObject = await storage.get(FUDABA_MAP_DELIVERY_OBJECT_KEY);
    assert.ok(storedObject);
    const stored = JSON.parse(
        new TextDecoder().decode(storedObject.body),
    ) as Record<string, unknown>;
    assert.equal(stored.version, 2);
    assert.ok(Array.isArray(stored.sources));

    const duplicate = await mutation(
        '/api/admin/community/exchange/map-delivery/sources',
        'POST',
        {
            name: 'Dynamic edge',
            styleUrl: 'https://other.example.test/style.json',
            revision: createdPayload.delivery.revision,
        },
    );
    assert.equal(duplicate.status, 409);

    const edited = await mutation(
        `/api/admin/community/exchange/map-delivery/sources/${dynamicSource.id}`,
        'PUT',
        {
            name: 'Dynamic edge v5',
            styleUrl: EDITED_DYNAMIC_STYLE,
            revision: createdPayload.delivery.revision,
        },
    );
    assert.equal(edited.status, 200);
    const editedPayload = (await edited.json()) as DeliveryPayload;
    assert.equal(editedPayload.delivery.revision, '"revision-2"');
    assert.ok(
        editedPayload.delivery.sources.some(
            (source) =>
                source.id === dynamicSource.id &&
                source.name === 'Dynamic edge v5' &&
                source.styleUrl === EDITED_DYNAMIC_STYLE,
        ),
    );

    const activated = await mutation(
        '/api/admin/community/exchange/map-delivery/active',
        'PUT',
        {
            sourceId: dynamicSource.id,
            revision: editedPayload.delivery.revision,
        },
    );
    assert.equal(activated.status, 200);
    const activatedPayload = (await activated.json()) as DeliveryPayload;
    assert.equal(activatedPayload.delivery.activeSourceId, dynamicSource.id);
    assert.equal(
        activatedPayload.delivery.effectiveStyleUrl,
        EDITED_DYNAMIC_STYLE,
    );
    assert.equal(activatedPayload.delivery.revision, '"revision-3"');

    const selectedConfig = await request('/api/community/exchange/map/config');
    assert.equal(selectedConfig.status, 200);
    assert.deepEqual(await selectedConfig.json(), {
        styleUrl: EDITED_DYNAMIC_STYLE,
    });

    const deleteActive = await mutation(
        `/api/admin/community/exchange/map-delivery/sources/${dynamicSource.id}`,
        'DELETE',
        { revision: activatedPayload.delivery.revision },
    );
    assert.equal(deleteActive.status, 409);

    const inactiveSource = activatedPayload.delivery.sources.find(
        (source) => source.styleUrl === SELF_HOSTED_STYLE,
    );
    assert.ok(inactiveSource);
    const deleted = await mutation(
        `/api/admin/community/exchange/map-delivery/sources/${inactiveSource.id}`,
        'DELETE',
        { revision: activatedPayload.delivery.revision },
    );
    assert.equal(deleted.status, 200);
    const deletedPayload = (await deleted.json()) as DeliveryPayload;
    assert.equal(deletedPayload.delivery.revision, '"revision-4"');
    assert.ok(
        !deletedPayload.delivery.sources.some(
            (source) => source.id === inactiveSource.id,
        ),
    );

    const stale = await mutation(
        '/api/admin/community/exchange/map-delivery/active',
        'PUT',
        {
            sourceId: coldSnapshot.activeSourceId,
            revision: '"revision-2"',
        },
    );
    assert.equal(stale.status, 409);
    assert.deepEqual(
        audit.map((entry) => entry.action),
        [
            '新增交换地图源',
            '编辑交换地图源',
            '激活交换地图源',
            '删除交换地图源',
        ],
    );

    await storage.put(
        FUDABA_MAP_DELIVERY_OBJECT_KEY,
        new TextEncoder().encode(
            JSON.stringify({
                styleUrl: OBJECT_STORAGE_STYLE,
                updatedAt: new Date().toISOString(),
            }),
        ),
        { contentType: 'application/json; charset=utf-8' },
    );
    const legacyAdmin = await request(
        '/api/admin/community/exchange/map-delivery',
        { headers: authHeaders() },
    );
    const legacySnapshot =
        (await legacyAdmin.json()) as DeliveryPayload['delivery'];
    assert.equal(legacySnapshot.effectiveStyleUrl, OBJECT_STORAGE_STYLE);
    assert.equal(
        legacySnapshot.sources.find(
            (source) => source.id === legacySnapshot.activeSourceId,
        )?.styleUrl,
        OBJECT_STORAGE_STYLE,
    );

    await storage.put(
        FUDABA_MAP_DELIVERY_OBJECT_KEY,
        new TextEncoder().encode(
            JSON.stringify({
                version: 2,
                sources: [
                    {
                        id: 'poisoned',
                        name: 'Poisoned',
                        styleUrl:
                            'https://user:secret@attacker.example/style.json',
                    },
                ],
                activeSourceId: 'poisoned',
            }),
        ),
        { contentType: 'application/json; charset=utf-8' },
    );

    const poisonedConfig = await request('/api/community/exchange/map/config');
    assert.equal(poisonedConfig.status, 200);
    assert.deepEqual(await poisonedConfig.json(), { styleUrl: OFFICIAL_STYLE });

    const poisonedAdmin = await request(
        '/api/admin/community/exchange/map-delivery',
        { headers: authHeaders() },
    );
    const poisonedSnapshot =
        (await poisonedAdmin.json()) as DeliveryPayload['delivery'];
    assert.equal(poisonedSnapshot.effectiveStyleUrl, OFFICIAL_STYLE);
    assert.equal(poisonedSnapshot.revision, '"revision-6"');
});
