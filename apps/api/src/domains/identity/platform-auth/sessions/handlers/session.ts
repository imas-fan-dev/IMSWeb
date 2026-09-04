import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { platformSessionPayload } from '@/domains/identity/platform-auth/contracts/session';

export async function handlePlatformSession(c: Context<AppEnvironment>): Promise<Response> {
    return c.json(await platformSessionPayload(c, c.get('platformAccount')!));
}
