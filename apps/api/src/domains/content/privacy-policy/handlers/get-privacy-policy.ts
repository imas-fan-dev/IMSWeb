import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { readPrivacyPolicyContent } from '@/domains/content/privacy-policy/content-store';
import { defaultPrivacyPolicyDraft } from '@/domains/content/privacy-policy/data';
import type { PrivacyPolicyPublicContentResponse } from '@/domains/content/privacy-policy/response';
import { services } from '@/middleware/hono-context';

export async function handleGetPrivacyPolicy(c: Context<AppEnvironment>): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { content } = await readPrivacyPolicyContent(storage);
    const policy = content
        ? (content.enabled ? content : null)
        : { ...defaultPrivacyPolicyDraft(), updatedAt: null };
    c.header('Cache-Control', 'no-cache');
    return c.json({ policy } satisfies PrivacyPolicyPublicContentResponse);
}
