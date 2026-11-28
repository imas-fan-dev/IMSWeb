import type { Context } from 'hono';
import type { AdminPrivacyPolicySnapshot } from '@imsweb/contracts/privacy-policy';
import type { AppEnvironment } from '@/app';
import { readPrivacyPolicyContent } from '@/domains/content/privacy-policy/content-store';
import { defaultPrivacyPolicyDraft } from '@/domains/content/privacy-policy/data';
import { services } from '@/middleware/hono-context';

export async function handleGetAdminPrivacyPolicy(
    c: Context<AppEnvironment>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { content, revision } = await readPrivacyPolicyContent(storage);
    return c.json({
        content: content ?? { ...defaultPrivacyPolicyDraft(), updatedAt: null },
        revision
    } satisfies AdminPrivacyPolicySnapshot);
}
