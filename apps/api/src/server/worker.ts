import { createHonoApp } from '@/app';
import { createCloudflareServices } from '@/adapters/cloudflare/cloudflare-services';
import { fetchFinalR2Object } from '@/adapters/cloudflare/r2-object-storage';
import type { WorkerBindings } from '@/adapters/cloudflare/worker-bindings';

const workerApp = createHonoApp<WorkerBindings>((env) => createCloudflareServices(env));

export { workerApp };

export default {
    async fetch(request: Request, env: WorkerBindings, ctx: ExecutionContext): Promise<Response> {
        const pathname = new URL(request.url).pathname;
        if (
            (request.method === 'GET' || request.method === 'HEAD') &&
            /^\/runninggame\/(?:Build|BuildMobile)\/[^/]+\.data$/.test(pathname)
        ) {
            const response = await fetchFinalR2Object(
                env.CORE_DB,
                env.MEDIA_BUCKET,
                `unity${pathname}`,
                request
            );
            return response || new Response('Not Found', { status: 404 });
        }
        return workerApp.fetch(request, env, ctx);
    }
} satisfies ExportedHandler<WorkerBindings>;
