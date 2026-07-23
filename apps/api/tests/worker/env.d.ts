import type { D1Migration } from '@cloudflare/vitest-pool-workers';

declare global {
    namespace Cloudflare {
        interface Env {
            IMS_JWT_SECRET: string;
            TEST_CORE_MIGRATIONS: D1Migration[];
            TEST_STORY_MIGRATIONS: D1Migration[];
        }
    }
}

export {};
