import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import { homepageLinkRepository } from '@/domains/homepage-links/handler-support';

export async function handleDeleteHomepageLink(c: Context<AppEnvironment>): Promise<Response> {
    const repository = homepageLinkRepository(c);
    const id = c.req.param('id');
    if (!id) return c.json({ error: '首页链接 ID 无效' }, 400);
    const current = await repository.findHomepageLinkById(id);
    if (!current) return c.json({ error: '首页链接不存在' }, 404);
    if (!await repository.deleteHomepageLink(current.id)) {
        return c.json({ error: '首页链接已被其他管理员删除' }, 409);
    }
    await writeAudit(c, '删除首页链接', `${current.section}:${current.title}`);
    return c.json({ success: true });
}
