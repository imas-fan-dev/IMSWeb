import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';

export async function handleServeChronicleAdmin(c: Context<AppEnvironment>): Promise<Response> {
    return c.redirect('/admin/chronicle', 301);
}
