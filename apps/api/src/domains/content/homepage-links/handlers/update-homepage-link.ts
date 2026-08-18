import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import {
    type HomepageLinkIdParams,
    type HomepageLinkUpdateRequest
} from '@/domains/content/homepage-links/request';
import {
    toHomepageLinkResponse,
    type HomepageLinkErrorResponse,
    type HomepageLinkUpsertResponse
} from '@/domains/content/homepage-links/response';
import { homepageLinkRepository } from '@/domains/content/homepage-links/link-payload';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

type UpdateHomepageLinkContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'json', HomepageLinkUpdateRequest>
    & ValidatedRequestInput<'param', HomepageLinkIdParams>
>;

export async function handleUpdateHomepageLink(
    c: UpdateHomepageLinkContext
): Promise<Response> {
    try {
        const submission = c.req.valid('json');
        const { id } = c.req.valid('param');
        const updated = await homepageLinkRepository(c).updateHomepageLink(id, {
            title: submission.title,
            description: submission.description,
            href: submission.href,
            icon: submission.icon,
            accent: submission.accent,
            updatedAt: Date.now()
        });
        if (!updated) {
            return c.json({
                error: '首页链接不存在'
            } satisfies HomepageLinkErrorResponse, 404);
        }
        await writeAudit(c, '更新首页链接', `${updated.section}:${updated.title}`);
        return c.json({
            success: true,
            link: toHomepageLinkResponse(updated)
        } satisfies HomepageLinkUpsertResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to update homepage link', error);
        return c.json({
            error: status >= 500 ? '首页链接保存失败' : messageFromError(error)
        } satisfies HomepageLinkErrorResponse, status as 400 | 500);
    }
}
