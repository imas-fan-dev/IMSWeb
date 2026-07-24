import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';

export const ALLOWED_REACTIONS = new Set([
    '❤️', '👍', '😂', '🤣', '😭', '😍', '🥰', '😘', '🤯', '😱',
    '😎', '🤩', '😤', '🙏', '👏', '✨', '💯', '🎉', '💥', '🌟',
    '🐵', '🐶', '🐱', '🦊', '🐼', '🐳', '🔥', '💀', '👀', '🍀',
    '🌈', '🐛', '💎', '🚀', '🏆', '🍕', '🍔', '🎮', '🌹', '🍭',
    '🔨', '🔫', '❓', '🧒', '😙', '🔘'
]);

export async function reactionBody(c: Context<AppEnvironment>): Promise<Record<string, unknown>> {
    try {
        return await c.req.json<Record<string, unknown>>();
    } catch {
        return {};
    }
}

export function reactionMutationBody(path: string): { success: true } | { ok: true } {
    return path === '/api/emojis' ? { success: true } : { ok: true };
}
