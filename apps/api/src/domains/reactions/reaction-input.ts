import { positiveInteger } from '@/utils/validation/number';

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

export function reactionMutationBody(path: string): { success: true } | { ok: true } {
    return path === '/api/emojis' ? { success: true } : { ok: true };
}
