import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { CatalogBirthdays } from '@imsweb/contracts/catalog';
import { catalogRepository } from '@/middleware/hono-context';
import { birthdayProjection } from '@/domains/content/birthdays/birthday-projection';

export async function handleListBirthdays(
    c: Context<AppEnvironment>,
): Promise<Response> {
    c.header('Cache-Control', 'no-cache');
    const payload: CatalogBirthdays = birthdayProjection(
        await catalogRepository(c).listBirthdayProfiles(),
    );
    return c.json(payload);
}
