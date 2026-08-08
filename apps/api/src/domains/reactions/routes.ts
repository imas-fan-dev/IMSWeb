import type { ImsHonoApp } from '@/app';
import { createHandleAddReaction } from '@/domains/reactions/handlers/add-reaction';
import { createHandleDeleteReaction } from '@/domains/reactions/handlers/delete-reaction';
import { handleListReactions } from '@/domains/reactions/handlers/list-reactions';
import { validateReactionRequest } from '@/domains/reactions/reaction-input';
import { jsonValidator } from '@/middleware/request-validation';

const reactionValidator = jsonValidator(validateReactionRequest, {
    acceptMislabeledJson: true,
    malformedMessage: 'Unsupported reaction'
});

export function registerReactionRoutes(app: ImsHonoApp): void {
    for (const route of ['/api/emojis', '/api/reactions'] as const) {
        app.get(route, handleListReactions);
        app.post(
            route,
            reactionValidator,
            createHandleAddReaction(route)
        );
        app.delete(
            route,
            reactionValidator,
            createHandleDeleteReaction(route)
        );
    }
}
