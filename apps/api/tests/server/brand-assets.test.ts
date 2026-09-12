import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHonoApp } from '@/app';
import { BRAND_ASSET_DEFINITIONS } from '@/domains/content/brand-assets/data';
import type {
    ListedObject,
    ObjectReadTarget,
    ObjectStorage,
    PutObjectOptions,
    StoredObject
} from '@/ports/object-storage';

class BrandAssetStorage implements ObjectStorage {
    readonly requestedKeys: string[] = [];
    readonly readKeys: string[] = [];
    private readonly fontBody = Uint8Array.from([0, 1, 0, 0, 73, 114, 105, 115]);

    async createReadUrl(key: string): Promise<ObjectReadTarget> {
        this.requestedKeys.push(key);
        return {
            url: `https://assets.example.test/${encodeURIComponent(key)}`,
            visibility: 'public'
        };
    }

    async get(key: string): Promise<StoredObject | null> {
        this.readKeys.push(key);
        if (key !== 'brand/fonts/iris-idol.ttf') return null;
        return {
            body: this.fontBody,
            size: this.fontBody.byteLength,
            contentType: 'font/ttf',
            etag: 'font-fixture'
        };
    }
    async put(
        _key: string,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject> {
        return {
            body,
            size: body.byteLength,
            contentType: options.contentType || 'application/octet-stream',
            etag: 'unused'
        };
    }
    async delete(): Promise<void> {}
    async exists(): Promise<boolean> { return false; }
    async copy(): Promise<void> {}
    async move(): Promise<void> {}
    async list(): Promise<ListedObject[]> { return []; }
    async deletePrefix(): Promise<void> {}
}

test('legacy series images and font resolve through canonical object storage', async () => {
    const storage = new BrandAssetStorage();
    const app = createHonoApp(() => ({ storage }));

    for (const asset of BRAND_ASSET_DEFINITIONS) {
        const response = await app.request(`http://ims.test${asset.publicPath}`, {
            method: asset.kind === 'font' ? 'HEAD' : 'GET'
        });
        assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
        if (asset.kind === 'font') {
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('content-type'), 'font/ttf');
            assert.equal(response.headers.get('content-length'), '8');
            assert.equal(response.headers.get('location'), null);
            assert.equal((await response.arrayBuffer()).byteLength, 0);
        } else {
            assert.equal(response.status, 307);
            assert.equal(
                response.headers.get('location'),
                `https://assets.example.test/${encodeURIComponent(asset.objectKey)}`
            );
        }
    }

    assert.deepEqual(
        storage.requestedKeys,
        BRAND_ASSET_DEFINITIONS
            .filter((asset) => asset.kind === 'image')
            .map((asset) => asset.objectKey)
    );
    assert.deepEqual(storage.readKeys, ['brand/fonts/iris-idol.ttf']);
    assert.equal(
        (await app.request('http://ims.test/assets/images/Production/unknown.png')).status,
        404
    );
});
