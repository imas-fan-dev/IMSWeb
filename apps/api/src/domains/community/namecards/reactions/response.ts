import { apiPath } from '@imsweb/contracts/paths';
import type {
    NamecardReactions,
    ReactionErrorResponse as ReactionContractErrorResponse,
    ReactionMutationResponse as ReactionContractMutationResponse,
} from '@imsweb/contracts/namecards';

export type ReactionMutationResponse = ReactionContractMutationResponse;
export type ReactionErrorResponse = ReactionContractErrorResponse;
export type ReactionListResponse = NamecardReactions;

export function reactionMutationBody(path: string): ReactionMutationResponse {
    return path === apiPath('/emojis') ? { success: true } : { ok: true };
}
