import { apiPath } from '@imsweb/contracts/paths';

import { createHandleAddReaction } from '@/domains/community/namecards/reactions/handlers/add-reaction';
import { createHandleDeleteReaction } from '@/domains/community/namecards/reactions/handlers/delete-reaction';
import { handleListReactions } from '@/domains/community/namecards/reactions/handlers/list-reactions';
import {
    validateReactionListQuery,
    validateReactionRequest
} from '@/domains/community/namecards/reactions/request';
import { jsonValidator, queryValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

const reactionValidator = jsonValidator(validateReactionRequest, {
    acceptMislabeledJson: true,
    malformedMessage: 'Unsupported reaction'
});

export function namecardReactionRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    for (const route of ['/emojis', '/reactions'] as const) {
        routes.get(
            route,
            queryValidator(validateReactionListQuery),
            handleListReactions
        );
        routes.post(route, reactionValidator, createHandleAddReaction(apiPath(route)));
        routes.delete(
            route,
            reactionValidator,
            createHandleDeleteReaction(apiPath(route))
        );
    }
    return routes;
}
