import type { AppEnvironment } from "@/app";
import type { RandomOwnerlessCard } from "@imsweb/contracts/namecards";
import { services } from "@/middleware/hono-context";
import type { Context } from "hono";

/**
 * 抽一张缺少企划的无主名片：优先没人补充过的，其次随机。
 * 前端拿编号走 `?card=` 深链，认领/补充按钮就在那张卡的详情里。
 */
export async function handleGetRandomOwnerlessCard(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const repository = services(c).fudaba;
    const cardNumber = repository
        ? await repository.randomOwnerlessCardMissingSeries(
              c.get("platformUser")?.id ?? null,
          )
        : null;
    if (cardNumber === null) {
        return c.json(
            { success: false, code: "FUDABA_NO_OWNERLESS_CARD" },
            404,
        );
    }
    return c.json({ cardNumber } satisfies RandomOwnerlessCard);
}
