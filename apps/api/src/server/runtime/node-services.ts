import '@/runtime/node-environment';
import type { RuntimeServices } from '@/ports/runtime-services';
import {
    COMPENSATION_DIR,
    DATABASE_PATH,
    EVENT_BASE,
    IDEMPOTENCY_DIR,
    PUBLIC_DIR,
    STORY_DATA_DIR,
    STORY_DATABASE_PATH,
    UPLOADS_DIR,
    ensureRuntimeDirectories
} from '@/config/paths';
import { COOKIE_OPTIONS, SECRET_KEY, STORY_MAX_UPLOAD_BYTES } from '@/config/env';
import {
    parseNodeObjectStorageConfig,
    type NodeObjectStorageConfig
} from '@/config/object-storage';
import { FilesystemObjectStorage } from '@/adapters/node/filesystem-object-storage';
import { S3ObjectStorage } from '@/adapters/node/s3-object-storage';
import { FilesystemIdempotencyStore } from '@/adapters/node/filesystem-idempotency-store';
import { FilesystemCompensationService } from '@/adapters/node/filesystem-compensation-service';
import { MemoryRateLimiter } from '@/adapters/node/memory-rate-limiter';
import { NodeStaticAssets } from '@/adapters/node/node-static-assets';
import { BcryptPasswordVerifier } from '@/adapters/node/security-services';
import { HmacTokenService } from '@/adapters/shared/hmac-token-service';
import { SharpImageProcessor } from '@/adapters/node/sharp-image-processor';
import { SqliteConnection } from '@/adapters/node/sqlite-connection';
import { SqliteCoreRepository } from '@/adapters/node/sqlite-core-repository';
import { StreamingUploadParser } from '@/adapters/node/streaming-upload-parser';
import { SqliteStoryRepository } from '@/adapters/node/sqlite-story-repository';
import { S3Client } from '@aws-sdk/client-s3';
import type { ObjectStorage } from '@/ports/object-storage';

interface InitializableResource {
    initialize(): Promise<void>;
    close(): Promise<void>;
}

export async function initializeNodeRepositories(
    core: InitializableResource,
    story: InitializableResource
): Promise<void> {
    try {
        await core.initialize();
        await story.initialize();
    } catch (error) {
        await Promise.allSettled([story.close(), core.close()]);
        throw error;
    }
}

async function closeRuntimeServices(services: RuntimeServices): Promise<void> {
    const results = await Promise.allSettled([
        services.storage?.close
            ? Promise.resolve().then(() => services.storage?.close?.())
            : undefined,
        services.story?.close(),
        services.core?.close()
    ].filter((operation): operation is Promise<void> => Boolean(operation)));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map((result) => result.reason), 'Failed to close Node services');
}

export function createNodeObjectStorage(config: NodeObjectStorageConfig): ObjectStorage {
    if (config.type === 's3') {
        return new S3ObjectStorage(new S3Client({
            region: config.region,
            endpoint: config.endpoint,
            forcePathStyle: config.forcePathStyle
        }), {
            bucket: config.bucket,
            prefix: config.prefix
        });
    }
    return new FilesystemObjectStorage({
        publicDir: PUBLIC_DIR,
        uploadsDir: UPLOADS_DIR,
        chronicleDir: EVENT_BASE,
        storyDataDir: STORY_DATA_DIR
    });
}

export function createNodeServiceLifecycle(factory: () => Promise<RuntimeServices>): {
    resolve(): Promise<RuntimeServices>;
    close(): Promise<void>;
} {
    let current: Promise<RuntimeServices> | undefined;
    let closing: Promise<void> | undefined;
    return {
        resolve(): Promise<RuntimeServices> {
            if (!current) {
                const created = factory();
                current = created;
                void created.catch(() => {
                    if (current === created) current = undefined;
                });
            }
            return current;
        },
        close(): Promise<void> {
            if (!current) return Promise.resolve();
            if (closing) return closing;
            const target = current;
            closing = (async () => {
                const services = await target.catch(() => undefined);
                if (services) await closeRuntimeServices(services);
            })().finally(() => {
                if (current === target) current = undefined;
                closing = undefined;
            });
            return closing;
        }
    };
}

export async function createNodeServices(): Promise<RuntimeServices> {
    const objectStorage = parseNodeObjectStorageConfig();
    ensureRuntimeDirectories(objectStorage.type === 'filesystem');
    const core = new SqliteCoreRepository(new SqliteConnection(DATABASE_PATH));
    const story = new SqliteStoryRepository(new SqliteConnection(STORY_DATABASE_PATH));
    try {
        await initializeNodeRepositories(core, story);
        const storage = createNodeObjectStorage(objectStorage);
        const compensation = new FilesystemCompensationService(COMPENSATION_DIR);
        return {
            core,
            compensation,
            story,
            storage,
            images: new SharpImageProcessor(),
            idempotency: new FilesystemIdempotencyStore(IDEMPOTENCY_DIR),
            passwords: new BcryptPasswordVerifier(),
            tokens: new HmacTokenService(SECRET_KEY),
            rateLimiter: new MemoryRateLimiter(),
            staticAssets: new NodeStaticAssets(PUBLIC_DIR),
            uploads: new StreamingUploadParser(),
            fetch: globalThis.fetch,
            config: {
                cookieSecure: COOKIE_OPTIONS.secure,
                storyMaxUploadBytes: STORY_MAX_UPLOAD_BYTES,
                clientAddressSource: 'nginx'
            }
        };
    } catch (error) {
        await Promise.allSettled([story.close(), core.close()]);
        throw error;
    }
}

const lifecycle = createNodeServiceLifecycle(createNodeServices);

export function resolveNodeServices(): Promise<RuntimeServices> {
    return lifecycle.resolve();
}

export async function closeNodeServices(): Promise<void> {
    await lifecycle.close();
}
