import '@/runtime/node-environment';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { NodeDatabaseConfig } from '@/config/database';
import type { NodeObjectStorageConfig } from '@/config/object-storage';
import type {
    AuditRepository,
    AuthRepository,
    EventRepository,
    NamecardRepository,
    NewsRepository,
    ReactionRepository,
    SitePackageRepository,
    StoryRepository
} from '@/ports/repositories';
import type { ManagedSqlDatabase, SqlSchemaStrategy } from '@/infra/db/sql/database';
import type { ObjectStorageServices } from '@/ports/object-storage';
import type { NodeRuntimeServices, RuntimeServices } from '@/ports/runtime-services';
import {
    COMPENSATION_DIR,
    EVENT_BASE,
    IDEMPOTENCY_DIR,
    PUBLIC_DIR,
    SQLITE_DATABASE_PATH,
    STORY_DATA_DIR,
    UPLOADS_DIR,
    ensureRuntimeDirectories
} from '@/config/paths';
import {
    CLIENT_ADDRESS_SOURCE,
    COOKIE_OPTIONS,
    SECRET_KEY,
    SITE_ORIGINS,
    SITE_PACKAGE_MAX_UPLOAD_BYTES,
    STORY_MAX_UPLOAD_BYTES
} from '@/config/env';
import { parseNodeObjectStorageConfig } from '@/config/object-storage';
import { parseNodeDatabaseConfig } from '@/config/database';
import { FilesystemIdempotencyStore } from '@/infra/cache/filesystem/idempotency-store';
import { MemoryRateLimiter } from '@/infra/cache/memory/rate-limiter';
import { PostgresConnection } from '@/infra/db/postgresql/connection';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqlStoryRepository } from '@/infra/db/repositories/story-repository';
import { SqliteConnection } from '@/infra/db/sqlite/connection';
import { SqliteSchemaStrategy } from '@/infra/db/sqlite/schema-strategy';
import { StreamingUploadParser } from '@/infra/http/busboy/upload-parser';
import { FilesystemCompensationService } from '@/infra/oss/filesystem/compensation-service';
import {
    FilesystemObjectStorage,
    type FilesystemStorageRoots
} from '@/infra/oss/filesystem/object-storage';
import {
    FrontendStaticAssets,
    listFrontendFiles,
    NodeStaticAssets
} from '@/infra/http/filesystem/static-assets';
import { S3CompensationService } from '@/infra/oss/s3/compensation-service';
import { S3ObjectStorage } from '@/infra/oss/s3/object-storage';
import { S3UploadStateMachine } from '@/infra/oss/s3/upload-state-machine';
import { SharpImageProcessor } from '@/infra/media/sharp/image-processor';
import { BcryptPasswordVerifier } from '@/infra/security/bcrypt/password-verifier';
import { HmacTokenService } from '@/infra/security/hmac/token-service';

interface InitializableResource {
    initialize(): Promise<void>;
    close(): Promise<void>;
}

interface CoreRepositoryAdapter extends
    InitializableResource,
    AuthRepository,
    AuditRepository,
    NewsRepository,
    EventRepository,
    NamecardRepository,
    ReactionRepository,
    SitePackageRepository {}

interface StoryRepositoryAdapter extends InitializableResource, StoryRepository {}

interface NodeRepositories {
    database: ManagedSqlDatabase;
    core: CoreRepositoryAdapter;
    story: StoryRepositoryAdapter;
}

function createNodeRepositories(config: NodeDatabaseConfig): NodeRepositories {
    let database: ManagedSqlDatabase;
    let schema: SqlSchemaStrategy;
    if (config.type === 'postgresql') {
        database = PostgresConnection.create(config);
        schema = new PostgresqlSchemaStrategy();
    } else {
        database = new SqliteConnection(config.path);
        schema = new SqliteSchemaStrategy();
    }
    return {
        database,
        core: new SqlCoreRepository(database, schema),
        story: new SqlStoryRepository(database, schema)
    };
}

async function createNodeObjectStorage(
    config: NodeObjectStorageConfig,
    filesystemRoots: FilesystemStorageRoots,
    database: ManagedSqlDatabase
): Promise<ObjectStorageServices> {
    if (config.type === 'filesystem') {
        return {
            compensation: new FilesystemCompensationService(COMPENSATION_DIR),
            storage: new FilesystemObjectStorage(filesystemRoots, {
                publicReadUrlBase: config.publicReadUrlBase
            })
        };
    }
    const client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle
    });
    const options = {
        bucket: config.bucket,
        publicReadUrlBase: config.publicReadUrlBase,
        prefix: config.prefix,
        readUrlTtlSeconds: config.readUrlTtlSeconds
    };
    const state = new S3UploadStateMachine(database);
    try {
        await state.initialize();
    } catch (error) {
        client.destroy();
        throw error;
    }
    let storage: S3ObjectStorage;
    const compensation = new S3CompensationService(
        database,
        state,
        (objectId, physicalKey, storageScope) =>
            storage.deletePhysicalObject(objectId, physicalKey, storageScope)
    );
    storage = new S3ObjectStorage(
        client,
        options,
        (command, expiresIn) => getSignedUrl(client, command, { expiresIn }),
        state,
        compensation
    );
    return { compensation, storage };
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
    const auth = services.auth as (AuthRepository & Partial<InitializableResource>) | undefined;
    const story = services.story as (StoryRepository & Partial<InitializableResource>) | undefined;
    const results = await Promise.allSettled([
        services.storage?.close
            ? Promise.resolve().then(() => services.storage?.close?.())
            : undefined,
        story?.close?.(),
        auth?.close?.()
    ].filter((operation): operation is Promise<void> => Boolean(operation)));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map((result) => result.reason), 'Failed to close Node services');
}

export function createNodeServiceLifecycle<Services extends RuntimeServices>(
    factory: () => Promise<Services>
): {
    resolve(): Promise<Services>;
    close(): Promise<void>;
} {
    let current: Promise<Services> | undefined;
    let closing: Promise<void> | undefined;
    return {
        resolve(): Promise<Services> {
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

export async function createNodeServices(): Promise<NodeRuntimeServices> {
    const objectStorage = parseNodeObjectStorageConfig();
    const database = parseNodeDatabaseConfig(process.env, {
        path: SQLITE_DATABASE_PATH
    });
    ensureRuntimeDirectories(objectStorage.type === 'filesystem');
    const { database: connection, core, story } = createNodeRepositories(database);
    try {
        await initializeNodeRepositories(core, story);
        const filesystemRoots = {
            publicDir: PUBLIC_DIR,
            uploadsDir: UPLOADS_DIR,
            chronicleDir: EVENT_BASE,
            storyDataDir: STORY_DATA_DIR
        };
        const objectStorageInfrastructure = await createNodeObjectStorage(
            objectStorage,
            filesystemRoots,
            connection
        );
        return {
            auth: core,
            audit: core,
            news: core,
            events: core,
            namecards: core,
            reactions: core,
            sitePackages: core,
            story,
            ...objectStorageInfrastructure,
            images: new SharpImageProcessor(),
            staticAssets: new FrontendStaticAssets(
                new NodeStaticAssets(PUBLIC_DIR),
                new Set(listFrontendFiles(PUBLIC_DIR))
            ),
            uploads: new StreamingUploadParser(),
            idempotency: new FilesystemIdempotencyStore(IDEMPOTENCY_DIR),
            rateLimiter: new MemoryRateLimiter(),
            passwords: new BcryptPasswordVerifier(),
            tokens: new HmacTokenService(SECRET_KEY),
            fetch: globalThis.fetch,
            config: {
                cookieSecure: COOKIE_OPTIONS.secure,
                storyMaxUploadBytes: STORY_MAX_UPLOAD_BYTES,
                sitePackageMaxUploadBytes: SITE_PACKAGE_MAX_UPLOAD_BYTES,
                siteOrigin: SITE_ORIGINS.siteOrigin,
                clientAddressSource: CLIENT_ADDRESS_SOURCE
            }
        };
    } catch (error) {
        await Promise.allSettled([story.close(), core.close()]);
        throw error;
    }
}

const lifecycle = createNodeServiceLifecycle(createNodeServices);

export function resolveNodeServices(): Promise<NodeRuntimeServices> {
    return lifecycle.resolve();
}

export async function closeNodeServices(): Promise<void> {
    await lifecycle.close();
}
