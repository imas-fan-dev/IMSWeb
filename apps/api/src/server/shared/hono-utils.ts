import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { CoreRepository } from '@/ports/core-repository';
import type { RuntimeServices } from '@/ports/runtime-services';

export function services(c: Context<AppEnvironment>): RuntimeServices {
    return c.get('services');
}

export function coreRepository(c: Context<AppEnvironment>): CoreRepository {
    const repository = services(c).core;
    if (!repository) throw new Error('Core repository is unavailable');
    return repository;
}

export function getClientAddress(c: Context<AppEnvironment>): string {
    if (services(c).config?.clientAddressSource === 'cloudflare') {
        return c.req.header('cf-connecting-ip')?.trim() || 'unknown';
    }
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) return forwarded.split(',').at(-1)?.trim() || 'unknown';
    return c.req.header('x-real-ip')?.trim() || 'unknown';
}

export function positiveInteger(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function randomHex(bytes: number): string {
    const value = new Uint8Array(bytes);
    crypto.getRandomValues(value);
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(body: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(body).buffer);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function safeUploadBaseName(filename: string): string {
    const base = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '')
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}._-]+/gu, '_')
        .slice(0, 80);
    return base || 'image';
}

export function statusFromError(error: unknown, fallback = 500): number {
    if (error && typeof error === 'object' && 'status' in error) {
        const status = Number((error as { status?: unknown }).status);
        if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
    }
    return fallback;
}

export function messageFromError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
