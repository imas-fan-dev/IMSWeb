import type { ImsHonoApp } from '@/app';
import { createHandleAddReaction } from '@/domains/reactions/handlers/add-reaction';
import { createHandleDeleteReaction } from '@/domains/reactions/handlers/delete-reaction';
import { handleListReactions } from '@/domains/reactions/handlers/list-reactions';

export function registerReactionRoutes(app: ImsHonoApp): void {
    for (const route of ['/api/emojis', '/api/reactions'] as const) {
        app.get(route, handleListReactions);
        app.post(route, createHandleAddReaction(route));
        app.delete(route, createHandleDeleteReaction(route));
    }
}
