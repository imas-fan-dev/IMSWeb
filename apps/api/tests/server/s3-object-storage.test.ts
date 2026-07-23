import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    CopyObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    type S3Client
} from '@aws-sdk/client-s3';
import { S3ObjectStorage } from '@/adapters/node/s3-object-storage';

interface FakeObject {
    body: Uint8Array;
    contentType?: string;
    etag: string;
    lastModified: Date;
    metadata?: Record<string, string>;
}

function s3Error(name: string, status: number): Error {
    return Object.assign(new Error(name), {
        name,
        $metadata: { httpStatusCode: status }
    });
}

class FakeS3Client {
    readonly objects = new Map<string, FakeObject>();
    readonly commands: unknown[] = [];
    destroyCalls = 0;
    private revision = 0;

    async send(command: unknown): Promise<any> {
        this.commands.push(command);
        if (command instanceof PutObjectCommand) {
            const key = command.input.Key!;
            const current = this.objects.get(key);
            if (command.input.IfNoneMatch === '*' && current) {
                throw s3Error('PreconditionFailed', 412);
            }
            if (command.input.IfMatch && current?.etag !== command.input.IfMatch) {
                throw s3Error('PreconditionFailed', 412);
            }
            const body = Uint8Array.from(command.input.Body as Uint8Array);
            const etag = `"etag-${++this.revision}"`;
            this.objects.set(key, {
                body,
                contentType: command.input.ContentType,
                etag,
                lastModified: new Date('2026-07-22T00:00:00Z'),
                metadata: command.input.Metadata
            });
            return { ETag: etag };
        }
        if (command instanceof GetObjectCommand) {
            const object = this.objects.get(command.input.Key!);
            if (!object) throw s3Error('NoSuchKey', 404);
            return {
                Body: { transformToByteArray: async () => Uint8Array.from(object.body) },
                ContentType: object.contentType,
                ETag: object.etag,
                LastModified: object.lastModified
            };
        }
        if (command instanceof HeadObjectCommand) {
            if (!this.objects.has(command.input.Key!)) throw s3Error('NotFound', 404);
            return {};
        }
        if (command instanceof DeleteObjectCommand) {
            this.objects.delete(command.input.Key!);
            return {};
        }
        if (command instanceof CopyObjectCommand) {
            const decoded = decodeURIComponent(command.input.CopySource!);
            const sourceKey = decoded.slice(`${command.input.Bucket}/`.length);
            const source = this.objects.get(sourceKey);
            if (!source) throw s3Error('NoSuchKey', 404);
            this.objects.set(command.input.Key!, {
                ...source,
                body: Uint8Array.from(source.body),
                lastModified: new Date('2026-07-22T00:00:01Z')
            });
            return {};
        }
        if (command instanceof ListObjectsV2Command) {
            const keys = [...this.objects.keys()]
                .filter((key) => key.startsWith(command.input.Prefix || ''))
                .sort();
            const start = Number(command.input.ContinuationToken || 0);
            const page = keys.slice(start, start + 2);
            const next = start + page.length;
            return {
                Contents: page.map((key) => ({
                    Key: key,
                    Size: this.objects.get(key)!.body.byteLength,
                    ETag: this.objects.get(key)!.etag
                })),
                IsTruncated: next < keys.length,
                NextContinuationToken: next < keys.length ? String(next) : undefined
            };
        }
        if (command instanceof DeleteObjectsCommand) {
            for (const object of command.input.Delete?.Objects || []) {
                if (object.Key) this.objects.delete(object.Key);
            }
            return {};
        }
        throw new Error(`Unexpected command: ${String(command)}`);
    }

    destroy(): void {
        this.destroyCalls += 1;
    }
}

function fixture(): { client: FakeS3Client; storage: S3ObjectStorage } {
    const client = new FakeS3Client();
    const storage = new S3ObjectStorage(
        client as unknown as Pick<S3Client, 'send' | 'destroy'>,
        { bucket: 'ims-media-prod', prefix: 'ims/production' }
    );
    return { client, storage };
}

test('S3 object storage preserves logical keys across CRUD, copy, move, and pagination', async () => {
    const { client, storage } = fixture();
    const firstBody = new TextEncoder().encode('first');
    const first = await storage.put('uploads/news/original/a b.webp', firstBody, {
        contentType: 'image/webp',
        metadata: { owner: 'news', idol: '樱木真乃' }
    });
    assert.equal(first.size, firstBody.byteLength);
    assert.equal(client.objects.has('ims/production/uploads/news/original/a b.webp'), true);
    assert.equal(
        client.objects.get('ims/production/uploads/news/original/a b.webp')?.metadata?.owner,
        'news'
    );
    assert.equal(
        client.objects.get('ims/production/uploads/news/original/a b.webp')?.metadata?.idol,
        encodeURIComponent('樱木真乃')
    );
    assert.match(
        client.objects.get('ims/production/uploads/news/original/a b.webp')?.metadata?.sha256 || '',
        /^[a-f0-9]{64}$/
    );

    assert.deepEqual((await storage.get('uploads/news/original/a b.webp'))?.body, firstBody);
    assert.equal(await storage.exists('uploads/news/original/a b.webp'), true);
    assert.equal(await storage.get('uploads/news/original/missing.webp'), null);
    assert.equal(await storage.exists('uploads/news/original/missing.webp'), false);

    assert.equal(await storage.putIfUnchanged(
        'uploads/news/original/a b.webp', null, new Uint8Array([9])
    ), null);
    const changed = await storage.putIfUnchanged(
        'uploads/news/original/a b.webp', first.etag, new Uint8Array([2, 3])
    );
    assert.ok(changed);

    await storage.copy(
        'uploads/news/original/a b.webp',
        'uploads/news/original/copy.webp'
    );
    await storage.move(
        'uploads/news/original/copy.webp',
        'uploads/news/original/moved.webp'
    );
    await storage.put('uploads/news/original/z.webp', new Uint8Array([4]));
    assert.equal(await storage.exists('uploads/news/original/copy.webp'), false);
    assert.equal(await storage.exists('uploads/news/original/moved.webp'), true);

    assert.deepEqual(
        (await storage.list('uploads/news/original/')).map((object) => object.key),
        [
            'uploads/news/original/a b.webp',
            'uploads/news/original/moved.webp',
            'uploads/news/original/z.webp'
        ]
    );
    assert.ok(client.commands.filter((command) => command instanceof ListObjectsV2Command).length >= 2);

    await storage.deletePrefix('uploads/news/original/');
    assert.deepEqual(await storage.list('uploads/news/original/'), []);
    storage.close();
    assert.equal(client.destroyCalls, 1);
});

test('S3 object storage validates checksums and rejects unsafe logical keys', async () => {
    const { client, storage } = fixture();
    await assert.rejects(
        storage.put('uploads/news/original/a.webp', new Uint8Array([1]), {
            sha256: '0'.repeat(64)
        }),
        /SHA-256 mismatch/
    );
    assert.equal(client.commands.length, 0);
    await assert.rejects(storage.get('../secret'), /Invalid object key/);
    await assert.rejects(storage.list('uploads//news/'), /Invalid object key/);
});
