import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import {
    type NewHomepageLinkRequest
} from '@/domains/homepage-links/request';
import {
    toHomepageLinkResponse,
    type HomepageLinkErrorResponse,
    type HomepageLinkUpsertResponse
} from '@/domains/homepage-links/response';
import { homepageLinkRepository } from '@/domains/homepage-links/handler-support';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleCreateHomepageLink(
    c: ValidatedRequestContext<AppEnvironment, 'json', NewHomepageLinkRequest>
): Promise<Response> {
    try {
        const submission = c.req.valid('json');
        const now = Date.now();
        const created = await homepageLinkRepository(c).createHomepageLink({
            id: `home-${now.toString(36)}-${randomHex(6)}`,
            section: submission.section,
            title: submission.title,
            description: submission.description,
            href: submission.href,
            icon: submission.icon,
            accent: submission.accent,
            createdAt: now
        });
        await writeAudit(c, '新增首页链接', `${created.section}:${created.title}`);
        return c.json({
            success: true,
            link: toHomepageLinkResponse(created)
        } satisfies HomepageLinkUpsertResponse, 201);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to create homepage link', error);
        return c.json({
            error: status >= 500 ? '首页链接保存失败' : messageFromError(error)
        } satisfies HomepageLinkErrorResponse, status as 400 | 500);
    }
}
