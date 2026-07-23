import crypto from 'node:crypto';
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
import { contentTypeForPath } from '@/adapters/node/filesystem-object-storage';
import type {
    ListedObject,
    ObjectStorage,
    PutObjectOptions,
    StoredObject
} from '@/ports/object-storage';

export interface S3ObjectStorageOptions {
    bucket: string;
    prefix?: string;
}

function normalizeKey(key: string, preserveTrailingSlash = false): string {
    const normalized = key.replace(/^\/+/, '').replace(/\\/g, '/');
    const trailingSlash = normalized.endsWith('/');
    const withoutTrailingSlash = normalized.replace(/\/+$/, '');
    const segments = withoutTrailingSlash.split('/');
    if (
        !withoutTrailingSlash ||
        segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
        throw new Error('Invalid object key');
    }
    return preserveTrailingSlash && trailingSlash
        ? `${withoutTrailingSlash}/`
        : withoutTrailingSlash;
}

function sha256(body: Uint8Array): string {
    return crypto.createHash('sha256').update(body).digest('hex');
}

function errorStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}

function errorName(error: unknown): string | undefined {
    return error && typeof error === 'object' && 'name' in error
        ? String((error as { name: unknown }).name)
        : undefined;
}

function isMissing(error: unknown): boolean {
    return errorStatus(error) === 404 || ['NoSuchKey', 'NotFound'].includes(errorName(error) || '');
}

function isPreconditionFailure(error: unknown): boolean {
    return [409, 412].includes(errorStatus(error) || 0) ||
        ['ConditionalRequestConflict', 'PreconditionFailed'].includes(errorName(error) || '');
}

function encodeCopySource(bucket: string, key: string): string {
    return [bucket, ...key.split('/')].map(encodeURIComponent).join('/');
}

function encodeMetadata(metadata: Record<string, string> | undefined): Record<string, string> {
    return Object.fromEntries(
        Object.entries(metadata || {}).map(([key, value]) => [key, encodeURIComponent(value)])
    );
}

export class S3ObjectStorage implements ObjectStorage {
    private readonly prefix: string;

    constructor(
        private readonly client: Pick<S3Client, 'send' | 'destroy'>,
        private readonly options: S3ObjectStorageOptions
    ) {
        this.prefix = options.prefix?.replace(/^\/+|\/+$/g, '') || '';
    }

    private physicalKey(key: string, preserveTrailingSlash = false): string {
        const normalized = normalizeKey(key, preserveTrailingSlash);
        return this.prefix ? `${this.prefix}/${normalized}` : normalized;
    }

    private logicalKey(key: string): string | null {
        if (!this.prefix) return key;
        const prefix = `${this.prefix}/`;
        return key.startsWith(prefix) ? key.slice(prefix.length) : null;
    }

    private storedObject(
        body: Uint8Array,
        contentType: string | undefined,
        etag: string | undefined,
        uploadedAt: Date | undefined
    ): StoredObject {
        return {
            body,
            size: body.byteLength,
            contentType: contentType || 'application/octet-stream',
            etag: etag || `"${sha256(body)}"`,
            uploadedAt
        };
    }

    async get(key: string): Promise<StoredObject | null> {
        try {
            const result = await this.client.send(new GetObjectCommand({
                Bucket: this.options.bucket,
                Key: this.physicalKey(key)
            }));
            if (!result.Body) throw new Error('S3 returned an object without a body');
            const body = await result.Body.transformToByteArray();
            return this.storedObject(body, result.ContentType, result.ETag, result.LastModified);
        } catch (error) {
            if (isMissing(error)) return null;
            throw error;
        }
    }

    async put(key: string, body: Uint8Array, options: PutObjectOptions = {}): Promise<StoredObject> {
        return this.putWithCondition(key, body, options);
    }

    private async putWithCondition(
        key: string,
        body: Uint8Array,
        options: PutObjectOptions,
        condition: { IfMatch?: string; IfNoneMatch?: string } = {}
    ): Promise<StoredObject> {
        const digest = sha256(body);
        if (options.sha256 && options.sha256.toLowerCase() !== digest) {
            throw new Error('SHA-256 mismatch');
        }
        const contentType = options.contentType || contentTypeForPath(key);
        const result = await this.client.send(new PutObjectCommand({
            Bucket: this.options.bucket,
            Key: this.physicalKey(key),
            Body: body,
            ContentType: contentType,
            Metadata: { ...encodeMetadata(options.metadata), sha256: digest },
            ...condition
        }));
        return this.storedObject(body, contentType, result.ETag, new Date());
    }

    async putIfUnchanged(
        key: string,
        expectedEtag: string | null,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject | null> {
        try {
            return await this.putWithCondition(key, body, options, expectedEtag === null
                ? { IfNoneMatch: '*' }
                : { IfMatch: expectedEtag });
        } catch (error) {
            if (isPreconditionFailure(error)) return null;
            throw error;
        }
    }

    async delete(key: string): Promise<void> {
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.options.bucket,
            Key: this.physicalKey(key)
        }));
    }

    async exists(key: string): Promise<boolean> {
        try {
            await this.client.send(new HeadObjectCommand({
                Bucket: this.options.bucket,
                Key: this.physicalKey(key)
            }));
            return true;
        } catch (error) {
            if (isMissing(error)) return false;
            throw error;
        }
    }

    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        await this.client.send(new CopyObjectCommand({
            Bucket: this.options.bucket,
            Key: this.physicalKey(destinationKey),
            CopySource: encodeCopySource(this.options.bucket, this.physicalKey(sourceKey)),
            MetadataDirective: 'COPY'
        }));
    }

    async move(sourceKey: string, destinationKey: string): Promise<void> {
        await this.copy(sourceKey, destinationKey);
        await this.delete(sourceKey);
    }

    async list(prefix: string): Promise<ListedObject[]> {
        const physicalPrefix = this.physicalKey(prefix, true);
        const results: ListedObject[] = [];
        let continuationToken: string | undefined;
        do {
            const page = await this.client.send(new ListObjectsV2Command({
                Bucket: this.options.bucket,
                Prefix: physicalPrefix,
                ContinuationToken: continuationToken
            }));
            for (const object of page.Contents || []) {
                if (!object.Key) continue;
                const key = this.logicalKey(object.Key);
                if (!key) continue;
                results.push({ key, size: object.Size || 0, etag: object.ETag || '' });
            }
            continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
            if (page.IsTruncated && !continuationToken) {
                throw new Error('S3 truncated a listing without a continuation token');
            }
        } while (continuationToken);
        return results.sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
    }

    async deletePrefix(prefix: string): Promise<void> {
        const objects = await this.list(prefix);
        for (let index = 0; index < objects.length; index += 1000) {
            const batch = objects.slice(index, index + 1000);
            const result = await this.client.send(new DeleteObjectsCommand({
                Bucket: this.options.bucket,
                Delete: {
                    Objects: batch.map((object) => ({ Key: this.physicalKey(object.key) })),
                    Quiet: true
                }
            }));
            if (result.Errors?.length) {
                throw new Error(`S3 failed to delete ${result.Errors.length} object(s)`);
            }
        }
    }

    close(): void {
        this.client.destroy();
    }
}
