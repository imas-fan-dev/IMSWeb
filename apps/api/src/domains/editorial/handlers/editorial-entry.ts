import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';

// The editorial route module keeps the shared validation helpers together;
// this named handler is also the stable action boundary for future extraction.
export function handleEditorialEntry(_c: Context<AppEnvironment>): Response {
    return new Response(null, { status: 204 });
}
