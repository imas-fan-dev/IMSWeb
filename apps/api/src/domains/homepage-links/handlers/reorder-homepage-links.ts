import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import { parseHomepageLinkSection } from '@/domains/homepage-links/data';
import { homepageLinkRepository } from '@/domains/homepage-links/handler-support';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleReorderHomepageLinks(c: Context<AppEnvironment>): Promise<Response> {
    try {
        const section = parseHomepageLinkSection(c.req.param('section'));
        const body = await c.req.json() as { ids?: unknown };
        if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string')) {
            throw Object.assign(new Error('排序内容必须是链接 ID 列表'), { status: 400 });
        }
        const ids = body.ids as string[];
        if (new Set(ids).size !== ids.length) {
            throw Object.assign(new Error('排序内容包含重复链接'), { status: 400 });
        }
        const repository = homepageLinkRepository(c);
        const current = await repository.listHomepageLinks(section);
        if (current.length !== ids.length || current.some((link) => !ids.includes(link.id))) {
            throw Object.assign(new Error('链接列表已变化，请刷新后重新排序'), { status: 409 });
        }
        if (!await repository.reorderHomepageLinks(section, ids, Date.now())) {
            throw Object.assign(new Error('链接列表已变化，请刷新后重新排序'), { status: 409 });
        }
        await writeAudit(c, '调整首页链接顺序', section);
        return c.json({ success: true });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to reorder homepage links', error);
        return c.json({ error: status >= 500 ? '首页链接排序失败' : messageFromError(error) },
            status as 400 | 409 | 500);
    }
}
