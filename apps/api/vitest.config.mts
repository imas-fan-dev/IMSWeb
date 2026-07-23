import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src/server', import.meta.url))
        }
    },
    oxc: {
        jsx: {
            runtime: 'automatic',
            importSource: 'hono/jsx'
        }
    },
    plugins: [
        cloudflareTest(async () => ({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
                bindings: {
                    IMS_JWT_SECRET: 'worker-test-secret-at-least-32-bytes',
                    TEST_CORE_MIGRATIONS: await readD1Migrations(
                        `${projectRoot}migrations/core`
                    ),
                    TEST_STORY_MIGRATIONS: await readD1Migrations(
                        `${projectRoot}migrations/story`
                    )
                }
            }
        }))
    ],
    test: {
        include: ['tests/worker/**/*.test.ts'],
        testTimeout: 15_000,
        hookTimeout: 15_000
    }
});
