import {
    namecardCollectionEntryParamsSchema,
    namecardCollectionQuerySchema,
    namecardCollectionVisibilitySchema,
    namecardExchangeCardParamsSchema,
    namecardExchangeCommitSchema,
    namecardExchangeHandleParamsSchema,
    namecardExchangeIdParamsSchema,
    namecardExchangeSlugParamsSchema,
    namecardQuickSelectionSchema,
    namecardScanSessionRequestSchema,
    namecardScanTokenParamsSchema,
} from '@imsweb/contracts/namecards';
import { handleCommitCardShare } from '@/domains/community/namecards/exchange/handlers/commit-card-share';
import { handleCommitQuickExchange } from '@/domains/community/namecards/exchange/handlers/commit-quick-exchange';
import { handleGetCardShare } from '@/domains/community/namecards/exchange/handlers/get-card-share';
import { handleGetQuickExchange } from '@/domains/community/namecards/exchange/handlers/get-quick-exchange';
import {
    handleGetQuickSettings,
    handlePutQuickSettings,
} from '@/domains/community/namecards/exchange/handlers/quick-settings';
import { handleRequestCard } from '@/domains/community/namecards/exchange/handlers/request-card';
import {
    handleCommitScanSession,
    handleCreateScanSession,
} from '@/domains/community/namecards/exchange/handlers/scan-sessions';
import {
    handleListCollection,
    handleSetCollectionVisibility,
} from '@/domains/community/namecards/exchange/handlers/collection';
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
const collectionEntryParam = paramSchemaValidator(namecardCollectionEntryParamsSchema, {
    invalidMessage: '名片编号无效',
});
const commitBody = jsonSchemaValidator(namecardExchangeCommitSchema, {
    invalidMessage: '交换参数无效',
});
const collectionQuery = querySchemaValidator(namecardCollectionQuerySchema, {
    invalidMessage: '分页参数无效',
});

export function namecardExchangeRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();

    // 单卡分享：任何人可看，登录后才知道「我有几张某张他还没有」。
    routes.get('/exchange/card/:slug', optionalPlatformAuth, slugParam, handleGetCardShare);
    routes.post('/exchange/card/:slug/commit', ...write, slugParam, commitBody, handleCommitCardShare);

    // 墙上直接发起；快速交换页先看清单再一次收下。
    routes.post('/exchange/cards/:cardNumber/request', ...write, cardParam, commitBody, handleRequestCard);
    routes.get('/exchange/quick/:handle', optionalPlatformAuth, handleParam, handleGetQuickExchange);
    routes.post('/exchange/quick/:handle/commit', ...write, handleParam, commitBody, handleCommitQuickExchange);

    // 自己的快速交换清单。
    routes.get('/exchange/me/quick', platformAuth, handleGetQuickSettings);
    routes.put(
        '/exchange/me/quick',
        ...write,
        jsonSchemaValidator(namecardQuickSelectionSchema, { invalidMessage: '清单参数无效' }),
        handlePutQuickSettings,
    );

    // 名片册与交换记录。
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
    routes.get('/exchange/me/exchanges', platformAuth, collectionQuery, handleListExchanges);

    // 扫码：出示方生成一次性二维码，扫码方在有效期内提交。
    routes.post(
        '/exchange/scan/sessions',
        ...write,
        jsonSchemaValidator(namecardScanSessionRequestSchema, {
            invalidMessage: '请选择要出示的名片',
        }),
        handleCreateScanSession,
    );
    routes.post(
        '/exchange/scan/sessions/:token/commit',
        ...write,
        scanTokenParam,
        commitBody,
        handleCommitScanSession,
    );

    // 手动交换的裁决。
    routes.post('/exchange/exchanges/:id/accept', ...write, exchangeIdParam, handleAcceptExchange);
    routes.post('/exchange/exchanges/:id/decline', ...write, exchangeIdParam, handleDeclineExchange);

    return routes;
}
