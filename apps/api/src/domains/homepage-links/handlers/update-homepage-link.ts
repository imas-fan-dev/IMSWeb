import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import {
    publicHomepageLink,
    type HomepageLinkSubmission
} from '@/domains/homepage-links/data';
import { homepageLinkRepository } from '@/domains/homepage-links/handler-support';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleUpdateHomepageLink(
    c: ValidatedRequestContext<AppEnvironment, 'json', HomepageLinkSubmission>
): Promise<Response> {
    try {
        const submission = c.req.valid('json');
        const id = c.req.param('id');
        if (!id) throw Object.assign(new Error('首页链接 ID 无效'), { status: 400 });
        const updated = await homepageLinkRepository(c).updateHomepageLink(id, {
            title: submission.title,
            description: submission.description,
            href: submission.href,
            icon: submission.icon,
            accent: submission.accent,
            updatedAt: Date.now()
        });
        if (!updated) return c.json({ error: '首页链接不存在' }, 404);
        await writeAudit(c, '更新首页链接', `${updated.section}:${updated.title}`);
        return c.json({ success: true, link: publicHomepageLink(updated) });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to update homepage link', error);
        return c.json({ error: status >= 500 ? '首页链接保存失败' : messageFromError(error) },
            status as 400 | 500);
    }
}
