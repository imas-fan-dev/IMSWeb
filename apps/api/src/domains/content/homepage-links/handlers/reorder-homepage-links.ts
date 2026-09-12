import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import { homepageLinkRepository } from '@/domains/content/homepage-links/link-payload';
import type {
    HomepageLinkOrderRequest,
    HomepageLinkSectionParams
} from '@/domains/content/homepage-links/request';
import type {
    HomepageLinkErrorResponse,
    HomepageLinkMutationResponse
} from '@/domains/content/homepage-links/response';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

type ReorderHomepageLinksContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'json', HomepageLinkOrderRequest>
    & ValidatedRequestInput<'param', HomepageLinkSectionParams>
>;

export async function handleReorderHomepageLinks(
    c: ReorderHomepageLinksContext
): Promise<Response> {
    try {
        const { section } = c.req.valid('param');
        const { ids } = c.req.valid('json');
        const repository = homepageLinkRepository(c);
        const current = await repository.listHomepageLinks(section);
        if (current.length !== ids.length || current.some((link) => !ids.includes(link.id))) {
            throw Object.assign(new Error('链接列表已变化，请刷新后重新排序'), { status: 409 });
        }
        if (!await repository.reorderHomepageLinks(section, ids, Date.now())) {
            throw Object.assign(new Error('链接列表已变化，请刷新后重新排序'), { status: 409 });
        }
        await writeAudit(c, '调整首页链接顺序', section);
        return c.json({ success: true } satisfies HomepageLinkMutationResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to reorder homepage links', error);
        return c.json({
            error: status >= 500 ? '首页链接排序失败' : messageFromError(error)
        } satisfies HomepageLinkErrorResponse, status as 400 | 409 | 500);
    }
}
