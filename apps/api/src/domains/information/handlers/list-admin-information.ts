import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { readInformationIndex } from '@/domains/information/content-store';
import type { AdminInformationIndexResponse } from '@/domains/information/response';
import { services } from '@/middleware/hono-context';

export async function handleListAdminInformation(c: Context<AppEnvironment>): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { index } = await readInformationIndex(storage);
    return c.json(index satisfies AdminInformationIndexResponse);
}
