/**
 * Coverage for `GET|POST|PATCH|DELETE /api/admin/cards/units*`.
 *
 * A 组合 is a search shortcut that expands into its members, so the interesting
 * parts are the link-table assembly (agencies and members travel with the unit),
 * the reference checks that answer 400 instead of leaking a foreign-key 500, and
 * the optimistic lock shared with the character catalog.
 */
import { assertContractJson } from '../contracts/contract-json';
import { postgresTest } from '../postgres-test-database';
import {
    createNamecardAdminFixture,
    insertNamecardAgency,
    NAMECARD_OTHER_AGENCY_ID,
    namecardActorHeaders,
    namecardAuditRows,
    namecardJsonInit,
    seedNamecardCharacter,
    seedNamecardUnit,
    type NamecardAdminFixture
} from './namecard-admin-fixture';
import { testRequest } from './test-app';
import {
    namecardUnitConflictSchema,
    namecardUnitDeleteSchema,
    namecardUnitListSchema,
    namecardUnitMutationSchema
} from '@imsweb/contracts/fudaba/admin-units';
import {
    errorResponseSchema,
    failureMessageResponseSchema
} from '@imsweb/contracts/common';
import { adminApiPath } from '@imsweb/contracts/paths';
import assert from 'node:assert/strict';
import { onTestFinished, vi } from 'vitest';

// Every test builds its own database and the shared allocator drops it in an
// `onTestFinished` hook. Against a loaded server that teardown outruns the 10s
// default, which is a harness limit rather than an assertion.
vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

const UNITS = adminApiPath('/cards/units');
const CHARACTERS = adminApiPath('/cards/characters');

/** Characters and the admin session the suites all start from. */
async function loadFixture(): Promise<{
    fixture: NamecardAdminFixture;
    headers: Record<string, string>;
}> {
    const fixture = await createNamecardAdminFixture();
    onTestFinished(() => fixture.close());
    const headers = await namecardActorHeaders(fixture, fixture.operator);
    return { fixture, headers };
}

postgresTest('lists units with the agencies and members that travel with them', async () => {
    const { fixture, headers } = await loadFixture();
    const alpha = await insertNamecardAgency(fixture.connection, {
        code: 'unit-alpha',
        nameCn: '组合甲',
        displayOrder: 10000,
        color: '#111111'
    });
    const beta = await insertNamecardAgency(fixture.connection, {
        code: 'unit-beta',
        nameCn: '组合乙',
        displayOrder: 10001
    });
    const idol = await seedNamecardCharacter(fixture, headers, {
        agencyId: alpha,
        category: 'idol',
        nameCn: '偶像一号',
        nameJa: 'アイドル一号'
    });
    const rival = await seedNamecardCharacter(fixture, headers, {
        agencyId: beta,
        category: 'rival',
        nameCn: '对手一号'
    });
    const staff = await seedNamecardCharacter(fixture, headers, {
        agencyId: beta,
        category: 'staff',
        nameCn: '职员一号'
    });

    const cross = await seedNamecardUnit(fixture, headers, {
        nameCn: '跨企划组合',
        nameJa: 'クロス',
        agencyIds: [alpha, beta],
        memberIds: [idol.id, rival.id]
    });
    const solo = await seedNamecardUnit(fixture, headers, {
        nameCn: '单一企划组合',
        agencyIds: [beta],
        memberIds: [staff.id]
    });

    const response = await testRequest(fixture.app, UNITS, { headers });
    const body = await assertContractJson(
        response,
        200,
        namecardUnitListSchema
    );

    assert.equal(body.units.length, 2);
    assert.deepEqual(body.pageInfo, {
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
        hasNextPage: false
    });

    const [first, second] = body.units;
    assert.equal(first?.id, cross.id);
    assert.equal(second?.id, solo.id);
    assert.equal(first?.nameJa, 'クロス');
    assert.equal(first?.nameEn, null);
    assert.equal(first?.aliases, null);
    assert.equal(first?.displayOrder, 0);
    assert.equal(first?.revision, 0);
    // Agencies and members keep the order the editor submitted them in.
    assert.deepEqual(first?.agencies, [
        { id: alpha, code: 'unit-alpha', name: '组合甲', color: '#111111' },
        { id: beta, code: 'unit-beta', name: '组合乙', color: '#336699' }
    ]);
    assert.deepEqual(first?.members, [
        {
            characterId: idol.id,
            nameCn: '偶像一号',
            nameJa: 'アイドル一号',
            nameEn: null,
            category: 'idol'
        },
        {
            characterId: rival.id,
            nameCn: '对手一号',
            nameJa: null,
            nameEn: null,
            category: 'rival'
        }
    ]);
    assert.deepEqual(second?.agencies, [
        { id: beta, code: 'unit-beta', name: '组合乙', color: '#336699' }
    ]);
    assert.deepEqual(second?.members, [
        {
            characterId: staff.id,
            nameCn: '职员一号',
            nameJa: null,
            nameEn: null,
            category: 'staff'
        }
    ]);
});

postgresTest('filters units by search term and by agency membership', async () => {
    const { fixture, headers } = await loadFixture();
    const alpha = await insertNamecardAgency(fixture.connection, {
        code: 'search-alpha',
        nameCn: '检索甲',
        displayOrder: 10000
    });
    const beta = await insertNamecardAgency(fixture.connection, {
        code: 'search-beta',
        nameCn: '检索乙',
        displayOrder: 10001
    });
    const member = await seedNamecardCharacter(fixture, headers, {
        agencyId: alpha,
        category: 'idol',
        nameCn: '检索角色'
    });

    await seedNamecardUnit(fixture, headers, {
        nameCn: '星光组合',
        agencyIds: [alpha],
        memberIds: [member.id]
    });
    await seedNamecardUnit(fixture, headers, {
        nameCn: '月光组合',
        nameJa: 'つきぐみ',
        agencyIds: [beta],
        memberIds: [member.id]
    });
    await seedNamecardUnit(fixture, headers, {
        nameCn: 'Sunny Unit',
        nameEn: 'Sunny Side',
        aliases: 'sunny,さんさん',
        agencyIds: [alpha, beta],
        memberIds: [member.id]
    });

    const findNames = async (search: string): Promise<string[]> => {
        const response = await testRequest(
            fixture.app,
            `${UNITS}?${search}`,
            { headers }
        );
        const body = await assertContractJson(
            response,
            200,
            namecardUnitListSchema
        );
        return body.units.map((unit) => unit.nameCn);
    };

    assert.deepEqual(await findNames('query=%E6%98%9F%E5%85%89'), ['星光组合']);
    assert.deepEqual(await findNames('query=%E3%81%A4%E3%81%8D'), ['月光组合']);
    assert.deepEqual(await findNames('query=sunny%20side'), ['Sunny Unit']);
    assert.deepEqual(await findNames('query=%E3%81%95%E3%82%93%E3%81%95%E3%82%93'), [
        'Sunny Unit'
    ]);
    assert.deepEqual(await findNames('query=%25'), []);

    // Agency membership, not ownership: the cross-agency unit answers for both.
    assert.deepEqual(await findNames(`agencyId=${alpha}`), [
        '星光组合',
        'Sunny Unit'
    ]);
    assert.deepEqual(await findNames(`agencyId=${beta}`), [
        '月光组合',
        'Sunny Unit'
    ]);

    const sentinelResponse = await testRequest(
        fixture.app,
        `${UNITS}?agencyId=${NAMECARD_OTHER_AGENCY_ID}`,
        { headers }
    );
    const sentinelBody = await assertContractJson(
        sentinelResponse,
        200,
        namecardUnitListSchema
    );
    assert.deepEqual(sentinelBody.units, []);
});

postgresTest('pages the unit list and rejects malformed filters', async () => {
    const { fixture, headers } = await loadFixture();
    const agencyId = await insertNamecardAgency(fixture.connection, {
        code: 'page-unit-agency',
        nameCn: '分页组合企划',
        displayOrder: 10000
    });
    const member = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'idol',
        nameCn: '分页组合角色'
    });
    for (const nameCn of ['分页组合一', '分页组合二', '分页组合三']) {
        await seedNamecardUnit(fixture, headers, {
            nameCn,
            agencyIds: [agencyId],
            memberIds: [member.id]
        });
    }

    const response = await testRequest(
        fixture.app,
        `${UNITS}?page=2&pageSize=2`,
        { headers }
    );
    const body = await assertContractJson(
        response,
        200,
        namecardUnitListSchema
    );
    assert.deepEqual(
        body.units.map((unit) => unit.nameCn),
        ['分页组合三']
    );
    assert.deepEqual(body.pageInfo, {
        page: 2,
        pageSize: 2,
        total: 3,
        totalPages: 2,
        hasNextPage: false
    });

    // Schema failures only promise the shared `{ error }` envelope of the
    // validation middleware.
    for (const search of ['pageSize=-2', 'page=abc']) {
        const invalid = await testRequest(
            fixture.app,
            `${UNITS}?${search}`,
            { headers }
        );
        assert.equal(invalid.status, 400, `expected 400 for ?${search}`);
        const failure = await assertContractJson(
            invalid,
            400,
            errorResponseSchema
        );
        assert.ok(failure.error.length > 0, `empty error for ?${search}`);
    }

    // `0` passes the digit-only schema and fails the domain parser.
    const zeroAgency = await testRequest(
        fixture.app,
        `${UNITS}?agencyId=0`,
        { headers }
    );
    const zeroAgencyBody = await assertContractJson(
        zeroAgency,
        400,
        errorResponseSchema
    );
    assert.equal(zeroAgencyBody.error, '企划 ID 无效');
});

postgresTest('refuses duplicate unit names and unreachable references', async () => {
    const { fixture, headers } = await loadFixture();
    const agencyId = await insertNamecardAgency(fixture.connection, {
        code: 'ref-agency',
        nameCn: '引用企划',
        displayOrder: 10000
    });
    const member = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'idol',
        nameCn: '引用角色'
    });
    const doomed = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'staff',
        nameCn: '将被删除的角色'
    });

    const created = await seedNamecardUnit(fixture, headers, {
        nameCn: '重名组合',
        agencyIds: [agencyId],
        memberIds: [member.id]
    });

    const duplicate = await testRequest(
        fixture.app,
        UNITS,
        namecardJsonInit('POST', headers, {
            nameCn: '重名组合',
            agencyIds: [agencyId],
            memberIds: [member.id]
        })
    );
    const duplicateBody = await assertContractJson(
        duplicate,
        409,
        failureMessageResponseSchema
    );
    assert.equal(duplicateBody.message, '已存在同名名片组合');

    const duplicateAgencies = await testRequest(
        fixture.app,
        UNITS,
        namecardJsonInit('POST', headers, {
            nameCn: '重复企划组合',
            agencyIds: [agencyId, agencyId],
            memberIds: [member.id]
        })
    );
    // Duplicated ids fail the schema, so this is the middleware envelope.
    const duplicateAgenciesBody = await assertContractJson(
        duplicateAgencies,
        400,
        errorResponseSchema
    );
    assert.ok(duplicateAgenciesBody.error.length > 0);

    const unknownAgencies = await testRequest(
        fixture.app,
        UNITS,
        namecardJsonInit('POST', headers, {
            nameCn: '未知企划组合',
            agencyIds: [1234567, 7654321],
            memberIds: [member.id]
        })
    );
    const unknownAgenciesBody = await assertContractJson(
        unknownAgencies,
        400,
        failureMessageResponseSchema
    );
    assert.equal(unknownAgenciesBody.message, '企划不存在：1234567、7654321');

    const unknownMembers = await testRequest(
        fixture.app,
        UNITS,
        namecardJsonInit('POST', headers, {
            nameCn: '未知角色组合',
            agencyIds: [agencyId],
            memberIds: [9999999]
        })
    );
    const unknownMembersBody = await assertContractJson(
        unknownMembers,
        400,
        failureMessageResponseSchema
    );
    assert.equal(unknownMembersBody.message, '名片角色不存在：9999999');

    // A soft-deleted character counts as missing: a unit must not expand into a
    // character the catalog no longer offers.
    const removal = await testRequest(
        fixture.app,
        `${CHARACTERS}/${doomed.id}?revision=0`,
        { method: 'DELETE', headers }
    );
    assert.equal(removal.status, 200);
    const deletedMember = await testRequest(
        fixture.app,
        UNITS,
        namecardJsonInit('POST', headers, {
            nameCn: '含已删角色的组合',
            agencyIds: [agencyId],
            memberIds: [doomed.id]
        })
    );
    const deletedMemberBody = await assertContractJson(
        deletedMember,
        400,
        failureMessageResponseSchema
    );
    assert.equal(
        deletedMemberBody.message,
        `名片角色不存在：${doomed.id}`
    );

    // The soft-deleted member also drops out of a unit that already listed it.
    const stale = await testRequest(
        fixture.app,
        `${UNITS}/${created.id}`,
        namecardJsonInit('PATCH', headers, {
            nameCn: '重名组合',
            agencyIds: [agencyId],
            memberIds: [member.id, doomed.id],
            revision: 0
        })
    );
    const staleBody = await assertContractJson(
        stale,
        400,
        failureMessageResponseSchema
    );
    assert.equal(staleBody.message, `名片角色不存在：${doomed.id}`);

    assert.deepEqual(await namecardAuditRows(fixture.connection, '创建名片组合'), [
        {
            action: '创建名片组合',
            target: `namecard_unit=${created.id};agencies=${agencyId}`,
            username: 'namecard-operator',
            producername: 'namecard-operator P'
        }
    ]);
});

postgresTest('updates and deletes a unit under the revision guard', async () => {
    const { fixture, headers } = await loadFixture();
    const alpha = await insertNamecardAgency(fixture.connection, {
        code: 'write-alpha',
        nameCn: '写入甲',
        displayOrder: 10000
    });
    const beta = await insertNamecardAgency(fixture.connection, {
        code: 'write-beta',
        nameCn: '写入乙',
        displayOrder: 10001
    });
    const first = await seedNamecardCharacter(fixture, headers, {
        agencyId: alpha,
        category: 'idol',
        nameCn: '写入角色一'
    });
    const second = await seedNamecardCharacter(fixture, headers, {
        agencyId: beta,
        category: 'staff',
        nameCn: '写入角色二'
    });
    const created = await seedNamecardUnit(fixture, headers, {
        nameCn: '写入组合',
        agencyIds: [alpha],
        memberIds: [first.id]
    });

    const updateResponse = await testRequest(
        fixture.app,
        `${UNITS}/${created.id}`,
        namecardJsonInit('PATCH', headers, {
            nameCn: '写入组合改',
            nameEn: 'Write Unit',
            aliases: 'write',
            displayOrder: 3,
            agencyIds: [alpha, beta],
            memberIds: [second.id, first.id],
            revision: 0
        })
    );
    const updated = (
        await assertContractJson(
            updateResponse,
            200,
            namecardUnitMutationSchema
        )
    ).unit;
    assert.equal(updated.id, created.id);
    assert.equal(updated.revision, 1);
    assert.equal(updated.nameCn, '写入组合改');
    assert.equal(updated.nameEn, 'Write Unit');
    assert.equal(updated.nameJa, null);
    assert.equal(updated.aliases, 'write');
    assert.equal(updated.displayOrder, 3);
    assert.deepEqual(
        updated.agencies.map((agency) => agency.id),
        [alpha, beta]
    );
    assert.deepEqual(
        updated.members.map((entry) => entry.characterId),
        [second.id, first.id]
    );

    const staleUpdate = await testRequest(
        fixture.app,
        `${UNITS}/${created.id}`,
        namecardJsonInit('PATCH', headers, {
            nameCn: '写入组合改',
            agencyIds: [alpha],
            memberIds: [first.id],
            revision: 0
        })
    );
    const staleConflict = await assertContractJson(
        staleUpdate,
        409,
        namecardUnitConflictSchema
    );
    assert.deepEqual(staleConflict, {
        success: false,
        code: 'NAMECARD_UNIT_STATE_CONFLICT',
        revision: 1
    });

    const missingUpdate = await testRequest(
        fixture.app,
        `${UNITS}/424242`,
        namecardJsonInit('PATCH', headers, {
            nameCn: '不存在的组合',
            agencyIds: [alpha],
            memberIds: [first.id],
            revision: 0
        })
    );
    const missingUpdateBody = await assertContractJson(
        missingUpdate,
        404,
        failureMessageResponseSchema
    );
    assert.equal(missingUpdateBody.message, '名片组合不存在');

    const staleDelete = await testRequest(
        fixture.app,
        `${UNITS}/${created.id}?revision=0`,
        { method: 'DELETE', headers }
    );
    const staleDeleteBody = await assertContractJson(
        staleDelete,
        409,
        namecardUnitConflictSchema
    );
    assert.deepEqual(staleDeleteBody, {
        success: false,
        code: 'NAMECARD_UNIT_STATE_CONFLICT',
        revision: 1
    });

    const deletedResponse = await testRequest(
        fixture.app,
        `${UNITS}/${created.id}?revision=1`,
        { method: 'DELETE', headers }
    );
    const deleted = await assertContractJson(
        deletedResponse,
        200,
        namecardUnitDeleteSchema
    );
    assert.deepEqual(deleted, { success: true, id: created.id });

    const deletedAgain = await testRequest(
        fixture.app,
        `${UNITS}/${created.id}?revision=1`,
        { method: 'DELETE', headers }
    );
    const gone = await assertContractJson(
        deletedAgain,
        404,
        failureMessageResponseSchema
    );
    assert.equal(gone.message, '名片组合不存在');

    const listResponse = await testRequest(fixture.app, UNITS, { headers });
    const listed = await assertContractJson(
        listResponse,
        200,
        namecardUnitListSchema
    );
    assert.equal(
        listed.units.some((unit) => unit.id === created.id),
        false
    );

    assert.deepEqual(await namecardAuditRows(fixture.connection, '创建名片组合'), [
        {
            action: '创建名片组合',
            target: `namecard_unit=${created.id};agencies=${alpha}`,
            username: 'namecard-operator',
            producername: 'namecard-operator P'
        }
    ]);
    assert.deepEqual(await namecardAuditRows(fixture.connection, '更新名片组合'), [
        {
            action: '更新名片组合',
            target: `namecard_unit=${created.id};agencies=${alpha},${beta}`,
            username: 'namecard-operator',
            producername: 'namecard-operator P'
        }
    ]);
    assert.deepEqual(await namecardAuditRows(fixture.connection, '删除名片组合'), [
        {
            action: '删除名片组合',
            target: `namecard_unit=${created.id}`,
            username: 'namecard-operator',
            producername: 'namecard-operator P'
        }
    ]);
});

postgresTest('guards the unit admin routes', async () => {
    const { fixture, headers } = await loadFixture();
    const agencyId = await insertNamecardAgency(fixture.connection, {
        code: 'guard-unit-agency',
        nameCn: '守卫组合企划',
        displayOrder: 10000
    });
    const member = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'idol',
        nameCn: '守卫组合角色'
    });
    const created = await seedNamecardUnit(fixture, headers, {
        nameCn: '守卫组合',
        agencyIds: [agencyId],
        memberIds: [member.id]
    });
    const editorHeaders = await namecardActorHeaders(fixture, fixture.editor);
    const cookieOnly = { Cookie: headers.Cookie ?? '' };
    const wrongCsrf = { ...headers, 'X-CSRFToken': 'not-the-secret' };

    assert.equal((await testRequest(fixture.app, UNITS)).status, 401);
    assert.equal(
        (
            await testRequest(
                fixture.app,
                UNITS,
                namecardJsonInit('POST', {}, {
                    nameCn: '无令牌组合',
                    agencyIds: [agencyId],
                    memberIds: [member.id]
                })
            )
        ).status,
        401
    );

    assert.equal(
        (await testRequest(fixture.app, UNITS, { headers: editorHeaders }))
            .status,
        403
    );
    assert.equal(
        (
            await testRequest(
                fixture.app,
                UNITS,
                namecardJsonInit('POST', editorHeaders, {
                    nameCn: '编辑组合',
                    agencyIds: [agencyId],
                    memberIds: [member.id]
                })
            )
        ).status,
        403
    );

    for (const [method, path] of [
        ['POST', UNITS],
        ['PATCH', `${UNITS}/${created.id}`],
        ['DELETE', `${UNITS}/${created.id}?revision=0`]
    ] as const) {
        for (const badHeaders of [cookieOnly, wrongCsrf]) {
            const response = await testRequest(
                fixture.app,
                path,
                method === 'DELETE'
                    ? { method, headers: badHeaders }
                    : namecardJsonInit(method, badHeaders, {
                          nameCn: '缺少 CSRF',
                          agencyIds: [agencyId],
                          memberIds: [member.id],
                          revision: 0
                      })
            );
            assert.equal(response.status, 403, `${method} ${path}`);
        }
    }
});

postgresTest('reads a whole page of units without one query per unit', async () => {
    const { fixture, headers } = await loadFixture();
    const agencyId = await insertNamecardAgency(fixture.connection, {
        code: 'batch-agency',
        nameCn: '批量企划',
        displayOrder: 10000
    });
    const first = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'idol',
        nameCn: '批量角色一'
    });
    const second = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'staff',
        nameCn: '批量角色二'
    });
    await seedNamecardUnit(fixture, headers, {
        nameCn: '批量组合一',
        agencyIds: [agencyId],
        memberIds: [first.id, second.id]
    });

    // Agency and member rows are fetched with one `IN` query per link table for
    // the whole page, so adding units must not add statements.
    const originalPrepare = fixture.connection.prepare.bind(
        fixture.connection
    );
    let preparedStatements = 0;
    Object.assign(fixture.connection, {
        prepare(sql: string) {
            preparedStatements += 1;
            return originalPrepare(sql);
        }
    });
    const countStatements = async (): Promise<number> => {
        preparedStatements = 0;
        const response = await testRequest(fixture.app, UNITS, { headers });
        assert.equal(response.status, 200);
        return preparedStatements;
    };

    const oneUnit = await countStatements();
    assert.ok(oneUnit > 0, 'the list must hit the repository');
    for (const nameCn of ['批量组合二', '批量组合三', '批量组合四']) {
        await seedNamecardUnit(fixture, headers, {
            nameCn,
            agencyIds: [agencyId],
            memberIds: [first.id, second.id]
        });
    }
    const fourUnits = await countStatements();
    assert.equal(fourUnits, oneUnit);
});

postgresTest('refuses unknown references, duplicate names and huge revisions on update', async () => {
    const { fixture, headers } = await loadFixture();
    const agencyId = await insertNamecardAgency(fixture.connection, {
        code: 'unit-update-guard',
        nameCn: '组合更新守卫',
        displayOrder: 10000
    });
    const member = await seedNamecardCharacter(fixture, headers, {
        agencyId,
        category: 'idol',
        nameCn: '组合更新角色'
    });
    const kept = await seedNamecardUnit(fixture, headers, {
        nameCn: '更新组合甲',
        agencyIds: [agencyId],
        memberIds: [member.id]
    });
    const mutable = await seedNamecardUnit(fixture, headers, {
        nameCn: '更新组合乙',
        agencyIds: [agencyId],
        memberIds: [member.id]
    });

    const base = {
        nameCn: '更新组合乙',
        agencyIds: [agencyId],
        memberIds: [member.id],
        revision: mutable.revision
    };

    const unknownAgency = await testRequest(
        fixture.app,
        `${UNITS}/${mutable.id}`,
        namecardJsonInit('PATCH', headers, { ...base, agencyIds: [7654321] })
    );
    const unknownAgencyBody = await assertContractJson(
        unknownAgency,
        400,
        failureMessageResponseSchema
    );
    assert.equal(unknownAgencyBody.message, '企划不存在：7654321');

    const duplicateName = await testRequest(
        fixture.app,
        `${UNITS}/${mutable.id}`,
        namecardJsonInit('PATCH', headers, { ...base, nameCn: kept.nameCn })
    );
    const duplicateNameBody = await assertContractJson(
        duplicateName,
        409,
        failureMessageResponseSchema
    );
    assert.equal(duplicateNameBody.message, '已存在同名名片组合');

    const hugeRevision = await testRequest(
        fixture.app,
        `${UNITS}/${mutable.id}?revision=99999999999999999999`,
        { method: 'DELETE', headers }
    );
    const hugeRevisionBody = await assertContractJson(
        hugeRevision,
        400,
        errorResponseSchema
    );
    assert.equal(hugeRevisionBody.error, '名片组合版本无效');

    // The rejected mutations left the optimistic lock alone.
    const accepted = await testRequest(
        fixture.app,
        `${UNITS}/${mutable.id}`,
        namecardJsonInit('PATCH', headers, { ...base, displayOrder: 9 })
    );
    const acceptedBody = await assertContractJson(
        accepted,
        200,
        namecardUnitMutationSchema
    );
    assert.equal(acceptedBody.unit.revision, mutable.revision + 1);
    assert.equal(acceptedBody.unit.displayOrder, 9);
    assert.deepEqual(
        acceptedBody.unit.agencies.map((agency) => agency.id),
        [agencyId]
    );
    assert.deepEqual(
        acceptedBody.unit.members.map((entry) => entry.characterId),
        [member.id]
    );
});
