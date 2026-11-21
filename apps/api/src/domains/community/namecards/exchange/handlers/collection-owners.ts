import type { NamecardCollectionOwnersQueryContext } from '@/domains/community/namecards/exchange/request';
import type { NamecardCollectionOwnersResponse } from '@/domains/community/namecards/response';
import { platformProfileView } from '@/domains/identity/platform-profile/profile-view';
import { namecardRepository, services } from '@/middleware/hono-context';

/**
 * 所属用户选择器：只列自己与自己名册里出现过的卡主（卡行仍在、未锁定），
 * 按显示名搜索；不暴露全站账号目录。
 */
export async function handleListCollectionOwners(
    c: NamecardCollectionOwnersQueryContext,
): Promise<Response> {
    const query = c.req.valid('query');
    const owners = await namecardRepository(c).listCollectionOwners({
        accountId: c.get('platformUser')!.id,
        ...(query.q ? { q: query.q } : {}),
        limit: query.limit,
    });
    const storage = services(c).storage;
    const list = await Promise.all(
        owners.map(async (owner) => ({
            accountId: owner.account_id,
            uid: Number(owner.uid),
            displayName: owner.display_name,
            avatarUrl: (await platformProfileView(owner, storage)).avatarUrl,
        })),
    );
    return c.json({ list } satisfies NamecardCollectionOwnersResponse);
}
