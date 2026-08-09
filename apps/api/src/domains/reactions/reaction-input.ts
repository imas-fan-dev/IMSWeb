import { positiveInteger } from '@/utils/validation/number';
import { requestRecord } from '@/utils/validation/request-data';

export const ALLOWED_REACTIONS = new Set([
    '❤️', '👍', '😂', '🤣', '😭', '😍', '🥰', '😘', '🤯', '😱',
    '😎', '🤩', '😤', '🙏', '👏', '✨', '💯', '🎉', '💥', '🌟',
    '🐵', '🐶', '🐱', '🦊', '🐼', '🐳', '🔥', '💀', '👀', '🍀',
    '🌈', '🐛', '💎', '🚀', '🏆', '🍕', '🍔', '🎮', '🌹', '🍭',
    '🔨', '🔫', '❓', '🧒', '😙', '🔘'
]);

export interface ReactionRequest {
    id: number;
    emoji: string;
}

export interface ReactionListQuery {
    id: number;
}

export function validateReactionRequest(value: unknown): ReactionRequest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw Object.assign(new Error('Unsupported reaction'), { status: 400 });
    }
    const payload = value as Record<string, unknown>;
    if (typeof payload.emoji !== 'string' || !ALLOWED_REACTIONS.has(payload.emoji)) {
        throw Object.assign(new Error('Unsupported reaction'), { status: 400 });
    }
    const id = positiveInteger(payload.id);
    if (!id) throw Object.assign(new Error('Invalid card id'), { status: 400 });
    return { id, emoji: payload.emoji };
}

export function validateReactionListQuery(value: unknown): ReactionListQuery {
    const query = requestRecord(value, 'Invalid card id');
    const id = positiveInteger(query.id);
    if (!id) throw Object.assign(new Error('Invalid card id'), { status: 400 });
    return { id };
}
