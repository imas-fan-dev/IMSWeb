import type { CoreRepository } from '@/ports/core-repository';
import type { CompensationService } from '@/ports/compensation-service';
import type { ImageProcessor } from '@/ports/image-processor';
import type { IdempotencyStore } from '@/ports/idempotency-store';
import type { ObjectStorage } from '@/ports/object-storage';
import type { RateLimiter } from '@/ports/rate-limiter';
import type { PasswordVerifier, TokenService } from '@/ports/security';
import type { StaticAssets } from '@/ports/static-assets';
import type { StoryRepository } from '@/ports/story-repository';
import type { UploadParser } from '@/ports/upload-parser';

export interface RuntimeServices {
    core?: CoreRepository;
    compensation?: CompensationService;
    story?: StoryRepository;
    storage?: ObjectStorage;
    images?: ImageProcessor;
    idempotency?: IdempotencyStore;
    passwords?: PasswordVerifier;
    tokens?: TokenService;
    rateLimiter?: RateLimiter;
    staticAssets?: StaticAssets;
    uploads?: UploadParser;
    fetch?: typeof globalThis.fetch;
    config?: {
        cookieSecure?: boolean;
        storyMaxUploadBytes?: number;
        clientAddressSource?: 'nginx' | 'cloudflare';
    };
}

export type ResolveServices<Bindings extends object = Record<string, unknown>> = (
    env: Bindings
) => RuntimeServices | Promise<RuntimeServices>;
