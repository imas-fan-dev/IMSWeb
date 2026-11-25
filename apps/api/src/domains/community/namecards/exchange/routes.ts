import {
    namecardCardLayoutRequestSchema,
    namecardCollectionEntryParamsSchema,
    namecardCollectionOwnersQuerySchema,
    namecardCollectionQuerySchema,
    namecardCollectionVisibilitySchema,
    namecardExchangeAccountParamsSchema,
    namecardExchangeCardParamsSchema,
    namecardExchangeCommitSchema,
    namecardExchangeGiftSchema,
    namecardExchangeHandleParamsSchema,
    namecardExchangeHistoryQuerySchema,
    namecardExchangeIdParamsSchema,
    namecardExchangeSlugParamsSchema,
    namecardQuickCandidatesQuerySchema,
    namecardQuickSelectionSchema,
    namecardScanSessionRequestSchema,
    namecardScanTokenParamsSchema,
    namecardTagCardParamsSchema,
    namecardTagSetRequestSchema,
} from '@imsweb/contracts/namecards';
import {
    handleGetCardLayout,
    handlePutCardLayout,
} from '@/domains/community/namecards/exchange/handlers/card-layout';
import { handleGetCardShareLink } from '@/domains/community/namecards/exchange/handlers/card-share-link';
import { handleCommitCardShare } from '@/domains/community/namecards/exchange/handlers/commit-card-share';
import { handleCommitQuickExchange } from '@/domains/community/namecards/exchange/handlers/commit-quick-exchange';
import { handleGetCardShare } from '@/domains/community/namecards/exchange/handlers/get-card-share';
import { handleGetExchange } from '@/domains/community/namecards/exchange/handlers/get-exchange';
import { handleGetQuickExchange } from '@/domains/community/namecards/exchange/handlers/get-quick-exchange';
import { handleGiftCard } from '@/domains/community/namecards/exchange/handlers/gift-card';
import {
    handleGetQuickSettings,
    handlePutQuickSettings,
} from '@/domains/community/namecards/exchange/handlers/quick-settings';
import { handleRequestCard } from '@/domains/community/namecards/exchange/handlers/request-card';
import { handleReplaceNamecardTags } from '@/domains/community/namecards/exchange/handlers/replace-card-tags';
import {
    handleCommitScanSession,
    handleCreateScanSession,
    handleGetScanSessionStatus,
    handleScanSessionStream,
} from '@/domains/community/namecards/exchange/handlers/scan-sessions';
import { handleGetScanLandingStatus } from '@/domains/community/namecards/exchange/handlers/scan-landing';
import {
    handleListCollection,
    handleSetCollectionVisibility,
} from '@/domains/community/namecards/exchange/handlers/collection';
import { handleListCollectionOwners } from '@/domains/community/namecards/exchange/handlers/collection-owners';
import { handleListExchanges } from '@/domains/community/namecards/exchange/handlers/list-exchanges';
import {
    handleAcceptExchange,
    handleDeclineExchange,
} from '@/domains/community/namecards/exchange/handlers/decide-exchange';
import {
    activePlatformMutation,
    optionalPlatformAuth,
    platformAuth,
    platformCsrf,
} from '@/middleware/hono-auth';
import { platformWriteRateLimit } from '@/middleware/platform-mutation-limit';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator,
} from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from '@/routing/capability-router';

/** 交换要写两张表并记录通知，走与其它平台写操作相同的护栏。 */
const write = [platformAuth, activePlatformMutation, platformCsrf, platformWriteRateLimit] as const;

const slugParam = paramSchemaValidator(namecardExchangeSlugParamsSchema, {
    invalidMessage: '分享链接无效',
});
const handleParam = paramSchemaValidator(namecardExchangeHandleParamsSchema, {
    invalidMessage: '用户标识无效',
});
const cardParam = paramSchemaValidator(namecardExchangeCardParamsSchema, {
    invalidMessage: '名片编号无效',
});
const exchangeIdParam = paramSchemaValidator(namecardExchangeIdParamsSchema, {
    invalidMessage: '交换记录无效',
});
const scanTokenParam = paramSchemaValidator(namecardScanTokenParamsSchema, {
    invalidMessage: '二维码无效',
});
/** 公开落地页：形状不对与不存在必须是同一句话、同一个 404。 */
const scanLandingTokenParam = paramSchemaValidator(namecardScanTokenParamsSchema, {
    invalidMessage: '二维码无效或已失效',
    invalidStatus: 404,
});
const collectionEntryParam = paramSchemaValidator(namecardCollectionEntryParamsSchema, {
    invalidMessage: '名片编号无效',
});
const commitBody = jsonSchemaValidator(namecardExchangeCommitSchema, {
    invalidMessage: '交换参数无效',
});
const accountParam = paramSchemaValidator(namecardExchangeAccountParamsSchema, {
    invalidMessage: '用户标识无效',
});
const giftBody = jsonSchemaValidator(namecardExchangeGiftSchema, {
    invalidMessage: '送片参数无效',
});
const collectionQuery = querySchemaValidator(namecardCollectionQuerySchema, {
    invalidMessage: '名片册参数无效',
});
const collectionOwnersQuery = querySchemaValidator(
    namecardCollectionOwnersQuerySchema,
    { invalidMessage: '名片册参数无效' },
);
const exchangeHistoryQuery = querySchemaValidator(namecardExchangeHistoryQuerySchema, {
    invalidMessage: '分页参数无效',
});
const quickCandidatesQuery = querySchemaValidator(namecardQuickCandidatesQuerySchema, {
    invalidMessage: '目标用户标识无效',
});
/** 标签写入只要登录会话（设计明确），因此不从 `write` 继承 CSRF 等写护栏。 */
const tagWrite = [platformAuth] as const;

export function namecardExchangeRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();

    // 单卡分享：任何人可看，登录后才知道「我有几张某张他还没有」。
    routes.get('/exchange/card/:slug', optionalPlatformAuth, slugParam, handleGetCardShare);
    routes.post('/exchange/card/:slug/commit', ...write, slugParam, commitBody, handleCommitCardShare);

    // 墙上直接发起；快速交换页先看清单再一次收下。
    routes.post('/exchange/cards/:cardNumber/request', ...write, cardParam, commitBody, handleRequestCard);

    // 墙 / 详情窗的内联标签保存：登录用户可改任意名片的标签，匿名只读。
    // 标签即时生效，因此不受名片内容审核约束；设计只要求 `platformAuth`。
    routes.put(
        '/exchange/cards/:cardId/tags',
        ...tagWrite,
        paramSchemaValidator(namecardTagCardParamsSchema, {
            invalidMessage: '名片 ID 无效',
        }),
        jsonSchemaValidator(namecardTagSetRequestSchema, {
            invalidMessage: '标签无效',
        }),
        handleReplaceNamecardTags,
    );
    routes.get('/exchange/quick/:handle', optionalPlatformAuth, handleParam, handleGetQuickExchange);
    routes.post('/exchange/quick/:handle/commit', ...write, handleParam, commitBody, handleCommitQuickExchange);

    // 他人主页的单向送礼：直接放进对方名片册，对方无需确认也不收通知。
    routes.post(
        '/exchange/users/:accountId/gift',
        ...write,
        accountParam,
        giftBody,
        handleGiftCard,
    );

    // 自己的快速交换清单；带 `target` 时再叠一层目标视角（见 handler）。
    routes.get('/exchange/me/quick', platformAuth, quickCandidatesQuery, handleGetQuickSettings);
    routes.put(
        '/exchange/me/quick',
        ...write,
        jsonSchemaValidator(namecardQuickSelectionSchema, { invalidMessage: '清单参数无效' }),
        handlePutQuickSettings,
    );

    // 属主清单布局：分组 + 排序 + 批量字段，一次性保存。
    routes.get('/exchange/me/cards/layout', platformAuth, handleGetCardLayout);
    routes.put(
        '/exchange/me/cards/layout',
        ...write,
        jsonSchemaValidator(namecardCardLayoutRequestSchema, {
            invalidMessage: '名片布局无效',
        }),
        handlePutCardLayout,
    );

    // 属主侧单卡分享链接：只读，幂等（同一张卡永远同一个 slug）。
    routes.get(
        '/exchange/me/cards/:cardNumber/share-link',
        platformAuth,
        cardParam,
        handleGetCardShareLink,
    );

    // 名片册与交换记录。
    routes.get('/exchange/me/collection/owners', platformAuth, collectionOwnersQuery, handleListCollectionOwners);
    routes.get('/exchange/me/collection', platformAuth, collectionQuery, handleListCollection);
    routes.put(
        '/exchange/me/collection/:cardNumber',
        ...write,
        collectionEntryParam,
        jsonSchemaValidator(namecardCollectionVisibilitySchema, {
            invalidMessage: '显示状态无效',
        }),
        handleSetCollectionVisibility,
    );
    routes.get('/exchange/me/exchanges', platformAuth, exchangeHistoryQuery, handleListExchanges);

    // 扫码：出示方生成一次性二维码，扫码方在有效期内提交；
    // 出示方通过 SSE 得知状态变更，再读状态快照；旧客户端仍可轮询。
    routes.post(
        '/exchange/scan/sessions',
        ...write,
        jsonSchemaValidator(namecardScanSessionRequestSchema, {
            invalidMessage: '请选择要出示的名片',
        }),
        handleCreateScanSession,
    );
    routes.get(
        '/exchange/scan/sessions/:token',
        platformAuth,
        scanTokenParam,
        handleGetScanSessionStatus,
    );
    routes.get(
        '/exchange/scan/sessions/:token/stream',
        platformAuth,
        scanTokenParam,
        handleScanSessionStream,
    );
    routes.post(
        '/exchange/scan/sessions/:token/commit',
        ...write,
        scanTokenParam,
        commitBody,
        handleCommitScanSession,
    );
    // 扫码方 / 网页落地页：出示方、本次名片与有效期,只在还能交换时给名片。
    routes.get(
        '/exchange/scan/:token',
        optionalPlatformAuth,
        scanLandingTokenParam,
        handleGetScanLandingStatus,
    );

    // 手动交换的裁决与详情：详情只给参与双方，其它人 404。
    routes.get('/exchange/exchanges/:id', platformAuth, exchangeIdParam, handleGetExchange);
    routes.post('/exchange/exchanges/:id/accept', ...write, exchangeIdParam, handleAcceptExchange);
    routes.post('/exchange/exchanges/:id/decline', ...write, exchangeIdParam, handleDeclineExchange);

    return routes;
}
