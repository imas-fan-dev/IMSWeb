import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ADMIN_API_PATH_PREFIX,
    ADMIN_EXCHANGE_PATH_PREFIX,
    API_PATH_PREFIX,
    EXCHANGE_PATH_PREFIX,
    WIKI_PATH_PREFIX,
    adminApiPath,
    adminExchangePath,
    apiPath,
    exchangePath,
    platformAuthPath,
    siteContentPath,
    wikiPath
} from '@imsweb/contracts/paths';

test('shared path prefixes compose the canonical API and delivery paths', () => {
    assert.equal(API_PATH_PREFIX, '/api');
    assert.equal(ADMIN_API_PATH_PREFIX, '/api/admin');
    assert.equal(EXCHANGE_PATH_PREFIX, '/api/community/exchange');
    assert.equal(ADMIN_EXCHANGE_PATH_PREFIX, '/api/admin/community/exchange');
    assert.equal(WIKI_PATH_PREFIX, '/api/wiki');
    assert.equal(apiPath('/health/ready'), '/api/health/ready');
    assert.equal(adminApiPath('/auth/session'), '/api/admin/auth/session');
    assert.equal(exchangePath('/me/cards/:id'), '/api/community/exchange/me/cards/:id');
    assert.equal(platformAuthPath('/register'), '/api/platform/auth/register');
    assert.equal(wikiPath('/catalog'), '/api/wiki/catalog');
    assert.equal(siteContentPath('/_preview/:token'), '/site-content/_preview/:token');
});

test('shared path builders normalize suffix separators without duplicate slashes', () => {
    assert.equal(apiPath(), '/api');
    assert.equal(apiPath('health/ready'), '/api/health/ready');
    assert.equal(adminExchangePath('//cards'), '/api/admin/community/exchange/cards');
});
