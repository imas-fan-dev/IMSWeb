import bcrypt from 'bcryptjs';
import type { PasswordVerifier } from '@/ports/security';
import type { RuntimeServices } from '@/ports/runtime-services';
import type { StaticAssets } from '@/ports/static-assets';
import { HmacTokenService } from '@/adapters/shared/hmac-token-service';
import { StandardUploadParser } from '@/adapters/shared/standard-upload-parser';
import { CloudflareImageProcessor } from '@/adapters/cloudflare/cloudflare-image-processor';
import { D1CoreRepository } from '@/adapters/cloudflare/d1-core-repository';
import { D1CompensationService } from '@/adapters/cloudflare/d1-compensation-service';
import { D1IdempotencyStore } from '@/adapters/cloudflare/d1-idempotency-store';
import { D1RateLimiter } from '@/adapters/cloudflare/d1-rate-limiter';
import { D1StoryRepository } from '@/adapters/cloudflare/d1-story-repository';
import { R2ObjectStorage } from '@/adapters/cloudflare/r2-object-storage';
import type { WorkerBindings } from '@/adapters/cloudflare/worker-bindings';

class BcryptJsPasswordVerifier implements PasswordVerifier {
    verify(value: string, digest: string): Promise<boolean> {
        return bcrypt.compare(value, digest);
    }
}

class WorkerStaticAssets implements StaticAssets {
    constructor(private readonly assets: Fetcher) {}

    fetch(request: Request): Promise<Response> {
        return this.assets.fetch(request);
    }
}

export function createCloudflareServices(env: WorkerBindings): RuntimeServices {
    if (!env.IMS_JWT_SECRET) throw new Error('IMS_JWT_SECRET binding is required');
    if (new TextEncoder().encode(env.IMS_JWT_SECRET).byteLength < 32) {
        throw new Error('IMS_JWT_SECRET must be at least 32 UTF-8 bytes');
    }
    const compensation = new D1CompensationService(env.CORE_DB, env.MEDIA_BUCKET);
    const storage = new R2ObjectStorage(env.CORE_DB, env.MEDIA_BUCKET, compensation);
    return {
        core: new D1CoreRepository(env.CORE_DB),
        compensation,
        story: new D1StoryRepository(env.STORY_DB),
        storage,
        images: new CloudflareImageProcessor(env.IMAGES),
        idempotency: new D1IdempotencyStore(env.CORE_DB),
        passwords: new BcryptJsPasswordVerifier(),
        tokens: new HmacTokenService(env.IMS_JWT_SECRET),
        rateLimiter: new D1RateLimiter(env.CORE_DB),
        staticAssets: new WorkerStaticAssets(env.ASSETS),
        uploads: new StandardUploadParser(),
        fetch: globalThis.fetch,
        config: {
            cookieSecure: true,
            storyMaxUploadBytes: 50 * 1024 * 1024,
            clientAddressSource: 'cloudflare'
        }
    };
}
