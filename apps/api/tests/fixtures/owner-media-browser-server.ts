import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import { createPlatformRefreshToken, hashPlatformAuthSecret } from '@/domains/identity/platform-auth/contracts/session';
import { OwnerRouteFixture, PLATFORM_TOKEN, ownerCard } from './owner-route-fixture';

// The browser exercises real Platform middleware and the owner-media handler.
// Repository/token ports use the same adapter as API owner-route regressions.
const fixture = new OwnerRouteFixture();
const refreshToken = createPlatformRefreshToken(0);
let refreshCalls = 0;
let invalidMediaReads = 0;
let invalidAuthReads = 0;
let refreshHash = '';
let previousRefreshHash: string | null = null;
fixture.platformAccounts.findRefreshSessionByTokenHash = async (hash) =>
    hash === refreshHash || hash === previousRefreshHash
        ? { ...fixture.session, token_hash: refreshHash, previous_token_hash: previousRefreshHash, user_agent: null, ip_address: null, last_seen_at: null }
        : null;
fixture.platformAccounts.rotateRefreshSession = async (input) => {
    if (input.currentTokenHash !== refreshHash || fixture.session.revoked_at !== null || input.accountTokenVersion !== 0) return false;
    previousRefreshHash = refreshHash;
    refreshHash = input.nextTokenHash;
    fixture.session.csrf_hash = input.nextCsrfHash;
    fixture.session.expires_at = input.nextExpiresAt;
    fixture.session.updated_at = input.updatedAt;
    refreshCalls += 1;
    return true;
};
fixture.platformAccounts.revokeRefreshSessionForReplay = async (input) => {
    fixture.session.revoked_at = input.revokedAt;
    return true;
};
fixture.platformAccounts.revokeRefreshSession = async (input) => {
    fixture.session.revoked_at = input.revokedAt;
    return true;
};
const image = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#2463a8"/></svg>');
const stored = { body: image, size: image.length, contentType: 'image/svg+xml', etag: 'owner-image' };
let byteReads = 0;
let signedReads = 0;
fixture.storage.get = async (key) => {
    byteReads += 1;
    return fixture.storage.objects.has(key) ? stored : null;
};
// Keep createReadUrl present: bearer reads must proxy despite an external
// signed storage destination. Cookie delivery retains its redirect behavior.
fixture.storage.createReadUrl = async (key, options) => {
    fixture.storage.readUrls.push({ key, method: options?.method });
    const address = server.address();
    return fixture.storage.objects.has(key) && address && typeof address !== 'string'
        ? { url: `http://127.0.0.1:${address.port}/fixture-storage?key=${encodeURIComponent(key)}&signed=fixture`, visibility: 'private' }
        : null;
};
const app = new Hono();
app.get('/fixture', (c) => c.json({ token: PLATFORM_TOKEN, refreshToken, card: ownerCard() }));
app.get('/fixture-stats', (c) => c.json({ byteReads, signedReads, readUrls: fixture.storage.readUrls.length, refreshCalls, invalidMediaReads, invalidAuthReads }));
app.get('/fixture-storage', (c) => {
    signedReads += 1;
    if (c.req.query('signed') !== 'fixture' || !fixture.storage.objects.has(c.req.query('key') || '')) return c.text('Not Found', 404);
    return new Response(image, { headers: { 'Content-Type': stored.contentType, 'Cache-Control': 'private, no-store' } });
});
app.all('*', async (c) => {
    const response = await fixture.app.fetch(c.req.raw);
    if (c.req.path.includes('/media/') && c.req.header('authorization') === 'Bearer expired-platform-token' && response.status === 401) invalidMediaReads += 1;
    if (c.req.path === '/api/platform/auth/session' && c.req.header('authorization') === 'Bearer expired-platform-token' && response.status === 401) invalidAuthReads += 1;
    return response;
});
const server = createServer(getRequestListener(app.fetch));
void hashPlatformAuthSecret(refreshToken).then((hash) => {
    refreshHash = hash;
    server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address !== 'string') console.log(JSON.stringify({ origin: `http://127.0.0.1:${address.port}` }));
    });
});
process.on('SIGTERM', () => server.close());
