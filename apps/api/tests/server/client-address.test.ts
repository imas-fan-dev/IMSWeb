import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Hono } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    getRequestClientAddress,
    resolveClientAddress
} from '@/middleware/client-address';
import { getClientAddress } from '@/middleware/hono-context';

describe('client address resolution', () => {
    test('direct mode validates the connection peer and ignores forwarding headers', () => {
        assert.equal(resolveClientAddress({
            source: 'direct',
            remoteAddress: '203.0.113.10',
            forwardedFor: '198.51.100.20',
            realIp: '198.51.100.21'
        }), '203.0.113.10');
        assert.equal(resolveClientAddress({
            source: 'direct',
            remoteAddress: '2001:db8::10',
            forwardedFor: '198.51.100.20'
        }), '2001:db8::10');
        assert.equal(resolveClientAddress({
            source: 'direct',
            forwardedFor: '198.51.100.20'
        }), 'unknown');
        assert.equal(resolveClientAddress({
            source: 'direct',
            remoteAddress: 'not-an-ip'
        }), 'unknown');
    });

    test('nginx mode accepts one IPv4 or IPv6 address and prefers X-Forwarded-For', () => {
        assert.equal(resolveClientAddress({
            source: 'nginx',
            forwardedFor: '203.0.113.11',
            realIp: '198.51.100.22'
        }), '203.0.113.11');
        assert.equal(resolveClientAddress({
            source: 'nginx',
            forwardedFor: '2001:db8::11'
        }), '2001:db8::11');
        assert.equal(resolveClientAddress({
            source: 'nginx',
            realIp: '198.51.100.23'
        }), '198.51.100.23');
    });

    test('nginx mode rejects missing, invalid, empty, and multi-value headers', () => {
        assert.equal(resolveClientAddress({ source: 'nginx' }), 'unknown');
        assert.equal(resolveClientAddress({
            source: 'nginx',
            forwardedFor: 'not-an-ip'
        }), 'unknown');
        assert.equal(resolveClientAddress({
            source: 'nginx',
            forwardedFor: '203.0.113.12, 10.0.0.1'
        }), 'unknown');
        assert.equal(resolveClientAddress({
            source: 'nginx',
            forwardedFor: '',
            realIp: '198.51.100.24'
        }), 'unknown');
        assert.equal(resolveClientAddress({
            source: 'nginx',
            forwardedFor: 'invalid',
            realIp: '198.51.100.25'
        }), 'unknown');
    });

    test('request adapters apply the configured trust source', async () => {
        const nginxApp = new Hono<AppEnvironment>();
        nginxApp.use('*', async (context, next) => {
            context.set('services', {
                config: { clientAddressSource: 'nginx' }
            });
            await next();
        });
        nginxApp.get('/', (context) => context.text(getClientAddress(context)));

        const nginxResponse = await nginxApp.request('/', {
            headers: {
                'X-Forwarded-For': '203.0.113.13',
                'X-Real-IP': '198.51.100.26'
            }
        });
        assert.equal(await nginxResponse.text(), '203.0.113.13');

        const directApp = new Hono();
        directApp.get('/', (context) => context.text(
            getRequestClientAddress(context, 'direct')
        ));
        const directResponse = await directApp.request('/', {
            headers: { 'X-Forwarded-For': '203.0.113.14' }
        });
        assert.equal(await directResponse.text(), 'unknown');
    });
});
