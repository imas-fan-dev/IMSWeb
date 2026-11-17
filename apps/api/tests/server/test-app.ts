/**
 * Shared Hono app assembly for API server tests.
 *
 * The production composition root stays in `@/app`: this helper only removes
 * the repeated `createHonoApp(() => services)` wrapper and the repeated
 * `http://ims.test` request origin from test bodies. It is a drop-in for the
 * existing calls, so it returns the same `ImsHonoApp`.
 */
import {
    createHonoApp,
    type CreateHonoAppOptions,
    type ImsHonoApp,
} from '@/app';
import type { RuntimeServices } from '@/ports/runtime-services';

export const TEST_ORIGIN = 'http://ims.test';

export function createTestApp(
    services: RuntimeServices | (() => RuntimeServices),
    options?: CreateHonoAppOptions,
): ImsHonoApp {
    const resolveServices =
        typeof services === 'function' ? services : () => services;
    return createHonoApp(resolveServices, options);
}

export async function testRequest(
    app: ImsHonoApp,
    path: string,
    init?: RequestInit,
): Promise<Response> {
    const target = path.startsWith('http') ? path : `${TEST_ORIGIN}${path}`;
    return app.request(target, init);
}
