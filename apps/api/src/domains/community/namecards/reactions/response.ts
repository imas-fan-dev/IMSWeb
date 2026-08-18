import type { NamecardReactions } from '@imsweb/contracts/namecards';

export interface LegacyEmojiMutationResponse {
    success: true;
}

export interface ReactionMutationSuccessResponse {
    ok: true;
}

export type ReactionMutationResponse =
    | LegacyEmojiMutationResponse
    | ReactionMutationSuccessResponse;

export interface ReactionErrorResponse {
    error:
        | 'Invalid card id'
        | 'Unsupported reaction'
        | 'Card not found'
        | 'Database error';
}

export type ReactionListResponse = NamecardReactions;

export function reactionMutationBody(path: string): ReactionMutationResponse {
    return path === '/api/emojis' ? { success: true } : { ok: true };
}
