import type { AppEnvironment } from "@/app";
import { resolveNamecardThumbnailUrl } from "@/domains/community/fudaba/card-media-assets";
import { parseNamecardPage } from "@/domains/community/namecards/request";
import { toPublicNamecardResponse } from "@/domains/community/namecards/response";
import { services } from "@/middleware/hono-context";
import type { ValidatedRequestContext } from "@/middleware/request-validation";
import { resolvePublicMediaUrl } from "@/utils/storage/public-object-url";

/**
 * 用户主页下半部分：这个人自己持有的、已发布且允许展示的名片。
 * 排序与管理界面一致（按名片编号倒序），后续再支持自定义顺序与分组。
 */
export async function handleListProfileCards(
    c: ValidatedRequestContext<
        AppEnvironment,
        "param",
        { accountId: string }
    >,
): Promise<Response> {
    const { accountId } = c.req.valid("param");
    const { page, size } = parseNamecardPage(c.req.url);
    const repository = services(c).namecards;
    if (!repository) {
        return c.json({ list: [], total: 0, totalPage: 0 });
    }
    const total = await repository.countOwnedPublishedCards(accountId);
    const rows = await repository.listOwnedPublishedCards(
        accountId,
        size,
        (page - 1) * size,
    );
    const storage = services(c).storage;
    const list = await Promise.all(
        rows.map(async (card) => {
            const response = toPublicNamecardResponse(card, null);
            const image1Url = storage
                ? await resolvePublicMediaUrl(storage, response.image1_url)
                : response.image1_url;
            const image2Url =
                response.image2_url === null
                    ? null
                    : storage
                      ? await resolvePublicMediaUrl(storage, response.image2_url)
                      : response.image2_url;
            const thumb = async (source: string, url: string) =>
                storage
                    ? resolveNamecardThumbnailUrl(storage, source, url)
                    : url;
            return {
                ...response,
                image1_url: image1Url,
                image2_url: image2Url,
                image1_thumbnail_url: await thumb(
                    response.image1_url,
                    image1Url,
                ),
                image2_thumbnail_url:
                    image2Url === null
                        ? null
                        : await thumb(
                              response.image2_url as string,
                              image2Url,
                          ),
            };
        }),
    );
    return c.json({
        list,
        total,
        totalPage: size > 0 ? Math.ceil(total / size) : 0,
    });
}
