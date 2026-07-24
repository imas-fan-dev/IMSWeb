import crypto from 'node:crypto';
import {
    CopyObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    type S3Client
} from '@aws-sdk/client-s3';
import type {
    CompensationService,
    ListedObject,
    ObjectReadUrlOptions,
    ObjectStorage,
    PutObjectOptions,
    StoredObject
} from '@/ports/object-storage';
import {
    S3UploadStateMachine,
    type S3ObjectVersion
} from '@/infra/oss/s3/upload-state-machine';
import { contentTypeForPath } from '@/utils/http/content-type';

export interface S3ObjectStorageOptions {
    bucket: string;
    prefix?: string;
    readUrlTtlSeconds: number;
}

export type S3ReadUrlSigner = (
    command: GetObjectCommand | HeadObjectCommand,
    expiresInSeconds: number
) => Promise<string>;

interface ResolvedObject {
    physicalKey: string;
    version: S3ObjectVersion | null;
}

const INTERNAL_OBJECT_PREFIX = '__ims_s3/objects';

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

function normalizedPrefix(options: S3ObjectStorageOptions): string {
    return options.prefix?.replace(/^\/+|\/+$/g, '') || '';
}

function withPrefix(prefix: string, key: string): string {
    return prefix ? `${prefix}/${key}` : key;
}

export function s3PhysicalObjectKey(
    options: S3ObjectStorageOptions,
    objectId: string
): string {
    return withPrefix(normalizedPrefix(options), `${INTERNAL_OBJECT_PREFIX}/${objectId}`);
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

function encodeMetadata(metadata: Record<string, string> | undefined): Record<string, string> {
    return Object.fromEntries(
        Object.entries(metadata || {}).map(([key, value]) => [key, encodeURIComponent(value)])
    );
}

function encodeCopySource(bucket: string, key: string): string {
    return [bucket, ...key.split('/')].map(encodeURIComponent).join('/');
}

export class S3ObjectStorage implements ObjectStorage {
    private readonly prefix: string;

    constructor(
        private readonly client: Pick<S3Client, 'send' | 'destroy'>,
        private readonly options: S3ObjectStorageOptions,
        private readonly signReadUrl: S3ReadUrlSigner,
        private readonly state: S3UploadStateMachine,
        private readonly compensation?: CompensationService
    ) {
        this.prefix = normalizedPrefix(options);
    }

    private legacyPhysicalKey(key: string, preserveTrailingSlash = false): string {
        return withPrefix(this.prefix, normalizeKey(key, preserveTrailingSlash));
    }

    private logicalKey(key: string): string | null {
        if (!this.prefix) return key;
        const prefix = `${this.prefix}/`;
        return key.startsWith(prefix) ? key.slice(prefix.length) : null;
    }

    private physicalObjectKey(objectId: string): string {
        return s3PhysicalObjectKey(this.options, objectId);
    }

    async deletePhysicalObject(objectId: string): Promise<void> {
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.options.bucket,
            Key: this.physicalObjectKey(objectId)
        }));
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

    private async resolve(key: string): Promise<ResolvedObject | null> {
        const logicalKey = normalizeKey(key);
        if (await this.state.isManaged(logicalKey)) {
            const readable = await this.state.readable(logicalKey);
            return readable
                ? { physicalKey: this.physicalObjectKey(readable.objectId), version: readable }
                : null;
        }
        return { physicalKey: this.legacyPhysicalKey(logicalKey), version: null };
    }

    private async getResolved(resolved: ResolvedObject): Promise<StoredObject | null> {
        try {
            const result = await this.client.send(new GetObjectCommand({
                Bucket: this.options.bucket,
                Key: resolved.physicalKey
            }));
            if (!result.Body) throw new Error('S3 returned an object without a body');
            const body = await result.Body.transformToByteArray();
            return this.storedObject(body, result.ContentType, result.ETag, result.LastModified);
        } catch (error) {
            if (isMissing(error)) return null;
            throw error;
        }
    }

    async get(key: string): Promise<StoredObject | null> {
        const resolved = await this.resolve(key);
        return resolved ? this.getResolved(resolved) : null;
    }

    async createReadUrl(
        key: string,
        options: ObjectReadUrlOptions = {}
    ): Promise<string | null> {
        const resolved = await this.resolve(key);
        if (!resolved || !await this.physicalExists(resolved.physicalKey)) return null;
        const input = { Bucket: this.options.bucket, Key: resolved.physicalKey };
        const command = options.method === 'HEAD'
            ? new HeadObjectCommand(input)
            : new GetObjectCommand(input);
        return this.signReadUrl(command, this.options.readUrlTtlSeconds);
    }

    async put(key: string, body: Uint8Array, options: PutObjectOptions = {}): Promise<StoredObject> {
        const result = await this.putVersion(key, body, options);
        if (!result) throw new Error('Concurrent S3 object mutation');
        return result;
    }

    private async putVersion(
        key: string,
        body: Uint8Array,
        options: PutObjectOptions,
        expectedEtag?: string | null
    ): Promise<StoredObject | null> {
        const logicalKey = normalizeKey(key);
        const digest = sha256(body);
        if (options.sha256 && options.sha256.toLowerCase() !== digest) {
            throw new Error('SHA-256 mismatch');
        }
        let expectedPreviousObjectId: string | null | undefined;
        if (expectedEtag !== undefined) {
            const expectedMutationIdentity = await this.state.mutationIdentity(logicalKey);
            const current = await this.get(logicalKey);
            if ((expectedEtag === null && current) ||
                (expectedEtag !== null && current?.etag !== expectedEtag)) {
                return null;
            }
            expectedPreviousObjectId = expectedMutationIdentity;
        }

        const objectId = crypto.randomUUID();
        const operation = await this.state.beginUpload(
            logicalKey,
            objectId,
            options.deferredPublication ? 'pending' : 'ready'
        );
        if (expectedPreviousObjectId !== undefined &&
            operation.previousObjectId !== expectedPreviousObjectId) {
            await this.state.abortUpload(operation.id);
            return null;
        }
        const contentType = options.contentType || contentTypeForPath(logicalKey);
        let uploaded = false;
        try {
            const result = await this.client.send(new PutObjectCommand({
                Bucket: this.options.bucket,
                Key: this.physicalObjectKey(objectId),
                Body: body,
                ContentType: contentType,
                Metadata: {
                    ...encodeMetadata(options.metadata),
                    sha256: digest,
                    logicalKey: encodeURIComponent(logicalKey),
                    ...(options.ownerToken
                        ? { ownerToken: encodeURIComponent(options.ownerToken) }
                        : {})
                }
            }));
            uploaded = true;
            const etag = result.ETag || `"${digest}"`;
            const completed = await this.state.completeUpload(operation, {
                size: body.byteLength,
                contentType,
                sha256: digest,
                etag,
                ownerToken: options.ownerToken || null
            });
            if (!completed) {
                await this.cleanupPhysicalObject(objectId);
                return null;
            }
            if (operation.targetState === 'ready') {
                for (const supersededObjectId of await this.state.supersededObjectIds(operation)) {
                    await this.cleanupPhysicalObject(supersededObjectId, undefined, true);
                }
            }
            return this.storedObject(body, contentType, etag, new Date());
        } catch (error) {
            await this.state.abortUpload(operation.id).catch(() => undefined);
            if (uploaded) await this.cleanupPhysicalObject(objectId, error);
            throw error;
        }
    }

    async putIfUnchanged(
        key: string,
        expectedEtag: string | null,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject | null> {
        return this.putVersion(key, body, options, expectedEtag);
    }

    private async cleanupPhysicalObject(
        objectId: string,
        cause?: unknown,
        durableCleanup = false
    ): Promise<void> {
        if (await this.state.isObjectReferenced(objectId)) return;
        try {
            await this.deletePhysicalObject(objectId);
            await this.state.removeVersionIfUnreferenced(objectId);
        } catch (error) {
            if (durableCleanup) return;
            if (!this.compensation) throw error;
            await this.compensation.enqueue('delete-s3-object', { objectId }, cause ?? error);
        }
    }

    async delete(key: string): Promise<void> {
        const logicalKey = normalizeKey(key);
        if (await this.state.isManaged(logicalKey)) {
            const objectId = await this.state.claimDelete(logicalKey);
            if (objectId) await this.cleanupPhysicalObject(objectId, undefined, true);
            return;
        }
        await this.client.send(new DeleteObjectCommand({
            Bucket: this.options.bucket,
            Key: this.legacyPhysicalKey(logicalKey)
        }));
    }

    async deleteIfObjectId(key: string, expectedObjectId: string): Promise<boolean> {
        const logicalKey = normalizeKey(key);
        if (!await this.state.isManaged(logicalKey)) return false;
        const objectId = await this.state.claimDelete(logicalKey, { objectId: expectedObjectId });
        if (!objectId) return false;
        await this.cleanupPhysicalObject(objectId, undefined, true);
        return true;
    }

    async deleteIfOwned(key: string, expectedOwnerToken: string): Promise<boolean> {
        const logicalKey = normalizeKey(key);
        if (!await this.state.isManaged(logicalKey)) return false;
        const objectId = await this.state.claimDelete(logicalKey, {
            ownerToken: expectedOwnerToken
        });
        if (!objectId) return false;
        await this.cleanupPhysicalObject(objectId, undefined, true);
        return true;
    }

    private async physicalExists(physicalKey: string): Promise<boolean> {
        try {
            await this.client.send(new HeadObjectCommand({
                Bucket: this.options.bucket,
                Key: physicalKey
            }));
            return true;
        } catch (error) {
            if (isMissing(error)) return false;
            throw error;
        }
    }

    async exists(key: string): Promise<boolean> {
        const resolved = await this.resolve(key);
        return resolved ? this.physicalExists(resolved.physicalKey) : false;
    }

    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        const source = await this.resolve(sourceKey);
        if (!source) throw new Error('S3 source object not found');
        if (source.version) {
            await this.copyVersion(
                { physicalKey: source.physicalKey, version: source.version },
                destinationKey,
                source.version.ownerToken
            );
            return;
        }
        const legacy = await this.getResolved(source);
        if (!legacy) throw new Error('S3 source object not found');
        await this.put(destinationKey, legacy.body, { contentType: legacy.contentType });
    }

    private async copyVersion(
        source: { physicalKey: string; version: S3ObjectVersion },
        destinationKey: string,
        ownerToken: string | null
    ): Promise<void> {
        const logicalKey = normalizeKey(destinationKey);
        const objectId = crypto.randomUUID();
        const operation = await this.state.beginUpload(logicalKey, objectId, 'ready');
        let copied = false;
        try {
            const result = await this.client.send(new CopyObjectCommand({
                Bucket: this.options.bucket,
                Key: this.physicalObjectKey(objectId),
                CopySource: encodeCopySource(this.options.bucket, source.physicalKey),
                MetadataDirective: 'COPY'
            }));
            copied = true;
            const completed = await this.state.completeUpload(operation, {
                size: source.version.size,
                contentType: source.version.contentType,
                sha256: source.version.sha256,
                etag: result.CopyObjectResult?.ETag || source.version.etag,
                ownerToken
            });
            if (!completed) throw new Error('Concurrent S3 object mutation');
            for (const supersededObjectId of await this.state.supersededObjectIds(operation)) {
                await this.cleanupPhysicalObject(supersededObjectId, undefined, true);
            }
        } catch (error) {
            await this.state.abortUpload(operation.id).catch(() => undefined);
            if (copied) await this.cleanupPhysicalObject(objectId, error);
            throw error;
        }
    }

    async move(sourceKey: string, destinationKey: string): Promise<void> {
        await this.copy(sourceKey, destinationKey);
        await this.delete(sourceKey);
    }

    async moveIfOwned(
        sourceKey: string,
        destinationKey: string,
        expectedOwnerToken: string
    ): Promise<boolean> {
        const source = await this.state.snapshot(normalizeKey(sourceKey));
        if (!source || source.ownerToken !== expectedOwnerToken ||
            !['pending', 'ready'].includes(source.state)) {
            return false;
        }
        const resolved = {
            physicalKey: this.physicalObjectKey(source.objectId),
            version: source
        };
        if (!await this.physicalExists(resolved.physicalKey)) return false;
        await this.copyVersion(resolved, destinationKey, expectedOwnerToken);
        const deleted = await this.deleteIfOwned(sourceKey, expectedOwnerToken);
        if (!deleted) {
            await this.deleteIfOwned(destinationKey, expectedOwnerToken);
            return false;
        }
        return true;
    }

    private async listLegacy(prefix: string): Promise<ListedObject[]> {
        const physicalPrefix = this.legacyPhysicalKey(prefix, true);
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
                if (!key || key.startsWith(`${INTERNAL_OBJECT_PREFIX}/`) ||
                    await this.state.isManaged(key)) {
                    continue;
                }
                results.push({ key, size: object.Size || 0, etag: object.ETag || '' });
            }
            continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
            if (page.IsTruncated && !continuationToken) {
                throw new Error('S3 truncated a listing without a continuation token');
            }
        } while (continuationToken);
        return results;
    }

    async list(prefix: string): Promise<ListedObject[]> {
        const logicalPrefix = normalizeKey(prefix, true);
        const managed = (await this.state.listReadable(logicalPrefix)).map((object) => ({
            key: object.logicalKey,
            size: object.size,
            etag: object.etag
        }));
        const legacy = await this.listLegacy(logicalPrefix);
        return [...managed, ...legacy].sort((left, right) =>
            left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
    }

    async deletePrefix(prefix: string): Promise<void> {
        for (const object of await this.list(prefix)) await this.delete(object.key);
    }

    async publish(key: string): Promise<void> {
        const supersededObjectIds = await this.state.publish(normalizeKey(key));
        for (const objectId of supersededObjectIds) {
            await this.cleanupPhysicalObject(objectId, undefined, true);
        }
    }

    async recoverStaleUploads(limit = 10, staleSeconds = 15 * 60): Promise<void> {
        if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid recovery limit');
        if (!Number.isInteger(staleSeconds) || staleSeconds < 1) {
            throw new Error('Invalid stale upload age');
        }
        const operations = await this.state.staleOperations(
            limit,
            Date.now() - (staleSeconds * 1000)
        );
        for (const operation of operations) {
            const objectId = await this.state.claimStale(operation);
            if (objectId) await this.cleanupPhysicalObject(objectId, undefined, true);
        }
    }

    close(): void {
        this.client.destroy();
    }
}
