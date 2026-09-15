import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { homepageLinkRepository } from '@/domains/content/homepage-links/link-payload';
import type { HomepageLinkIdParams } from '@/domains/content/homepage-links/request';
import type {
    HomepageLinkErrorResponse,
    HomepageLinkMutationResponse
} from '@/domains/content/homepage-links/response';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleDeleteHomepageLink(
    c: ValidatedRequestContext<AppEnvironment, 'param', HomepageLinkIdParams>
): Promise<Response> {
    const repository = homepageLinkRepository(c);
    const { id } = c.req.valid('param');
    const current = await repository.findHomepageLinkById(id);
    if (!current) {
        return c.json({ error: '首页链接不存在' } satisfies HomepageLinkErrorResponse, 404);
    }
    if (!await repository.deleteHomepageLink(current.id)) {
        return c.json({
            error: '首页链接已被其他管理员删除'
        } satisfies HomepageLinkErrorResponse, 409);
    }
    await writeAudit(c, '删除首页链接', `${current.section}:${current.title}`);
    return c.json({ success: true } satisfies HomepageLinkMutationResponse);
}
