import "@/runtime/node-environment";
import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { NodeDatabaseConfig } from "@/config/database";
import type { NodeObjectStorageConfig } from "@/config/object-storage";
import type { CacheStore, RateLimiter } from "@/ports/cache";
import type {
    AdminAccountRepository,
    AuditRepository,
    BackofficeAuthRepository,
    EventRepository,
    FudabaRepository,
    HomepageLinkRepository,
    NamecardRepository,
    NewsRepository,
    PlatformAccountRepository,
    ReactionRepository,
    SitePackageRepository,
    StoryRepository,
} from "@/ports/repositories";
import type { ManagedSqlDatabase } from "@/infra/db/sql/database";
import type {
    CompensationService,
    ObjectStorage,
    ObjectStorageServices,
} from "@/ports/object-storage";
import type {
    NodeRuntimeServices,
    RuntimeServices,
} from "@/ports/runtime-services";
import {
    COMPENSATION_DIR,
    EVENT_BASE,
    PUBLIC_DIR,
    STORY_DATA_DIR,
    UPLOADS_DIR,
    ensureRuntimeDirectories,
} from "@/config/paths";
import {
    BACKOFFICE_JWT_SECRET,
    CLIENT_ADDRESS_SOURCE,
    COOKIE_OPTIONS,
    FUDABA_GEOCODING_CONFIG,
    FUDABA_MAP_ENABLED,
    FUDABA_MAP_STYLE_URLS,
    FUDABA_MAP_STYLE_URL,
    FUDABA_PUBLIC_READ_ENABLED,
    FUDABA_WRITE_ENABLED,
    IS_PRODUCTION,
    LEGACY_BACKOFFICE_JWT_SECRET,
    PLATFORM_JWT_SECRET,
    SITE_PACKAGE_MAX_UPLOAD_BYTES,
    STORY_MAX_UPLOAD_BYTES,
    SUPER_ADMIN_USERNAME,
} from "@/config/env";
import { parseNodeObjectStorageConfig } from "@/config/object-storage";
import { parseNodeDatabaseConfig } from "@/config/database";
import { parsePlatformEmailConfig } from "@/config/platform-email";
import { parseNodeCacheConfig } from "@/config/cache";
import { MemoryCache } from "@/infra/cache/memory/cache";
import { MemoryRateLimiter } from "@/infra/cache/memory/rate-limiter";
import { PostgresqlIdempotencyStore } from "@/infra/cache/postgresql/idempotency-store";
import { createValkeyClient, ValkeyCache } from "@/infra/cache/valkey/cache";
import { ValkeyRateLimiter } from "@/infra/cache/valkey/rate-limiter";
import { PostgresConnection } from "@/infra/db/postgresql/connection";
import { PostgresqlSchemaStrategy } from "@/infra/db/postgresql/schema-strategy";
import { SqlAdminAccountRepository } from "@/infra/db/repositories/admin-account-repository";
import { SqlAuditRepository } from "@/infra/db/repositories/audit-repository";
import { SqlBackofficeAuthRepository } from "@/infra/db/repositories/backoffice-auth-repository";
import { SqlCoreRepository } from "@/infra/db/repositories/core-repository";
import { SqlEventRepository } from "@/infra/db/repositories/event-repository";
import { SqlFudabaRepository } from "@/infra/db/repositories/fudaba-repository";
import { SqlHomepageLinkRepository } from "@/infra/db/repositories/homepage-link-repository";
import { SqlNewsRepository } from "@/infra/db/repositories/news-repository";
import { SqlPlatformAccountRepository } from "@/infra/db/repositories/platform-account-repository";
import { SqlReactionRepository } from "@/infra/db/repositories/reaction-repository";
import { SqlSitePackageRepository } from "@/infra/db/repositories/site-package-repository";
import { SqlStoryRepository } from "@/infra/db/repositories/story-repository";
import { StreamingUploadParser } from "@/infra/http/busboy/upload-parser";
import { FilesystemCompensationService } from "@/infra/oss/filesystem/compensation-service";
import {
    FilesystemObjectStorage,
    type FilesystemStorageRoots,
} from "@/infra/oss/filesystem/object-storage";
import {
    FrontendStaticAssets,
    listFrontendFiles,
    NodeStaticAssets,
} from "@/infra/http/filesystem/static-assets";
import { PostgresqlObjectDeletionWorker } from "@/infra/db/postgresql/object-deletion-worker";
import { S3CompensationService } from "@/infra/oss/s3/compensation-service";
import { S3ObjectStorage } from "@/infra/oss/s3/object-storage";
import { S3UploadStateMachine } from "@/infra/oss/s3/upload-state-machine";
import { SharpImageProcessor } from "@/infra/media/sharp/image-processor";
import { BcryptPasswordVerifier } from "@/infra/security/bcrypt/password-verifier";
import { parsePlatformOAuthConfig } from "@/config/platform-oauth";
import { createPlatformEmailSender } from "@/infra/email/cloudflare/platform-email-sender";
import { ConfiguredPlatformOAuthClient } from "@/infra/oauth/platform-oauth-client";
import { PlatformOAuthSecretCipher } from "@/infra/oauth/platform-oauth-secrets";
import { HmacBackofficeTokenService } from "@/infra/security/hmac/token-service";
import { HmacPlatformTokenService } from "@/infra/security/hmac/platform-token-service";
import { NodeObjectCleanupRunner } from "@/runtime/node-object-cleanup-runner";

interface InitializableResource {
    initialize(): Promise<void>;
    close(): Promise<void>;
}

interface CoreRepositoryAdapter
    extends InitializableResource, NamecardRepository {}

interface StoryRepositoryAdapter
    extends InitializableResource, StoryRepository {}

interface PlatformAccountRepositoryAdapter
    extends InitializableResource, PlatformAccountRepository {}

interface FudabaRepositoryAdapter
    extends InitializableResource, FudabaRepository {}

interface NodeRepositories {
    database: ManagedSqlDatabase;
    core: CoreRepositoryAdapter;
    backofficeAuth: BackofficeAuthRepository;
    adminAccounts: AdminAccountRepository;
    audit: AuditRepository;
    news: NewsRepository;
    events: EventRepository;
    reactions: ReactionRepository;
    homepageLinks: HomepageLinkRepository;
    sitePackages: SitePackageRepository;
    platform: PlatformAccountRepositoryAdapter;
    fudaba: FudabaRepositoryAdapter;
    story: StoryRepositoryAdapter;
}

export function validateFudabaPublicReadStorage(
    enabled: boolean,
    config: NodeObjectStorageConfig,
): void {
    if (!enabled) return;
    if (config.type !== "s3") {
        throw new Error(
            "IMS_OBJECT_STORAGE=s3 is required when " +
                "IMS_FUDABA_PUBLIC_READ_ENABLED=true",
        );
    }
    if (!config.publicReadUrlBase) {
        throw new Error(
            "IMS_PUBLIC_READ_URL_BASE is required when " +
                "IMS_FUDABA_PUBLIC_READ_ENABLED=true",
        );
    }
}

interface NodeCacheServices {
    cache: CacheStore;
    rateLimiter: RateLimiter;
}

async function createNodeCacheServices(
    config: ReturnType<typeof parseNodeCacheConfig>,
): Promise<NodeCacheServices> {
    if (config.backend === "valkey") {
        const client = await createValkeyClient(config);
        return {
            cache: new ValkeyCache(client, { keyPrefix: config.keyPrefix }),
            rateLimiter: new ValkeyRateLimiter(client, {
                keyPrefix: config.keyPrefix,
            }),
        };
    }
    return { cache: new MemoryCache(), rateLimiter: new MemoryRateLimiter() };
}

function createNodeRepositories(config: NodeDatabaseConfig): NodeRepositories {
    const database = PostgresConnection.create(config);
    const schema = new PostgresqlSchemaStrategy();
    return {
        database,
        core: new SqlCoreRepository(database, schema),
        backofficeAuth: new SqlBackofficeAuthRepository(database),
        adminAccounts: new SqlAdminAccountRepository(database),
        audit: new SqlAuditRepository(database),
        news: new SqlNewsRepository(database),
        events: new SqlEventRepository(database),
        reactions: new SqlReactionRepository(database),
        homepageLinks: new SqlHomepageLinkRepository(database),
        sitePackages: new SqlSitePackageRepository(database),
        platform: new SqlPlatformAccountRepository(database, schema),
        fudaba: new SqlFudabaRepository(database, schema),
        story: new SqlStoryRepository(database, schema),
    };
}

async function createNodeObjectStorage(
    config: NodeObjectStorageConfig,
    filesystemRoots: FilesystemStorageRoots,
    database: ManagedSqlDatabase,
): Promise<ObjectStorageServices> {
    if (config.type === "filesystem") {
        const storage = new FilesystemObjectStorage(filesystemRoots, {
            publicReadUrlBase: config.publicReadUrlBase,
        });
        return createNodeObjectStorageServices(
            database,
            storage,
            new FilesystemCompensationService(COMPENSATION_DIR),
        );
    }
    const client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
    });
    const signingClient = config.publicEndpoint
        ? new S3Client({
              region: config.region,
              endpoint: config.publicEndpoint,
              forcePathStyle: config.forcePathStyle,
          })
        : client;
    const options = {
        bucket: config.bucket,
        publicReadUrlBase: config.publicReadUrlBase,
        prefix: config.prefix,
        readUrlTtlSeconds: config.readUrlTtlSeconds,
    };
    const state = new S3UploadStateMachine(database);
    try {
        await state.initialize();
    } catch (error) {
        client.destroy();
        if (signingClient !== client) signingClient.destroy();
        throw error;
    }
    let storage: S3ObjectStorage;
    const compensation = new S3CompensationService(
        database,
        state,
        (objectId, physicalKey, storageScope) =>
            storage.deletePhysicalObject(objectId, physicalKey, storageScope),
    );
    storage = new S3ObjectStorage(
        client,
        options,
        (command, expiresIn) =>
            getSignedUrl(signingClient, command, { expiresIn }),
        state,
        compensation,
        signingClient === client ? undefined : signingClient,
    );
    return createNodeObjectStorageServices(database, storage, compensation);
}

function createNodeObjectStorageServices(
    database: ManagedSqlDatabase,
    storage: ObjectStorage,
    compensation: CompensationService,
): ObjectStorageServices {
    const objectDeletions = new PostgresqlObjectDeletionWorker(
        database,
        storage,
    );
    const objectCleanup = new NodeObjectCleanupRunner(
        objectDeletions,
        compensation,
        storage,
    );
    objectCleanup.start();
    return { compensation, objectCleanup, objectDeletions, storage };
}

export async function initializeNodeRepositories(
    ...repositories: InitializableResource[]
): Promise<void> {
    try {
        for (const repository of repositories) await repository.initialize();
    } catch (error) {
        const reverseOrdered = Array.from(
            { length: repositories.length },
            (_, index) => repositories[repositories.length - index - 1],
        );
        await Promise.allSettled(
            reverseOrdered.map((repository) => repository.close()),
        );
        throw error;
    }
}

async function closeRuntimeServices(services: RuntimeServices): Promise<void> {
    const backofficeAuth = services.backofficeAuth as
        | (BackofficeAuthRepository & Partial<InitializableResource>)
        | undefined;
    // SqlCoreRepository remains the database lifecycle owner until the
    // Namecard capability is extracted.
    const core = services.namecards as
        | (NamecardRepository & Partial<InitializableResource>)
        | undefined;
    const story = services.story as
        | (StoryRepository & Partial<InitializableResource>)
        | undefined;
    const platform = services.platformAccounts as
        | (PlatformAccountRepository & Partial<InitializableResource>)
        | undefined;
    const fudaba = services.fudaba as
        | (FudabaRepository & Partial<InitializableResource>)
        | undefined;
    const cleanupResults = await Promise.allSettled(
        services.objectCleanup ? [services.objectCleanup.close()] : [],
    );
    const resourceResults = await Promise.allSettled(
        [
            services.cache?.close
                ? Promise.resolve().then(() => services.cache?.close?.())
                : undefined,
            services.storage?.close
                ? Promise.resolve().then(() => services.storage?.close?.())
                : undefined,
            story?.close?.(),
            fudaba?.close?.(),
            platform?.close?.(),
            backofficeAuth?.close?.(),
            core?.close?.(),
        ].filter((operation): operation is Promise<void> => Boolean(operation)),
    );
    const failures = [...cleanupResults, ...resourceResults].filter(
        (result): result is PromiseRejectedResult =>
            result.status === "rejected",
    );
    if (failures.length)
        throw new AggregateError(
            failures.map((result) => result.reason),
            "Failed to close Node services",
        );
}

export function createNodeServiceLifecycle<Services extends RuntimeServices>(
    factory: () => Promise<Services>,
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
        },
    };
}

export async function createNodeServices(): Promise<NodeRuntimeServices> {
    const objectStorage = parseNodeObjectStorageConfig();
    validateFudabaPublicReadStorage(FUDABA_PUBLIC_READ_ENABLED, objectStorage);
    const database = parseNodeDatabaseConfig(process.env);
    const cacheConfig = parseNodeCacheConfig();
    const platformEmailSender = createPlatformEmailSender(
        parsePlatformEmailConfig(),
        globalThis.fetch,
    );
    const platformOAuthConfig = parsePlatformOAuthConfig();
    ensureRuntimeDirectories(objectStorage.type === "filesystem");
    const {
        database: connection,
        core,
        backofficeAuth,
        adminAccounts,
        audit,
        news,
        events,
        reactions,
        homepageLinks,
        sitePackages,
        platform,
        fudaba,
        story,
    } = createNodeRepositories(database);
    let cacheServices: NodeCacheServices | undefined;
    let objectStorageInfrastructure: ObjectStorageServices | undefined;
    try {
        await initializeNodeRepositories(core, platform, fudaba, story);
        if (IS_PRODUCTION || SUPER_ADMIN_USERNAME) {
            await adminAccounts.ensureSuperAdmin(SUPER_ADMIN_USERNAME);
        }
        const platformOAuth = new ConfiguredPlatformOAuthClient(
            platformOAuthConfig,
            platform,
            new PlatformOAuthSecretCipher(PLATFORM_JWT_SECRET),
            globalThis.fetch,
        );
        cacheServices = await createNodeCacheServices(cacheConfig);
        const cache = cacheServices.cache;
        const filesystemRoots = {
            publicDir: PUBLIC_DIR,
            uploadsDir: UPLOADS_DIR,
            chronicleDir: EVENT_BASE,
            storyDataDir: STORY_DATA_DIR,
        };
        objectStorageInfrastructure = await createNodeObjectStorage(
            objectStorage,
            filesystemRoots,
            connection,
        );
        return {
            backofficeAuth,
            adminAccounts,
            platformAccounts: platform,
            fudaba,
            audit,
            news,
            events,
            namecards: core,
            reactions,
            homepageLinks,
            sitePackages,
            story,
            ...objectStorageInfrastructure,
            cache,
            images: new SharpImageProcessor(),
            staticAssets: new FrontendStaticAssets(
                new NodeStaticAssets(PUBLIC_DIR),
                new Set(listFrontendFiles(PUBLIC_DIR)),
            ),
            uploads: new StreamingUploadParser(),
            idempotency: new PostgresqlIdempotencyStore(connection),
            rateLimiter: cacheServices.rateLimiter,
            health: {
                async check() {
                    await connection
                        .prepare("SELECT 1 AS ready")
                        .first("ready");
                    await cache.ping();
                },
            },
            passwords: new BcryptPasswordVerifier(),
            platformEmailSender,
            platformOAuth,
            backofficeTokens: new HmacBackofficeTokenService(
                BACKOFFICE_JWT_SECRET,
                LEGACY_BACKOFFICE_JWT_SECRET,
            ),
            platformTokens: new HmacPlatformTokenService(PLATFORM_JWT_SECRET),
            fetch: globalThis.fetch,
            config: {
                cookieSecure: COOKIE_OPTIONS.secure,
                storyMaxUploadBytes: STORY_MAX_UPLOAD_BYTES,
                sitePackageMaxUploadBytes: SITE_PACKAGE_MAX_UPLOAD_BYTES,
                clientAddressSource: CLIENT_ADDRESS_SOURCE,
                fudabaPublicReadEnabled: FUDABA_PUBLIC_READ_ENABLED,
                fudabaWriteEnabled: FUDABA_WRITE_ENABLED,
                fudabaMapEnabled: FUDABA_MAP_ENABLED,
                fudabaMapStyleUrl: FUDABA_MAP_STYLE_URL,
                fudabaMapStyleUrls: FUDABA_MAP_STYLE_URLS,
                fudabaGeocoding: FUDABA_GEOCODING_CONFIG,
            },
        };
    } catch (error) {
        await Promise.allSettled(
            objectStorageInfrastructure
                ? [objectStorageInfrastructure.objectCleanup.close()]
                : [],
        );
        await Promise.allSettled([
            objectStorageInfrastructure?.storage.close?.(),
            cacheServices?.cache.close(),
            story.close(),
            fudaba.close(),
            platform.close(),
            core.close(),
        ]);
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
