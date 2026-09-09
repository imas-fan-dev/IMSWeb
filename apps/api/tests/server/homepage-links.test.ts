import { postgresTest as test } from './postgres-test-database';
import assert from 'node:assert/strict';
import { readContractJson as contractJson } from '../contracts/contract-json';
import {
    homepageLinkDeleteSchema,
    homepageLinkErrorResponseSchema,
    homepageLinkMutationSchema,
    homepageLinksSchema
} from '@imsweb/contracts/homepage-links';
import { createHonoApp } from '@/app';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlAuditRepository } from '@/infra/db/repositories/audit-repository';
import { SqlHomepageLinkRepository } from '@/infra/db/repositories/homepage-link-repository';
import { executeSql } from '@/infra/db/sql/query';
import { createPostgresTestDatabase } from './postgres-test-database';

function adminRequest(method: string, pathname: string, body?: unknown): Request {
    return new Request(`http://homepage.test${pathname}`, {
        method,
        headers: {
            Authorization: 'Bearer op-token',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
}

test('homepage links are database-backed and reorder only complete section inventories', async (t) => {
    const connection = await createPostgresTestDatabase(t, 'homepage-links');
    await new PostgresqlSchemaStrategy().initializeCore(connection);
    const audit = new SqlAuditRepository(connection);
    const repository = new SqlHomepageLinkRepository(connection);
    t.after(() => connection.close());
    await executeSql(connection, 'DELETE FROM homepage_links');

    const app = createHonoApp(() => ({
        homepageLinks: repository,
        audit,
        backofficeTokens: {
            sign: async () => 'op-token',
            verify: async () => ({
                id: 1,
                username: 'operator',
                producername: 'Operator',
                dept: 'op',
                adminRole: 'admin' as const,
                csrfSecret: 'csrf'
            })
        }
    }));

    const initial = await app.request('http://homepage.test/api/homepage-links');
    assert.equal(initial.status, 200);
    assert.deepEqual(await contractJson(initial, homepageLinksSchema), {
        sections: { navigation: [], friend: [], support: [] }
    });

    const create = async (title: string, href: string) => {
        const response = await app.request(adminRequest('POST', '/api/admin/homepage-links', {
            section: 'navigation',
            title,
            description: `${title}说明`,
            href,
            icon: 'calendar',
            accent: 'franchise-765'
        }));
        assert.equal(response.status, 201);
        return (await contractJson(response, homepageLinkMutationSchema)).link.id;
    };

    const firstId = await create('第一项', '/first');
    const secondId = await create('第二项', '/second');
    const conflict = await app.request(adminRequest(
        'PUT',
        '/api/admin/homepage-links/navigation/order',
        { ids: [secondId] }
    ));
    assert.equal(conflict.status, 409);
    await contractJson(conflict, homepageLinkErrorResponseSchema);

    const reordered = await app.request(adminRequest(
        'PUT',
        '/api/admin/homepage-links/navigation/order',
        { ids: [secondId, firstId] }
    ));
    assert.equal(reordered.status, 200);
    await contractJson(reordered, homepageLinkDeleteSchema);
    assert.deepEqual(
        (await repository.listHomepageLinks('navigation')).map((link) => link.id),
        [secondId, firstId]
    );

    const updated = await app.request(adminRequest(
        'PUT',
        `/api/admin/homepage-links/${firstId}`,
        {
            title: '第一项已更新',
            description: '更新后的说明',
            href: '/first-updated',
            icon: 'info',
            accent: 'franchise-gk'
        }
    ));
    assert.equal(updated.status, 200);
    await contractJson(updated, homepageLinkMutationSchema);
    assert.equal((await repository.findHomepageLinkById(firstId))?.title, '第一项已更新');

    const publicResponse = await app.request('http://homepage.test/api/homepage-links');
    const publicBody = await contractJson(publicResponse, homepageLinksSchema) as {
        sections: { navigation: Array<{ id: string; displayOrder: number }> };
    };
    assert.deepEqual(publicBody.sections.navigation.map((link) => link.id), [secondId, firstId]);
    assert.deepEqual(publicBody.sections.navigation.map((link) => link.displayOrder), [0, 1]);

    const adminRead = await app.request(adminRequest('GET', '/api/admin/homepage-links'));
    assert.equal(adminRead.status, 200);
    await contractJson(adminRead, homepageLinksSchema);

    const deleted = await app.request(adminRequest('DELETE', `/api/admin/homepage-links/${firstId}`));
    assert.equal(deleted.status, 200);
    await contractJson(deleted, homepageLinkDeleteSchema);

    const malformed = await app.request(adminRequest('POST', '/api/admin/homepage-links', {
        section: 'navigation',
        title: '',
        description: '',
        href: '/invalid',
        icon: 'calendar',
        accent: 'primary'
    }));
    assert.equal(malformed.status, 400);
    await contractJson(malformed, homepageLinkErrorResponseSchema);
});
