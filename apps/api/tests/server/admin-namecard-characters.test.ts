/**
 * Coverage for `GET|POST|PATCH|DELETE /api/admin/cards/characters*` and the
 * public catalog that reads the same tables.
 *
 * Everything runs through the real Hono app against a real PostgreSQL database
 * built from the migrations, so the ordering, the unique indexes, the
 * optimistic-lock SQL and the wire contracts are exercised together.
 */
import { assertContractJson } from '../contracts/contract-json';
import { postgresTest } from '../postgres-test-database';
import {
    createNamecardAdminFixture,
    insertNamecardAgency,
    NAMECARD_OTHER_AGENCY_ID,
    namecardActorBearerHeaders,
    namecardActorHeaders,
    namecardAuditRows,
    namecardJsonInit,
    seedNamecardCharacter,
    seedNamecardUnit,
    type NamecardAdminFixture
} from './namecard-admin-fixture';
import { testRequest } from './test-app';
import {
    namecardCharacterAgencyListSchema,
    namecardCharacterConflictSchema,
    namecardCharacterDeleteSchema,
    namecardCharacterListSchema,
    namecardCharacterMutationSchema,
    type NamecardCharacterList
} from '@imsweb/contracts/fudaba/admin-characters';
import { namecardCharacterCatalogSchema } from '@imsweb/contracts/fudaba/characters';
import {
    errorResponseSchema,
    failureMessageResponseSchema
} from '@imsweb/contracts/common';
import { adminApiPath, exchangePath } from '@imsweb/contracts/paths';
import assert from 'node:assert/strict';
import { onTestFinished, vi } from 'vitest';

// Every test builds its own database and the shared allocator drops it in an
// `onTestFinished` hook. Against a loaded server that teardown outruns the 10s
// default, which is a harness limit rather than an assertion.
vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

const CHARACTERS = adminApiPath('/cards/characters');
const CHARACTER_AGENCIES = adminApiPath('/cards/characters/agencies');
const CATALOG = exchangePath('/characters');

/** Characters loaded once per test; not a helper, just the standard wiring. */
async function loadFixture(): Promise<{
    fixture: NamecardAdminFixture;
    headers: Record<string, string>;
}> {
    const fixture = await createNamecardAdminFixture();
    onTestFinished(() => fixture.close());
    const headers = await namecardActorHeaders(fixture, fixture.operator);
    return { fixture, headers };
}

postgresTest('lists the six seeded fallback buckets in category order', async () => {
    const { fixture, headers } = await loadFixture();

    const response = await testRequest(fixture.app, CHARACTERS, { headers });
    const body = await assertContractJson(
        response,
        200,
        namecardCharacterListSchema
    );

    assert.deepEqual(
        body.characters.map((entry) => entry.nameCn),
        ['其他偶像', '其他职员', '其他对手', '其他吉祥物', '其他角色', '现实人物']
    );
    assert.deepEqual(
        body.characters.map((entry) => entry.category),
        ['idol', 'staff', 'rival', 'mascot', 'chara', 'other']
    );
    assert.ok(body.characters.every((entry) => entry.isFallback));
    assert.deepEqual(body.pageInfo, {
        page: 1,
        pageSize: 20,
        total: 6,
        totalPages: 1,
        hasNextPage: false
    });
    const first = body.characters[0];
    assert.equal(first?.agencyId, NAMECARD_OTHER_AGENCY_ID);
    assert.equal(first?.agencyCode, 'namecard-other');
    assert.equal(first?.agencyName, '其他');
    assert.equal(first?.agencyColor, '#8A8A8A');
    assert.equal(first?.displayOrder, 0);
    assert.equal(first?.revision, 0);
    assert.equal(first?.nameJa, null);
    assert.equal(first?.nameEn, null);
    assert.equal(first?.aliases, null);
});

postgresTest('matches the query against every name column and the aliases', async () => {
    const { fixture, headers } = await loadFixture();
    const agencyId = await insertNamecardAgency(fixture.connection, {
        code: 'query-agency',
        nameCn: '查询企划',
        displayOrder: 10000
    });
    await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'idol',
        nameCn: '星宫铃音'
    });
    await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'staff',
        nameCn: '月见',
        nameJa: 'つきみ'
    });
    await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'rival',
        nameCn: 'Sunny',
        nameEn: 'Sunny Day'
    });
    await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'mascot',
        nameCn: '无名',
        aliases: 'hoshimiya,りんね'
    });

    const findNames = async (query: string): Promise<string[]> => {
        const response = await testRequest(
            fixture.app,
            `${CHARACTERS}?query=${encodeURIComponent(query)}`,
            { headers }
        );
        const body = await assertContractJson(
            response,
            200,
            namecardCharacterListSchema
        );
        return body.characters.map((entry) => entry.nameCn);
    };

    assert.deepEqual(await findNames('星宫'), ['星宫铃音']);
    assert.deepEqual(await findNames('つき'), ['月见']);
    assert.deepEqual(await findNames('sunny day'), ['Sunny']);
    assert.deepEqual(await findNames('りんね'), ['无名']);
    assert.deepEqual(await findNames('hoshimiya'), ['无名']);
    // `%` and `_` are LIKE wildcards; the repository must escape them.
    assert.deepEqual(await findNames('%'), []);
    assert.deepEqual(await findNames('_'), []);
    assert.deepEqual(await findNames('不存在的名字'), []);
});

postgresTest('filters by agency and category', async () => {
    const { fixture, headers } = await loadFixture();
    const alpha = await insertNamecardAgency(fixture.connection, {
        code: 'filter-alpha',
        nameCn: '过滤甲',
        displayOrder: 10000
    });
    const beta = await insertNamecardAgency(fixture.connection, {
        code: 'filter-beta',
        nameCn: '过滤乙',
        displayOrder: 10001
    });
    await seedNamecardCharacter(fixture, headers, {
        agencyId: alpha,
        category: 'idol',
        nameCn: '甲偶像'
    });
    await seedNamecardCharacter(fixture, headers, {
        agencyId: alpha,
        category: 'staff',
        nameCn: '甲职员'
    });
    await seedNamecardCharacter(fixture, headers, {
        agencyId: beta,
        category: 'idol',
        nameCn: '乙偶像'
    });

    const listNames = async (search: string): Promise<string[]> => {
        const response = await testRequest(
            fixture.app,
            `${CHARACTERS}?${search}`,
            { headers }
        );
        const body = await assertContractJson(
            response,
            200,
            namecardCharacterListSchema
        );
        return body.characters.map((entry) => entry.nameCn);
    };

    assert.deepEqual(await listNames(`agencyId=${alpha}`), ['甲偶像', '甲职员']);
    assert.deepEqual(await listNames(`agencyId=${beta}`), ['乙偶像']);
    // `staff` also carries the seeded fallback, filed under the sentinel agency
    // whose display_order puts it last.
    assert.deepEqual(await listNames('category=staff'), ['甲职员', '其他职员']);
    assert.deepEqual(await listNames('category=mascot'), ['其他吉祥物']);
    assert.deepEqual(await listNames(`agencyId=${beta}&category=idol`), ['乙偶像']);
});

postgresTest('pages the character list and clamps the paging bounds', async () => {
    const { fixture, headers } = await loadFixture();
    const agencyId = await insertNamecardAgency(fixture.connection, {
        code: 'paging-agency',
        nameCn: '分页企划',
        displayOrder: 10000
    });
    for (const nameCn of ['分页一', '分页二', '分页三']) {
        await seedNamecardCharacter(fixture, headers, {
            agencyId,
            category: 'idol',
            nameCn
        });
    }

    const list = async (search: string): Promise<NamecardCharacterList> => {
        const response = await testRequest(
            fixture.app,
            `${CHARACTERS}?${search}`,
            { headers }
        );
        return await assertContractJson(
            response,
            200,
            namecardCharacterListSchema
        );
    };

    const secondPage = await list('page=2&pageSize=2');
    // The three new rows lead (their agency sorts before the sentinel), then the
    // first fallback.
    assert.deepEqual(
        secondPage.characters.map((entry) => entry.nameCn),
        ['分页三', '其他偶像']
    );
    assert.deepEqual(secondPage.pageInfo, {
        page: 2,
        pageSize: 2,
        total: 9,
        totalPages: 5,
        hasNextPage: true
    });

    const beyondTheEnd = await list('page=99');
    assert.deepEqual(beyondTheEnd.characters, []);
    assert.equal(beyondTheEnd.pageInfo.page, 99);
    assert.equal(beyondTheEnd.pageInfo.hasNextPage, false);

    // Out-of-range sizes fall back to the defaults instead of scanning the table.
    const clamped = await list('page=0&pageSize=5000');
    assert.deepEqual(clamped.pageInfo, {
        page: 1,
        pageSize: 100,
        total: 9,
        totalPages: 1,
        hasNextPage: false
    });

    // Schema failures (bad digits, unknown category, over-long query) only
    // promise the shared `{ error }` envelope of the validation middleware.
    const invalid = [
        'agencyId=abc',
        'category=wizard',
        'pageSize=-1',
        `query=${'a'.repeat(161)}`
    ];
    for (const search of invalid) {
        const response = await testRequest(
            fixture.app,
            `${CHARACTERS}?${search}`,
            { headers }
        );
        assert.equal(response.status, 400, `expected 400 for ?${search}`);
        const body = await assertContractJson(
            response,
            400,
            errorResponseSchema
        );
        assert.ok(body.error.length > 0, `empty error for ?${search}`);
    }

    // `0` passes the digit-only schema and fails the domain parser, which names
    // the offending filter.
    const zeroAgency = await testRequest(
        fixture.app,
        `${CHARACTERS}?agencyId=0`,
        { headers }
    );
    const zeroAgencyBody = await assertContractJson(
        zeroAgency,
        400,
        errorResponseSchema
    );
    assert.equal(zeroAgencyBody.error, '企划 ID 无效');
});

postgresTest('orders characters by agency, category rank, display order, then age', async () => {
    const { fixture, headers } = await loadFixture();
    const early = await insertNamecardAgency(fixture.connection, {
        code: 'order-early',
        nameCn: '排序甲',
        displayOrder: 10000
    });
    const late = await insertNamecardAgency(fixture.connection, {
        code: 'order-late',
        nameCn: '排序乙',
        displayOrder: 10050
    });

    // Same agency, same category, same display_order: only the age separates
    // these two, so the older row must lead.
    await seedNamecardCharacter(fixture, headers, {
        agencyId: early,
        category: 'idol',
        nameCn: '先进先出',
        displayOrder: 5
    });
    await seedNamecardCharacter(fixture, headers, {
        agencyId: early,
        category: 'idol',
        nameCn: '后来居上',
        displayOrder: 5
    });
    await seedNamecardCharacter(fixture, headers, {
        agencyId: early,
        category: 'idol',
        nameCn: '排在后面',
        displayOrder: 50
    });
    await seedNamecardCharacter(fixture, headers, {
        agencyId: early,
        category: 'other',
        nameCn: '别的分类',
        displayOrder: 0
    });
    await seedNamecardCharacter(fixture, headers, {
        agencyId: late,
        category: 'idol',
        nameCn: '更晚的企划',
        displayOrder: 0
    });

    const response = await testRequest(fixture.app, CHARACTERS, { headers });
    const body = await assertContractJson(
        response,
        200,
        namecardCharacterListSchema
    );

    assert.deepEqual(
        body.characters.slice(0, 5).map((entry) => entry.nameCn),
        ['先进先出', '后来居上', '排在后面', '别的分类', '更晚的企划']
    );
    // The sentinel agency (display_order 20000) closes the list, and the
    // fallbacks keep their category rank among themselves.
    assert.deepEqual(
        body.characters.slice(5).map((entry) => entry.nameCn),
        ['其他偶像', '其他职员', '其他对手', '其他吉祥物', '其他角色', '现实人物']
    );
});

postgresTest('lists every agency, sentinel included', async () => {
    const { fixture, headers } = await loadFixture();
    const realAgencyId = await insertNamecardAgency(fixture.connection, {
        code: 'agency-list-real',
        nameCn: '真实企划',
        displayOrder: 10000,
        color: '#123456'
    });

    const response = await testRequest(fixture.app, CHARACTER_AGENCIES, {
        headers
    });
    const body = await assertContractJson(
        response,
        200,
        namecardCharacterAgencyListSchema
    );

    assert.deepEqual(
        body.agencies.map((agency) => agency.code),
        ['agency-list-real', 'namecard-other']
    );
    assert.deepEqual(body.agencies[0], {
        id: realAgencyId,
        code: 'agency-list-real',
        name: '真实企划',
        color: '#123456',
        wikiEnabled: true
    });
    assert.deepEqual(body.agencies[1], {
        id: NAMECARD_OTHER_AGENCY_ID,
        code: 'namecard-other',
        name: '其他',
        color: '#8A8A8A',
        wikiEnabled: false
    });
});

postgresTest('creates, updates and deletes a character and audits each write', async () => {
    const { fixture, headers } = await loadFixture();
    const agencyId = await insertNamecardAgency(fixture.connection, {
        code: 'crud-agency',
        nameCn: '增删改企划',
        displayOrder: 10000,
        color: '#abcdef'
    });

    const created = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'idol',
        nameCn: '星宫铃音'
    });
    assert.equal(created.revision, 0);
    assert.equal(created.displayOrder, 0);
    assert.equal(created.isFallback, false);
    assert.equal(created.agencyCode, 'crud-agency');
    assert.equal(created.agencyName, '增删改企划');
    assert.equal(created.agencyColor, '#abcdef');
    assert.equal(created.nameJa, null);

    const updatedResponse = await testRequest(
        fixture.app,
        `${CHARACTERS}/${created.id}`,
        namecardJsonInit('PATCH', headers, {
            agencyId,
            category: 'staff',
            nameCn: '星宫铃音改',
            nameJa: 'ほしみや',
            aliases: 'rinne',
            displayOrder: 7,
            revision: 0
        })
    );
    const updated = (
        await assertContractJson(
            updatedResponse,
            200,
            namecardCharacterMutationSchema
        )
    ).character;
    assert.equal(updated.id, created.id);
    assert.equal(updated.revision, 1);
    assert.equal(updated.nameCn, '星宫铃音改');
    assert.equal(updated.category, 'staff');
    assert.equal(updated.displayOrder, 7);
    assert.equal(updated.nameJa, 'ほしみや');
    assert.equal(updated.aliases, 'rinne');
    // An omitted optional field is stored as null, not merged from the old row.
    assert.equal(updated.nameEn, null);
    // `isFallback` was omitted too, but it is not a wipe-on-omit field.
    assert.equal(updated.isFallback, false);

    const staleDelete = await testRequest(
        fixture.app,
        `${CHARACTERS}/${created.id}?revision=99`,
        { method: 'DELETE', headers }
    );
    const staleConflict = await assertContractJson(
        staleDelete,
        409,
        namecardCharacterConflictSchema
    );
    assert.deepEqual(staleConflict, {
        success: false,
        code: 'NAMECARD_CHARACTER_STATE_CONFLICT',
        revision: 1
    });

    const deletedResponse = await testRequest(
        fixture.app,
        `${CHARACTERS}/${created.id}?revision=1`,
        { method: 'DELETE', headers }
    );
    const deleted = await assertContractJson(
        deletedResponse,
        200,
        namecardCharacterDeleteSchema
    );
    assert.deepEqual(deleted, { success: true, id: created.id });

    const deletedAgain = await testRequest(
        fixture.app,
        `${CHARACTERS}/${created.id}?revision=1`,
        { method: 'DELETE', headers }
    );
    const gone = await assertContractJson(
        deletedAgain,
        404,
        failureMessageResponseSchema
    );
    assert.equal(gone.message, '名片角色不存在');

    const listResponse = await testRequest(fixture.app, CHARACTERS, { headers });
    const listed = await assertContractJson(
        listResponse,
        200,
        namecardCharacterListSchema
    );
    assert.equal(
        listed.characters.some((entry) => entry.id === created.id),
        false
    );
    assert.equal(listed.pageInfo.total, 6);

    const createRows = await namecardAuditRows(
        fixture.connection,
        '创建名片角色'
    );
    assert.deepEqual(createRows, [
        {
            action: '创建名片角色',
            target: `namecard_character=${created.id};agency=${agencyId}`,
            username: 'namecard-operator',
            producername: 'namecard-operator P'
        }
    ]);
    const updateRows = await namecardAuditRows(
        fixture.connection,
        '更新名片角色'
    );
    assert.deepEqual(updateRows, [
        {
            action: '更新名片角色',
            target: `namecard_character=${created.id};agency=${agencyId}`,
            username: 'namecard-operator',
            producername: 'namecard-operator P'
        }
    ]);
    const deleteRows = await namecardAuditRows(
        fixture.connection,
        '删除名片角色'
    );
    assert.deepEqual(deleteRows, [
        {
            action: '删除名片角色',
            target: `namecard_character=${created.id}`,
            username: 'namecard-operator',
            producername: 'namecard-operator P'
        }
    ]);
});

postgresTest('refuses duplicate names, a second fallback and unknown ids', async () => {
    const { fixture, headers } = await loadFixture();
    const alpha = await insertNamecardAgency(fixture.connection, {
        code: 'conflict-alpha',
        nameCn: '冲突甲',
        displayOrder: 10000
    });
    const beta = await insertNamecardAgency(fixture.connection, {
        code: 'conflict-beta',
        nameCn: '冲突乙',
        displayOrder: 10001
    });
    const created = await seedNamecardCharacter(fixture, headers, {
        agencyId: alpha,
        category: 'idol',
        nameCn: '重名角色'
    });

    const duplicate = await testRequest(
        fixture.app,
        CHARACTERS,
        namecardJsonInit('POST', headers, {
            agencyId: alpha,
            category: 'staff',
            nameCn: '重名角色'
        })
    );
    const duplicateBody = await assertContractJson(
        duplicate,
        409,
        failureMessageResponseSchema
    );
    assert.equal(duplicateBody.message, '该企划下已存在同名角色');

    const secondFallback = await testRequest(
        fixture.app,
        CHARACTERS,
        namecardJsonInit('POST', headers, {
            agencyId: beta,
            category: 'idol',
            nameCn: '兜底偶像',
            isFallback: true
        })
    );
    const fallbackBody = await assertContractJson(
        secondFallback,
        409,
        failureMessageResponseSchema
    );
    assert.equal(fallbackBody.message, '该分类已存在兜底条目');

    const unknownAgency = await testRequest(
        fixture.app,
        CHARACTERS,
        namecardJsonInit('POST', headers, {
            agencyId: 1234567,
            category: 'idol',
            nameCn: '没有企划'
        })
    );
    const agencyBody = await assertContractJson(
        unknownAgency,
        400,
        failureMessageResponseSchema
    );
    assert.equal(agencyBody.message, '企划不存在');

    const updateMissing = await testRequest(
        fixture.app,
        `${CHARACTERS}/424242`,
        namecardJsonInit('PATCH', headers, {
            agencyId: alpha,
            category: 'idol',
            nameCn: '不存在',
            revision: 0
        })
    );
    const missingBody = await assertContractJson(
        updateMissing,
        404,
        failureMessageResponseSchema
    );
    assert.equal(missingBody.message, '名片角色不存在');

    const staleUpdate = await testRequest(
        fixture.app,
        `${CHARACTERS}/${created.id}`,
        namecardJsonInit('PATCH', headers, {
            agencyId: alpha,
            category: 'idol',
            nameCn: '重名角色',
            revision: 3
        })
    );
    const staleConflict = await assertContractJson(
        staleUpdate,
        409,
        namecardCharacterConflictSchema
    );
    assert.deepEqual(staleConflict, {
        success: false,
        code: 'NAMECARD_CHARACTER_STATE_CONFLICT',
        revision: 0
    });

    const deleteMissing = await testRequest(
        fixture.app,
        `${CHARACTERS}/424242?revision=0`,
        { method: 'DELETE', headers }
    );
    const deleteMissingBody = await assertContractJson(
        deleteMissing,
        404,
        failureMessageResponseSchema
    );
    assert.equal(deleteMissingBody.message, '名片角色不存在');

    // A rejected write leaves no audit trail behind.
    assert.deepEqual(
        await namecardAuditRows(fixture.connection, '更新名片角色'),
        []
    );
    assert.deepEqual(
        await namecardAuditRows(fixture.connection, '删除名片角色'),
        []
    );
});

postgresTest('guards the character admin routes', async () => {
    const { fixture, headers } = await loadFixture();
    const agencyId = await insertNamecardAgency(fixture.connection, {
        code: 'guard-agency',
        nameCn: '守卫企划',
        displayOrder: 10000
    });
    const created = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'idol',
        nameCn: '守卫角色'
    });
    const editorHeaders = await namecardActorHeaders(fixture, fixture.editor);
    const bearerHeaders = await namecardActorBearerHeaders(
        fixture,
        fixture.operator
    );
    const cookieOnly = { Cookie: headers.Cookie ?? '' };
    const wrongCsrf = { ...headers, 'X-CSRFToken': 'not-the-secret' };

    assert.equal((await testRequest(fixture.app, CHARACTERS)).status, 401);
    assert.equal(
        (await testRequest(fixture.app, CHARACTER_AGENCIES)).status,
        401
    );
    assert.equal(
        (
            await testRequest(
                fixture.app,
                CHARACTERS,
                namecardJsonInit('POST', {}, {
                    agencyId,
                    category: 'idol',
                    nameCn: '无令牌'
                })
            )
        ).status,
        401
    );

    assert.equal(
        (await testRequest(fixture.app, CHARACTERS, { headers: editorHeaders }))
            .status,
        403
    );
    assert.equal(
        (
            await testRequest(
                fixture.app,
                CHARACTERS,
                namecardJsonInit('POST', editorHeaders, {
                    agencyId,
                    category: 'idol',
                    nameCn: '编辑创建'
                })
            )
        ).status,
        403
    );

    for (const init of [
        namecardJsonInit('POST', cookieOnly, {
            agencyId,
            category: 'idol',
            nameCn: '缺少 CSRF'
        }),
        namecardJsonInit('PATCH', cookieOnly, {
            agencyId,
            category: 'idol',
            nameCn: '缺少 CSRF',
            revision: 0
        }),
        namecardJsonInit('POST', wrongCsrf, {
            agencyId,
            category: 'idol',
            nameCn: '错误 CSRF'
        }),
        { method: 'DELETE' as const, headers: cookieOnly }
    ]) {
        const path = init.method === 'DELETE'
            ? `${CHARACTERS}/${created.id}?revision=0`
            : init.method === 'PATCH'
              ? `${CHARACTERS}/${created.id}`
              : CHARACTERS;
        const response = await testRequest(fixture.app, path, init);
        assert.equal(response.status, 403, `${init.method} ${path}`);
    }

    // A bearer token is not a browser session, so it skips the CSRF guard.
    const bearerList = await testRequest(fixture.app, CHARACTERS, {
        headers: bearerHeaders
    });
    assert.equal(bearerList.status, 200);
    const bearerCreate = await testRequest(
        fixture.app,
        CHARACTERS,
        namecardJsonInit('POST', bearerHeaders, {
            agencyId,
            category: 'idol',
            nameCn: '令牌子创建'
        })
    );
    assert.equal(bearerCreate.status, 201);
});

postgresTest('serves the public catalog with the fallbacks and unit projection', async () => {
    const { fixture, headers } = await loadFixture();
    const agencyId = await insertNamecardAgency(fixture.connection, {
        code: 'catalog-agency',
        nameCn: '目录企划',
        displayOrder: 10000
    });
    const first = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'idol',
        nameCn: '目录一号'
    });
    const second = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'rival',
        nameCn: '目录二号'
    });
    const doomed = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'mascot',
        nameCn: '目录三号'
    });

    const unit = await seedNamecardUnit(fixture, headers, {
        nameCn: '目录组合',
        agencyIds: [agencyId, NAMECARD_OTHER_AGENCY_ID],
        memberIds: [first.id, second.id, doomed.id]
    });

    // The unit keeps the link row; the projection is what drops the member.
    const removed = await testRequest(
        fixture.app,
        `${CHARACTERS}/${doomed.id}?revision=0`,
        { method: 'DELETE', headers }
    );
    assert.equal(removed.status, 200);

    const response = await testRequest(fixture.app, CATALOG);
    const catalog = await assertContractJson(
        response,
        200,
        namecardCharacterCatalogSchema
    );

    assert.deepEqual(catalog.categories, [
        'idol',
        'staff',
        'rival',
        'mascot',
        'chara',
        'other'
    ]);
    assert.deepEqual(
        catalog.agencies.map((agency) => agency.code),
        ['catalog-agency', 'namecard-other']
    );
    assert.deepEqual(catalog.agencies[1], {
        id: NAMECARD_OTHER_AGENCY_ID,
        code: 'namecard-other',
        name: '其他',
        color: '#8A8A8A'
    });

    const fallbacks = catalog.characters.filter((entry) => entry.isFallback);
    assert.deepEqual(
        fallbacks.map((entry) => entry.nameCn),
        ['其他偶像', '其他职员', '其他对手', '其他吉祥物', '其他角色', '现实人物']
    );
    assert.equal(
        catalog.characters.some((entry) => entry.id === doomed.id),
        false
    );
    const live = catalog.characters.find((entry) => entry.id === first.id);
    assert.deepEqual(live, {
        id: first.id,
        agencyId,
        agencyCode: 'catalog-agency',
        agencyName: '目录企划',
        agencyColor: '#336699',
        category: 'idol',
        isFallback: false,
        nameCn: '目录一号',
        nameJa: null,
        nameEn: null,
        aliases: null
    });

    assert.deepEqual(catalog.units, [
        {
            id: unit.id,
            nameCn: '目录组合',
            nameJa: null,
            nameEn: null,
            aliases: null,
            agencyIds: [agencyId, NAMECARD_OTHER_AGENCY_ID],
            // The soft-deleted member disappears from the expansion.
            memberIds: [first.id, second.id]
        }
    ]);
});

postgresTest('refuses conflicting updates and unparsable delete revisions', async () => {
    const { fixture, headers } = await loadFixture();
    const agencyId = await insertNamecardAgency(fixture.connection, {
        code: 'update-guard',
        nameCn: '更新守卫',
        displayOrder: 10000
    });
    const kept = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'idol',
        nameCn: '更新甲'
    });
    const mutable = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'staff',
        nameCn: '更新乙'
    });

    // Every rejected mutation sends the same untouched snapshot, so a failure
    // that consumed the revision would surface in the last assertion.
    const base = {
        agencyId,
        category: 'staff',
        nameCn: '更新乙',
        revision: mutable.revision
    };

    const unknownAgency = await testRequest(
        fixture.app,
        `${CHARACTERS}/${mutable.id}`,
        namecardJsonInit('PATCH', headers, { ...base, agencyId: 987654 })
    );
    const unknownAgencyBody = await assertContractJson(
        unknownAgency,
        400,
        failureMessageResponseSchema
    );
    assert.equal(unknownAgencyBody.message, '企划不存在');

    const duplicateName = await testRequest(
        fixture.app,
        `${CHARACTERS}/${mutable.id}`,
        namecardJsonInit('PATCH', headers, { ...base, nameCn: kept.nameCn })
    );
    const duplicateNameBody = await assertContractJson(
        duplicateName,
        409,
        failureMessageResponseSchema
    );
    assert.equal(duplicateNameBody.message, '该企划下已存在同名角色');

    // The sentinel agency already owns the `idol` fallback bucket, so the
    // partial unique index refuses a second one in any agency.
    const secondFallback = await testRequest(
        fixture.app,
        `${CHARACTERS}/${mutable.id}`,
        namecardJsonInit('PATCH', headers, {
            ...base,
            category: 'idol',
            isFallback: true
        })
    );
    const secondFallbackBody = await assertContractJson(
        secondFallback,
        409,
        failureMessageResponseSchema
    );
    assert.equal(secondFallbackBody.message, '该分类已存在兜底条目');

    // Digits pass the query schema but `Number()` loses precision past 2^53,
    // which is what the domain parser rejects.
    const hugeRevision = await testRequest(
        fixture.app,
        `${CHARACTERS}/${mutable.id}?revision=99999999999999999999`,
        { method: 'DELETE', headers }
    );
    const hugeRevisionBody = await assertContractJson(
        hugeRevision,
        400,
        errorResponseSchema
    );
    assert.equal(hugeRevisionBody.error, '名片角色版本无效');

    const accepted = await testRequest(
        fixture.app,
        `${CHARACTERS}/${mutable.id}`,
        namecardJsonInit('PATCH', headers, { ...base, displayOrder: 7 })
    );
    const acceptedBody = await assertContractJson(
        accepted,
        200,
        namecardCharacterMutationSchema
    );
    assert.equal(acceptedBody.character.revision, mutable.revision + 1);
    assert.equal(acceptedBody.character.displayOrder, 7);
    assert.equal(acceptedBody.character.nameCn, '更新乙');
});
