import type { CacheServices } from '@/ports/cache';
import type { HttpServices } from '@/ports/http';
import type { MediaServices } from '@/ports/media';
import type { ObjectStorageServices } from '@/ports/object-storage';
import type { RepositoryServices } from '@/ports/repositories';
import type { SecurityServices } from '@/ports/security';

export interface NodeRuntimeConfig {
    cookieSecure: boolean;
    storyMaxUploadBytes: number;
    sitePackageMaxUploadBytes: number;
    siteOrigin: string;
    clientAddressSource: 'direct' | 'nginx';
}

export interface RuntimeServices extends
    Partial<CacheServices>,
    Partial<HttpServices>,
    Partial<MediaServices>,
    Partial<ObjectStorageServices>,
    Partial<RepositoryServices>,
    Partial<SecurityServices> {
    fetch?: typeof globalThis.fetch;
    config?: Partial<NodeRuntimeConfig>;
}

export interface NodeRuntimeServices extends
    CacheServices,
    HttpServices,
    MediaServices,
    ObjectStorageServices,
    RepositoryServices,
    SecurityServices {
    fetch: typeof globalThis.fetch;
    config: NodeRuntimeConfig;
}

export type ResolveServices<Bindings extends object = Record<string, unknown>> = (
    env: Bindings
) => RuntimeServices | Promise<RuntimeServices>;
