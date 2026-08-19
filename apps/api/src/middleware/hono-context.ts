import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { AppEnvironment } from '@/app';
import type {
    AdminAccountRepository,
    AuditRepository,
    AuthRepository,
    EventRepository,
    EditorialRepository,
    NamecardRepository,
    NewsRepository,
    ReactionRepository,
    SitePackageRepository
} from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';

export function services(c: Context<AppEnvironment>): RuntimeServices {
    return c.get('services');
}

function requireRepository<Key extends keyof RuntimeServices>(
    c: Context<AppEnvironment>,
    key: Key
): NonNullable<RuntimeServices[Key]> {
    const repository = services(c)[key];
    if (!repository) throw new Error(`${String(key)} repository is unavailable`);
    return repository as NonNullable<RuntimeServices[Key]>;
}

export function authRepository(c: Context<AppEnvironment>): AuthRepository {
    return requireRepository(c, 'auth');
}

export function adminAccountRepository(c: Context<AppEnvironment>): AdminAccountRepository {
    return requireRepository(c, 'adminAccounts');
}

export function auditRepository(c: Context<AppEnvironment>): AuditRepository {
    return requireRepository(c, 'audit');
}

export function newsRepository(c: Context<AppEnvironment>): NewsRepository {
    return requireRepository(c, 'news');
}

export function eventRepository(c: Context<AppEnvironment>): EventRepository {
    return requireRepository(c, 'events');
}

export function editorialRepository(c: Context<AppEnvironment>): EditorialRepository {
    return requireRepository(c, 'editorial');
}

export function namecardRepository(c: Context<AppEnvironment>): NamecardRepository {
    return requireRepository(c, 'namecards');
}

export function reactionRepository(c: Context<AppEnvironment>): ReactionRepository {
    return requireRepository(c, 'reactions');
}

export function sitePackageRepository(c: Context<AppEnvironment>): SitePackageRepository {
    return requireRepository(c, 'sitePackages');
}

export function getClientAddress(c: Context<AppEnvironment>): string {
    const source = services(c).config?.clientAddressSource || 'direct';
    if (source === 'direct') {
        try {
            return getConnInfo(c).remote.address || 'unknown';
        } catch {
            return 'unknown';
        }
    }
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) return forwarded.split(',').at(-1)?.trim() || 'unknown';
    return c.req.header('x-real-ip')?.trim() || 'unknown';
}
