import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
    adminCatalogSchema,
    catalogBirthdaysSchema,
    adminCatalogHttpErrorSchema,
    adminCatalogCreateCharacterResponseSchema,
    adminCatalogStoryTargetResponseSchema,
} from '@imsweb/contracts/catalog';
import type { AdminCatalogProfileRequest } from '@imsweb/contracts/catalog';
import { adminApiPath, apiPath } from '@imsweb/contracts/paths';
import { SqlCatalogRepository } from '@/infra/db/repositories/catalog-repository';
import { SqlFudabaRepository } from '@/infra/db/repositories/fudaba-repository';
import { SqlNamecardCharacterRepository } from '@/infra/db/repositories/namecard-character-repository';
import { SqlNamecardUnitRepository } from '@/infra/db/repositories/namecard-unit-repository';
import { SqlStoryRepository } from '@/infra/db/repositories/story-repository';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { queryOne } from '@/infra/db/sql/query';
import { assertContractJson } from '../contracts/contract-json';
import { cardPageWrite } from '../fixtures/owner-route-fixture';
import { insertPlatformAccount } from '../fixtures/rows';
import { createWikiFixture } from '../wiki/fixture';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { FilesystemObjectStorage } from '@/infra/oss/filesystem/object-storage';
import { FilesystemCompensationService } from '@/infra/oss/filesystem/compensation-service';
import { S3CompensationService } from '@/infra/oss/s3/compensation-service';
import { S3UploadStateMachine } from '@/infra/oss/s3/upload-state-machine';
import { postgresIntegrationEnabled } from '../integration/postgres-harness';
import { testRequest } from './test-app';
import {
    createNamecardAdminFixture,
    insertNamecardAgency,
    namecardActorHeaders,
    namecardJsonInit,
    seedNamecardCharacter,
    seedNamecardUnit,
    type NamecardAdminFixture,
} from './namecard-admin-fixture';

describe.skipIf(!postgresIntegrationEnabled())(
    'shared character catalog',
    () => {
        let fixture: NamecardAdminFixture;
        let headers: Record<string, string>;
        let catalog: SqlCatalogRepository;
        let story: SqlStoryRepository;
        let projectId: number;
        let otherProjectId: number;
        let characterId: number;

        beforeEach(async () => {
            fixture = await createNamecardAdminFixture();
            headers = await namecardActorHeaders(fixture, fixture.operator);
            catalog = new SqlCatalogRepository(fixture.connection);
            story = new SqlStoryRepository(
                fixture.connection,
                new PostgresqlSchemaStrategy(),
            );
            projectId = await insertNamecardAgency(fixture.connection, {
                code: 'catalog-one',
                nameCn: '目录企划一',
                displayOrder: 1,
            });
            otherProjectId = await insertNamecardAgency(fixture.connection, {
                code: 'catalog-two',
                nameCn: '目录企划二',
                displayOrder: 2,
            });
            const character = await seedNamecardCharacter(fixture, headers, {
                agencyId: projectId,
                category: 'idol',
                nameCn: '目录人物',
            });
            characterId = character.id;
        });
        afterEach(async () => {
            await fixture?.close();
        });

        function profile(project = projectId): AdminCatalogProfileRequest {
            return {
                kind: 'character',
                ownerId: characterId,
                projectId: project,
                revision: null,
                aliases: null,
                category: 'idol',
                displayOrder: 0,
                isFallback: false,
                nameCn: '企划人物',
                nameJa: null,
                nameEn: null,
                color: '#123456',
                birthMonth: 2,
                birthDay: 29,
                biography: '人物资料',
                voiceStatus: 'voiced',
                cvName: '测试声优',
                profileUrl: null,
            };
        }

        test('public birthdays use one complete eligible profile per identity and reflect edits', async () => {
            const primary = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!.profiles[0];
            const read = async () =>
                assertContractJson(
                    await testRequest(fixture.app, apiPath('/birthdays')),
                    200,
                    catalogBirthdaysSchema,
                );
            expect((await read()).items).toEqual([]);
            await catalog.saveProfile({
                ...profile(),
                revision: primary.revision,
                nameCn: '默认生日人物',
                birthMonth: 4,
                birthDay: 3,
            });
            await catalog.saveProfile({
                ...profile(otherProjectId),
                nameCn: '另企划生日人物',
                birthMonth: 2,
                birthDay: 29,
            });
            let result = await read();
            expect(result.items).toEqual([
                {
                    characterId,
                    profileId: primary.id,
                    projectId,
                    name: '默认生日人物',
                    agency: '目录企划一',
                    color: '#123456',
                    month: 4,
                    day: 3,
                    story: null,
                },
            ]);
            const owner = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!;
            const other = owner.profiles.find(
                (p) => p.projectId === otherProjectId,
            )!;
            await catalog.setDefaultProfile({
                ownerId: characterId,
                profileId: other.id,
                revision: owner.revision,
            });
            result = await read();
            expect(result.items).toHaveLength(1);
            expect(result.items[0]).toMatchObject({
                profileId: other.id,
                name: '另企划生日人物',
                month: 2,
                day: 29,
            });
        });

        test('birthday story targets require a visible bound entry in an enabled project', async () => {
            const primary = (await catalog.snapshot()).characters.find(c => c.id === characterId)!.profiles[0];
            await catalog.saveProfile({ ...profile(), revision: primary.revision });
            const read = async () => assertContractJson(
                await testRequest(fixture.app, apiPath('/birthdays')), 200, catalogBirthdaysSchema
            );
            expect((await read()).items[0]).toMatchObject({ story: null });
            const target = await entry('生日入口');
            await catalog.saveBinding({ kind: 'entry', id: target.id, revision: 0, source: 'character', profileId: primary.id });
            await fixture.connection.prepare('UPDATE wiki_project_settings SET is_enabled=TRUE WHERE project_id=?').bind(projectId).run();
            expect((await read()).items[0]).toMatchObject({ story: { agency: 'catalog-one', idol: '企划人物' } });
            await fixture.connection.prepare('UPDATE wiki_entries SET is_visible=FALSE WHERE id=?').bind(target.id).run();
            expect((await read()).items[0]).toMatchObject({ story: null });
            await fixture.connection.prepare('UPDATE wiki_entries SET is_visible=TRUE WHERE id=?').bind(target.id).run();
            await fixture.connection.prepare('UPDATE wiki_project_settings SET is_enabled=FALSE WHERE project_id=?').bind(projectId).run();
            expect((await read()).items[0]).toMatchObject({ story: null });
            await fixture.connection.prepare('UPDATE wiki_project_settings SET is_enabled=TRUE WHERE project_id=?').bind(projectId).run();
            await fixture.connection.prepare('UPDATE wiki_entries SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').bind(target.id).run();
            expect((await read()).items[0]).toMatchObject({ story: null });
        });

        test('birthdays exclude non-idols, missing dates, retired identities and fallback options', async () => {
            const staff = await seedNamecardCharacter(fixture, headers, {
                agencyId: projectId,
                category: 'staff',
                nameCn: '工作人员',
            });
            const retired = await seedNamecardCharacter(fixture, headers, {
                agencyId: projectId,
                category: 'idol',
                nameCn: '停用人物',
            });
            const fallback = (await catalog.snapshot()).characters.find((c) => c.isFallback && c.profiles.some((p) => p.category === 'idol'))!;
            const fallbackProfile = fallback.profiles.find((p) => p.id === fallback.defaultProfileId)!;
            await catalog.saveProfile({ ...profile(fallbackProfile.projectId),ownerId: fallback.id,revision: fallbackProfile.revision,nameCn: fallback.name,isFallback: true });
            for (const [owner, category, isFallback] of [
                [staff, 'staff', false],
                [retired, 'idol', false],
            ] as const) {
                await catalog.saveProfile({
                    ...profile(),
                    ownerId: owner.id,
                    revision: 0,
                    nameCn: owner.nameCn,
                    category,
                    isFallback,
                });
            }
            await fixture.connection
                .prepare(
                    'UPDATE catalog_characters SET deleted_at=CURRENT_TIMESTAMP WHERE id=?',
                )
                .bind(retired.id)
                .run();
            const result = await assertContractJson(
                await testRequest(fixture.app, apiPath('/birthdays')),
                200,
                catalogBirthdaysSchema,
            );
            expect(result.items).toEqual([]);
        });

        test('selects a character profile for stories once and reads renamed shared data through the same links', async () => {
            const owner = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!;
            const primary = owner.profiles[0];
            const url = adminApiPath('/catalog/story-target');
            const target = await assertContractJson(
                await testRequest(
                    fixture.app,
                    url,
                    namecardJsonInit('POST', headers, {
                        profileId: primary.id,
                    }),
                ),
                200,
                adminCatalogStoryTargetResponseSchema,
            );
            expect(target).toMatchObject({
                characterId,
                profileId: primary.id,
                projectId,
                projectCode: 'catalog-one',
            });
            const repeated = await Promise.all([
                catalog.ensureCharacterStoryTarget(primary.id),
                catalog.ensureCharacterStoryTarget(primary.id),
            ]);
            expect(repeated.map((v) => v.entryId)).toEqual([
                target.entryId,
                target.entryId,
            ]);
            expect(
                await queryOne(
                    fixture.connection,
                    'SELECT COUNT(*)::int AS count FROM wiki_navigation_group_entries WHERE entry_id=?',
                    [target.entryId],
                ),
            ).toEqual({ count: 0 });
            await story.ensureWikiCategory(
                projectId,
                target.entryId,
                '主线',
                'main',
            );
            const linkId = await story.insertStoryReturningId({
                agencyCode: 'catalog-one',
                idolId: target.entryId,
                category: '主线',
                cardName: '关联测试',
                upName: '投稿者',
                videoTitle: '原剧情标题',
                url: 'https://example.test/watch',
                subtitle: '',
                imageFile: null,
                contentTypeId: 1,
                sourcePlatformId: 2,
                imageTransform: {
                    fit: 'cover',
                    focalX: 0.5,
                    focalY: 0.5,
                    zoom: 1,
                    rotation: 0,
                },
            });
            await expect(
                catalog.saveBinding({
                    kind: 'entry',
                    id: target.entryId,
                    revision: 0,
                    source: 'independent',
                    profileId: null,
                }),
            ).rejects.toMatchObject({ status: 409 });
            await catalog.saveProfile({
                ...profile(),
                revision: primary.revision,
                nameCn: '关联更新名称',
            });
            expect((await story.findIdolById(target.entryId))?.name_cn).toBe(
                '关联更新名称',
            );
            expect(
                (await story.findIdolByAgencyAndName(projectId, '目录人物'))
                    ?.id,
            ).toBe(target.entryId);
            expect(
                (
                    await story.findStoryById(
                        'catalog-one',
                        target.entryId,
                        linkId,
                    )
                )?.video_title,
            ).toBe('原剧情标题');
            expect(
                (
                    await new SqlNamecardCharacterRepository(
                        fixture.connection,
                    ).listNamecardCharacters({
                        agencyId: projectId,
                        query: null,
                        category: null,
                        limit: 100,
                        offset: 0,
                    })
                ).find((c) => c.id === characterId)?.name_cn,
            ).toBe('关联更新名称');
            const stored = await queryOne<{
                local_image_object_key: string | null;
                character_profile_id: number;
            }>(
                fixture.connection,
                'SELECT character_profile_id,local_image_object_key FROM wiki_entries WHERE id=?',
                [target.entryId],
            );
            expect(stored).toEqual({
                character_profile_id: primary.id,
                local_image_object_key: null,
            });
        });

        test('requires editor permission and CSRF, and refuses guessing same-name story associations', async () => {
            const primary = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!.profiles[0];
            const url = adminApiPath('/catalog/story-target');
            await assertContractJson(
                await testRequest(fixture.app, url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profileId: primary.id }),
                }),
                401,
                adminCatalogHttpErrorSchema,
            );
            const missingCsrf = { ...headers };
            delete missingCsrf['X-CSRFToken'];
            delete missingCsrf['x-csrftoken'];
            await assertContractJson(
                await testRequest(
                    fixture.app,
                    url,
                    namecardJsonInit('POST', missingCsrf, {
                        profileId: primary.id,
                    }),
                ),
                403,
                adminCatalogHttpErrorSchema,
            );
            const editorHeaders = await namecardActorHeaders(
                fixture,
                fixture.editor,
            );
            await assertContractJson(
                await testRequest(
                    fixture.app,
                    url,
                    namecardJsonInit('POST', editorHeaders, {
                        profileId: 999999,
                    }),
                ),
                404,
                adminCatalogHttpErrorSchema,
            );
            await fixture.connection
                .prepare(
                    'INSERT INTO idols(agency_id,name_cn,folder_name) VALUES (?,?,?)',
                )
                .bind(projectId, '目录人物', 'manual-character')
                .run();
            await assertContractJson(
                await testRequest(
                    fixture.app,
                    url,
                    namecardJsonInit('POST', editorHeaders, {
                        profileId: primary.id,
                    }),
                ),
                409,
                adminCatalogHttpErrorSchema,
            );
            expect(
                await queryOne(
                    fixture.connection,
                    'SELECT COUNT(*)::int AS count FROM wiki_entries WHERE character_profile_id=?',
                    [primary.id],
                ),
            ).toEqual({ count: 0 });
        });

        async function entry(name = '独立入口') {
            return story.createWikiIdol({
                agencyId: projectId,
                name,
                folderName: `entry-${crypto.randomUUID()}`,
                color: '#654321',
                wikiEnabled: true,
                textColor: '#ffffff',
                imageFit: 'cover',
                groupIds: [],
                entryKind: 'idol',
            });
        }

        test('preserves the legacy namecard projection while adding project participation', async () => {
            const characters = new SqlNamecardCharacterRepository(
                fixture.connection,
            );
            const before = await characters.listNamecardCharacterCatalog();
            await catalog.saveProfile(profile(otherProjectId));
            expect(await characters.listNamecardCharacterCatalog()).toEqual(
                before,
            );
            const response = await testRequest(
                fixture.app,
                adminApiPath('/catalog'),
                { headers },
            );
            const snapshot = await assertContractJson(
                response,
                200,
                adminCatalogSchema,
            );
            const character = snapshot.characters.find(
                (c) => c.id === characterId,
            )!;
            expect(character.profiles.map((p) => p.projectId).sort()).toEqual(
                [projectId, otherProjectId].sort(),
            );
            expect(
                character.profiles.find(
                    (p) => p.id === character.defaultProfileId,
                )?.projectId,
            ).toBe(projectId);
        });

        test('creates one complete default project profile without identity business columns', async () => {
            const {
                kind: _kind,
                ownerId: _owner,
                revision: _revision,
                ...input
            } = profile();
            void _kind;
            void _owner;
            void _revision;
            const response = await testRequest(
                fixture.app,
                adminApiPath('/catalog/characters'),
                namecardJsonInit('POST', headers, {
                    ...input,
                    nameCn: '档案新人物',
                    aliases: '旧称一,别名二',
                    category: 'staff',
                    displayOrder: 9,
                }),
            );
            const created = await assertContractJson(
                response,
                200,
                adminCatalogCreateCharacterResponseSchema,
            );
            const owner = (await catalog.snapshot()).characters.find(
                (c) => c.id === created.characterId,
            )!;
            expect(owner.defaultProfileId).toBe(created.profileId);
            expect(owner.profiles[0]).toMatchObject({
                nameCn: '档案新人物',
                aliases: '旧称一,别名二',
                category: 'staff',
                displayOrder: 9,
                cvName: '测试声优',
            });
            const columns = await fixture.connection
                .prepare(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='catalog_characters'",
                )
                .all<{ column_name: string }>();
            expect(
                columns.results
                    .map((c) => c.column_name)
                    .filter((name) =>
                        [
                            'name_cn',
                            'category',
                            'aliases',
                            'display_order',
                        ].includes(name),
                    ),
            ).toEqual([]);
            const row = await new SqlNamecardCharacterRepository(
                fixture.connection,
            ).findNamecardCharacterById(created.characterId);
            expect(row).toMatchObject({
                name_cn: '档案新人物',
                aliases: '旧称一,别名二',
                category: 'staff',
                display_order: 9,
            });
            const editor = await namecardActorHeaders(fixture, fixture.editor);
            expect(
                (
                    await testRequest(
                        fixture.app,
                        adminApiPath('/catalog/characters'),
                        namecardJsonInit('POST', editor, input),
                    )
                ).status,
            ).toBe(403);
        });

        test('reads saved card favorites from the default project profile and preserves their identity IDs', async () => {
            await insertPlatformAccount(fixture.connection, 'profile-owner');
            const cards = new SqlFudabaRepository(
                fixture.connection,
                new PostgresqlSchemaStrategy(),
            );
            const now = new Date().toISOString();
            await cards.createCard({
                id: 'profile-card',
                ownerAccountId: 'profile-owner',
                producerName: '测试制作人',
                seriesCodes: ['catalog-one'],
                favoriteCharacterIds: [characterId],
                pages: [cardPageWrite('front')],
                bio: '',
                tradeNote: '',
                exchangeMode: 'none',
                madeOn: null,
                groupName: null,
                producerReading: null,
                isOriginal: false,
                madeWithAi: false,
                visible: true,
                publicationStatus: 'published',
                revision: 0,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
            });
            await catalog.saveProfile({
                ...profile(otherProjectId),
                nameCn: '企划二人物',
                aliases: '另一个称呼',
                category: 'rival',
                displayOrder: 7,
            });
            const owner = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!;
            const target = owner.profiles.find(
                (p) => p.projectId === otherProjectId,
            )!;
            await catalog.setDefaultProfile({
                ownerId: characterId,
                profileId: target.id,
                revision: owner.revision,
            });
            expect(
                await cards.attachCardFavorites('profile-card', [characterId]),
            ).toMatchObject([
                {
                    character_id: characterId,
                    name_cn: '企划二人物',
                    agency_code: 'catalog-two',
                },
            ]);
            expect(
                await queryOne(
                    fixture.connection,
                    'SELECT character_id FROM fudaba_card_favorite_characters WHERE card_id=?',
                    ['profile-card'],
                ),
            ).toEqual({ character_id: characterId });
            expect(
                await new SqlNamecardCharacterRepository(
                    fixture.connection,
                ).findNamecardCharacterById(characterId),
            ).toMatchObject({
                category: 'rival',
                aliases: '另一个称呼',
                display_order: 7,
                agency_id: otherProjectId,
            });
            await expect(
                catalog.setDefaultProfile({
                    ownerId: characterId,
                    profileId: target.id,
                    revision: owner.revision,
                }),
            ).rejects.toMatchObject({ status: 409 });
        });

        test('rejects switching to a foreign profile or a conflicting default directory name', async () => {
            const another = await seedNamecardCharacter(fixture, headers, {
                agencyId: otherProjectId,
                category: 'idol',
                nameCn: '已有默认名字',
            });
            const foreign = (await catalog.snapshot()).characters.find(
                (c) => c.id === another.id,
            )!.profiles[0];
            await expect(
                catalog.setDefaultProfile({
                    ownerId: characterId,
                    profileId: foreign.id,
                    revision: 0,
                }),
            ).rejects.toMatchObject({ status: 400 });
            await expect(
                fixture.connection
                    .prepare(
                        'UPDATE catalog_characters SET default_profile_id=? WHERE id=?',
                    )
                    .bind(foreign.id, characterId)
                    .run(),
            ).rejects.toMatchObject({ code: '23503' });
            await catalog.saveProfile({
                ...profile(otherProjectId),
                nameCn: '已有默认名字',
            });
            const before = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!;
            const target = before.profiles.find(
                (p) => p.projectId === otherProjectId,
            )!;
            await expect(
                catalog.setDefaultProfile({
                    ownerId: characterId,
                    profileId: target.id,
                    revision: before.revision,
                }),
            ).rejects.toMatchObject({
                code: '23505',
                constraint: 'catalog_characters_project_name_key',
            });
            expect(
                (await catalog.snapshot()).characters.find(
                    (c) => c.id === characterId,
                )?.defaultProfileId,
            ).toBe(before.defaultProfileId);
        });

        test('inherits presentation, keeps old name lookup, and detaches with a protected image reference', async () => {
            const target = await entry();
            const initial = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!.profiles[0];
            await catalog.saveProfile({
                ...profile(),
                revision: initial.revision,
            });
            await catalog.saveMedia(
                {
                    kind: 'character',
                    id: initial.id,
                    revision: 0,
                    imageTransform: {
                        fit: 'contain',
                        focalX: 0.3,
                        focalY: 0.6,
                        zoom: 1.2,
                        rotation: 90,
                    },
                },
                'catalog/test/shared.webp',
            );
            await catalog.saveBinding({
                kind: 'entry',
                id: target.id,
                revision: 0,
                source: 'character',
                profileId: initial.id,
            });
            expect(await story.findIdolById(target.id)).toMatchObject({
                name_cn: '企划人物',
                color: '#123456',
                avatar_object_key: 'catalog/test/shared.webp',
                avatar_fit: 'contain',
                avatar_rotation: 90,
            });
            expect(
                (await story.findIdolByAgencyAndName(projectId, '独立入口'))
                    ?.id,
            ).toBe(target.id);
            await expect(
                story.setIdolAvatarObjectKey(target.id, null),
            ).rejects.toMatchObject({ code: '23514' });
            await catalog.saveBinding({
                kind: 'entry',
                id: target.id,
                revision: 1,
                source: 'independent',
                profileId: null,
            });
            expect(await story.findIdolById(target.id)).toMatchObject({
                name_cn: '企划人物',
                avatar_object_key: 'catalog/test/shared.webp',
                avatar_rotation: 90,
            });
            await catalog.saveMedia(
                {
                    kind: 'character',
                    id: initial.id,
                    revision: 1,
                    imageTransform: initial.imageTransform,
                },
                'catalog/test/new.webp',
            );
            expect(
                await catalog.hasMediaReference('catalog/test/shared.webp'),
            ).toBe(true);
        });

        test('rejects duplicate bindings, foreign-project profiles, impossible dates and foreign defaults', async () => {
            const first = await entry('入口甲');
            const second = await entry('入口乙');
            await catalog.saveProfile(profile(otherProjectId));
            const owner = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!;
            const local = owner.profiles.find(
                (p) => p.projectId === projectId,
            )!;
            const foreign = owner.profiles.find(
                (p) => p.projectId === otherProjectId,
            )!;
            await expect(
                catalog.saveBinding({
                    kind: 'entry',
                    id: first.id,
                    revision: 0,
                    source: 'character',
                    profileId: foreign.id,
                }),
            ).rejects.toMatchObject({ status: 400 });
            await catalog.saveBinding({
                kind: 'entry',
                id: first.id,
                revision: 0,
                source: 'character',
                profileId: local.id,
            });
            await expect(
                catalog.saveBinding({
                    kind: 'entry',
                    id: second.id,
                    revision: 0,
                    source: 'character',
                    profileId: local.id,
                }),
            ).rejects.toMatchObject({ code: '23505' });
            await expect(
                fixture.connection
                    .prepare(
                        'UPDATE wiki_entries SET character_profile_id=? WHERE id=?',
                    )
                    .bind(foreign.id, second.id)
                    .run(),
            ).rejects.toMatchObject({ code: '23503' });
            await expect(
                fixture.connection
                    .prepare(
                        'UPDATE catalog_character_project_profiles SET birth_month=2,birth_day=30 WHERE id=?',
                    )
                    .bind(local.id)
                    .run(),
            ).rejects.toMatchObject({ code: '23514' });
            await expect(
                fixture.connection
                    .prepare(
                        'UPDATE catalog_characters SET default_profile_id=NULL WHERE id=?',
                    )
                    .bind(characterId)
                    .run(),
            ).rejects.toMatchObject({ code: '23514' });
        });

        test('preserves group profile identities and navigation order when editing members', async () => {
            const group = await seedNamecardUnit(fixture, headers, {
                nameCn: '目录组合',
                agencyIds: [projectId, otherProjectId],
                memberIds: [characterId],
            });
            const units = new SqlNamecardUnitRepository(fixture.connection);
            const before = (await catalog.snapshot()).groups.find(
                (g) => g.id === group.id,
            )!;
            const nav = await story.createWikiGroup({
                agencyId: projectId,
                code: 'test-nav',
                name: '自定义导航',
                color: '#123456',
            });
            const target = await entry();
            await story.updateWikiIdol({
                id: target.id,
                name: target.name_cn,
                color: target.color,
                textColor: target.text_color,
                imageFit: target.avatar_fit,
                wikiEnabled: true,
                groupIds: [nav.id],
            });
            const members = await story.listWikiGroupMembers(projectId);
            await catalog.saveBinding({
                kind: 'navigation',
                id: nav.id,
                revision: 0,
                source: 'group',
                profileId: before.profiles.find(
                    (p) => p.projectId === projectId,
                )!.id,
            });
            const result = await units.updateNamecardUnit({
                id: group.id,
                revision: group.revision,
                actorId: fixture.operator.id,
                nameCn: group.nameCn,
                nameJa: group.nameJa,
                nameEn: group.nameEn,
                aliases: group.aliases,
                displayOrder: group.displayOrder,
                agencyIds: [otherProjectId, projectId],
                memberIds: [characterId],
            });
            expect(result.status).toBe('updated');
            const after = (await catalog.snapshot()).groups.find(
                (g) => g.id === group.id,
            )!;
            expect(after.profiles.map((p) => p.id).sort()).toEqual(
                before.profiles.map((p) => p.id).sort(),
            );
            expect(await story.listWikiGroupMembers(projectId)).toEqual(
                members,
            );
            if (result.status !== 'updated')
                throw new Error('Expected updated group');
            const removal = await units.updateNamecardUnit({
                id: group.id,
                revision: result.unit.revision,
                actorId: fixture.operator.id,
                nameCn: group.nameCn,
                nameJa: group.nameJa,
                nameEn: group.nameEn,
                aliases: group.aliases,
                displayOrder: group.displayOrder,
                agencyIds: [otherProjectId],
                memberIds: [characterId],
            });
            expect(removal.status).toBe('profile-in-use');
            expect(
                (await catalog.snapshot()).groups
                    .find((g) => g.id === group.id)
                    ?.profiles.map((p) => p.id)
                    .sort(),
            ).toEqual(before.profiles.map((p) => p.id).sort());
        });

        test('adds ordered group project profiles and invalidates a stale legacy aggregate edit', async () => {
            const group = await seedNamecardUnit(fixture, headers, {
                nameCn: '跨企划组合',
                agencyIds: [projectId],
                memberIds: [characterId],
            });
            await catalog.saveProfile({
                ...profile(otherProjectId),
                kind: 'group',
                ownerId: group.id,
                birthMonth: null,
                birthDay: null,
                voiceStatus: 'unknown',
                cvName: null,
                aliases: null,
                category: null,
                displayOrder: null,
                isFallback: false,
            });
            const current = (await catalog.snapshot()).groups.find(
                (g) => g.id === group.id,
            )!;
            expect(current.profiles.map((p) => p.projectId)).toEqual([
                projectId,
                otherProjectId,
            ]);
            expect(current.revision).toBe(group.revision + 1);
            const result = await new SqlNamecardUnitRepository(
                fixture.connection,
            ).updateNamecardUnit({
                id: group.id,
                revision: group.revision,
                actorId: fixture.operator.id,
                nameCn: group.nameCn,
                nameJa: group.nameJa,
                nameEn: group.nameEn,
                aliases: group.aliases,
                displayOrder: group.displayOrder,
                agencyIds: [projectId],
                memberIds: [characterId],
            });
            expect(result).toMatchObject({
                status: 'conflict',
                revision: current.revision,
            });
            expect(
                (await catalog.snapshot()).groups.find((g) => g.id === group.id)
                    ?.profiles,
            ).toHaveLength(2);
        });

        test('guards profile writes with permissions, CSRF, revision and calendar validation', async () => {
            const p = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!.profiles[0];
            const body = { ...profile(), revision: p.revision };
            const route = adminApiPath('/catalog/profiles');
            expect(
                (
                    await testRequest(
                        fixture.app,
                        route,
                        namecardJsonInit('PUT', {}, body),
                    )
                ).status,
            ).toBe(401);
            const editor = await namecardActorHeaders(fixture, fixture.editor);
            expect(
                (
                    await testRequest(
                        fixture.app,
                        route,
                        namecardJsonInit('PUT', editor, body),
                    )
                ).status,
            ).toBe(403);
            const noCsrf = { Cookie: headers.Cookie };
            expect(
                (
                    await testRequest(
                        fixture.app,
                        route,
                        namecardJsonInit('PUT', noCsrf, body),
                    )
                ).status,
            ).toBe(403);
            expect(
                (
                    await testRequest(
                        fixture.app,
                        route,
                        namecardJsonInit('PUT', headers, {
                            ...body,
                            birthDay: 30,
                        }),
                    )
                ).status,
            ).toBe(400);
            expect(
                (
                    await testRequest(
                        fixture.app,
                        route,
                        namecardJsonInit('PUT', headers, body),
                    )
                ).status,
            ).toBe(200);
            expect(
                (
                    await testRequest(
                        fixture.app,
                        route,
                        namecardJsonInit('PUT', headers, body),
                    )
                ).status,
            ).toBe(409);
            expect(
                await queryOne(
                    fixture.connection,
                    'SELECT birth_month,birth_day FROM catalog_character_project_profiles WHERE id=?',
                    [p.id],
                ),
            ).toEqual({ birth_month: 2, birth_day: 29 });
            expect(
                await queryOne(
                    fixture.connection,
                    'SELECT cv_name,voice_status FROM catalog_character_project_profiles WHERE id=?',
                    [p.id],
                ),
            ).toEqual({ cv_name: '测试声优', voice_status: 'voiced' });
        });

        test('retains retired favorites already selected by a card but refuses new retired selections', async () => {
            await insertPlatformAccount(fixture.connection, 'catalog-owner');
            const repository = new SqlFudabaRepository(
                fixture.connection,
                new PostgresqlSchemaStrategy(),
            );
            const now = new Date().toISOString();
            await repository.createCard({
                id: 'catalog-card',
                ownerAccountId: 'catalog-owner',
                producerName: '测试制作人',
                seriesCodes: ['catalog-one'],
                favoriteCharacterIds: [characterId],
                pages: [cardPageWrite('front')],
                bio: '',
                tradeNote: '',
                exchangeMode: 'none',
                madeOn: null,
                groupName: null,
                producerReading: null,
                isOriginal: false,
                madeWithAi: false,
                visible: true,
                publicationStatus: 'published',
                revision: 0,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
            });
            const another = await seedNamecardCharacter(fixture, headers, {
                agencyId: projectId,
                category: 'idol',
                nameCn: '另一人物',
            });
            const characters = new SqlNamecardCharacterRepository(
                fixture.connection,
            );
            await characters.deleteNamecardCharacter(characterId, 0);
            await characters.deleteNamecardCharacter(another.id, 0);
            expect(
                await repository.attachCardFavorites('catalog-card', [
                    characterId,
                ]),
            ).toMatchObject([{ character_id: characterId }]);
            expect(
                await repository.attachCardFavorites('catalog-card', [
                    characterId,
                    another.id,
                ]),
            ).toBeNull();
            expect(
                await queryOne(
                    fixture.connection,
                    'SELECT character_id FROM fudaba_card_favorite_characters WHERE card_id=?',
                    ['catalog-card'],
                ),
            ).toEqual({ character_id: characterId });
        });

        test('legacy cleanup cannot delete a catalog image while it is referenced', async () => {
            const storage = createWikiFixture().storage;
            const profile = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!.profiles[0];
            const key = 'catalog/tests/referenced.webp';
            await storage.put(key, new Uint8Array([1, 2, 3]), {
                contentType: 'image/webp',
            });
            await catalog.saveMedia(
                {
                    kind: 'character',
                    id: profile.id,
                    revision: 0,
                    imageTransform: profile.imageTransform,
                },
                key,
            );
            const target = await entry();
            await story.setIdolAvatarObjectKey(target.id, key);
            await catalog.saveBinding({
                kind: 'entry',
                id: target.id,
                revision: 0,
                source: 'character',
                profileId: profile.id,
            });
            await deleteObjectWithCompensation({ storage, catalog }, key);
            expect(await storage.exists(key)).toBe(true);
            await catalog.saveMedia(
                {
                    kind: 'character',
                    id: profile.id,
                    revision: 1,
                    imageTransform: profile.imageTransform,
                },
                null,
            );
            await deleteObjectWithCompensation({ storage, catalog }, key);
            expect(await storage.exists(key)).toBe(false);
        });

        test('stores project-specific CV credits independently of voice status', async () => {
            const primary = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!.profiles[0];
            await catalog.saveProfile({
                ...profile(),
                revision: primary.revision,
                cvName: '声优甲',
                voiceStatus: 'unknown',
            });
            await catalog.saveProfile({
                ...profile(otherProjectId),
                cvName: '声优乙',
                voiceStatus: 'voiced',
            });
            const profiles = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!.profiles;
            expect(
                profiles.find((p) => p.projectId === projectId),
            ).toMatchObject({ cvName: '声优甲', voiceStatus: 'unknown' });
            expect(
                profiles.find((p) => p.projectId === otherProjectId),
            ).toMatchObject({ cvName: '声优乙', voiceStatus: 'voiced' });
            await catalog.saveProfile({
                ...profile(),
                revision: primary.revision + 1,
                cvName: null,
                voiceStatus: 'voiced',
            });
            expect(
                (await catalog.findProfile('character', primary.id))
                    ?.voiceStatus,
            ).toBe('voiced');
            expect(
                (await catalog.findProfile('character', primary.id))?.cvName,
            ).toBeNull();
        });

        test('uses complete independent project profiles as the only name authority', async () => {
            const target = await entry();
            const primary = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!.profiles[0];
            await catalog.saveBinding({
                kind: 'entry',
                id: target.id,
                revision: 0,
                source: 'character',
                profileId: primary.id,
            });
            await catalog.saveProfile({
                ...profile(otherProjectId),
                nameCn: '其他企划名字',
            });
            await fixture.connection
                .prepare('UPDATE namecard_characters SET name_cn=? WHERE id=?')
                .bind('人物新名称', characterId)
                .run();
            expect((await story.findIdolById(target.id))?.name_cn).toBe(
                '人物新名称',
            );
            await catalog.saveProfile({
                ...profile(),
                revision: primary.revision + 1,
                nameCn: '企划专用名',
            });
            expect((await story.findIdolById(target.id))?.name_cn).toBe(
                '企划专用名',
            );
            expect(
                (await catalog.snapshot()).characters
                    .find((c) => c.id === characterId)
                    ?.profiles.find((p) => p.projectId === otherProjectId)
                    ?.nameCn,
            ).toBe('其他企划名字');
            await expect(
                fixture.connection
                    .prepare(
                        'UPDATE catalog_characters SET name_cn=? WHERE id=?',
                    )
                    .bind('无业务列', characterId)
                    .run(),
            ).rejects.toMatchObject({ code: '42703' });
        });

        test('rejects inherited names that would make the unchanged public story lookup ambiguous', async () => {
            const target = await entry('角色入口');
            const otherEntry = await entry('被占用的名称');
            const primary = (await catalog.snapshot()).characters.find(
                (c) => c.id === characterId,
            )!.profiles[0];
            await catalog.saveBinding({
                kind: 'entry',
                id: target.id,
                revision: 0,
                source: 'character',
                profileId: primary.id,
            });
            await expect(
                catalog.saveProfile({
                    ...profile(),
                    revision: primary.revision,
                    nameCn: '被占用的名称',
                }),
            ).rejects.toMatchObject({
                code: '23505',
                constraint: 'wiki_entries_effective_name_key',
            });
            expect(
                (await catalog.findProfile('character', primary.id))?.nameCn,
            ).toBe('目录人物');
            const result = await new SqlNamecardCharacterRepository(
                fixture.connection,
            ).updateNamecardCharacter({
                id: characterId,
                revision: 0,
                actorId: fixture.operator.id,
                agencyId: projectId,
                category: 'idol',
                nameCn: '被占用的名称',
                nameJa: null,
                nameEn: null,
                aliases: null,
                displayOrder: 0,
                isFallback: false,
            });
            expect(result.status).toBe('duplicate');
            expect((await story.findIdolById(target.id))?.name_cn).toBe(
                '目录人物',
            );
            const group = await seedNamecardUnit(fixture, headers, {
                nameCn: '组合当前名',
                agencyIds: [projectId],
                memberIds: [characterId],
            });
            const groupProfile = (await catalog.snapshot()).groups.find(
                (g) => g.id === group.id,
            )!.profiles[0];
            await catalog.saveBinding({
                kind: 'entry',
                id: otherEntry.id,
                revision: 0,
                source: 'group',
                profileId: groupProfile.id,
            });
            await expect(
                catalog.saveProfile({
                    ...profile(),
                    revision: primary.revision,
                    nameCn: '被占用的名称',
                }),
            ).rejects.toMatchObject({
                code: '23505',
                constraint: 'wiki_entries_effective_name_key',
            });
            expect(
                (await story.findIdolByAgencyAndName(projectId, '被占用的名称'))
                    ?.id,
            ).toBe(otherEntry.id);
        });

        test('catalog image GET requires Backoffice access and returns contract JSON errors', async () => {
            const directory = await fs.mkdtemp(
                path.join(os.tmpdir(), 'ims-catalog-media-'),
            );
            const storage = new FilesystemObjectStorage({
                publicDir: path.join(directory, 'public'),
                uploadsDir: path.join(directory, 'uploads'),
                storyDataDir: path.join(directory, 'wiki'),
                chronicleDir: path.join(directory, 'chronicle'),
            });
            const mediaFixture = await createNamecardAdminFixture({ storage });
            try {
                const mediaHeaders = await namecardActorHeaders(
                    mediaFixture,
                    mediaFixture.operator,
                );
                const mediaProject = await insertNamecardAgency(
                    mediaFixture.connection,
                    {
                        code: 'catalog-media',
                        nameCn: '媒体企划',
                        displayOrder: 1,
                    },
                );
                const character = await seedNamecardCharacter(
                    mediaFixture,
                    mediaHeaders,
                    {
                        agencyId: mediaProject,
                        nameCn: '媒体人物',
                        category: 'idol',
                    },
                );
                const repository = new SqlCatalogRepository(
                    mediaFixture.connection,
                );
                const profile = (await repository.snapshot()).characters.find(
                    (c) => c.id === character.id,
                )!.profiles[0];
                const key = `catalog/character/${profile.id}/test.webp`;
                const bytes = new Uint8Array([1, 2, 3, 4]);
                await storage.put(key, bytes, { contentType: 'image/webp' });
                const compensation = new FilesystemCompensationService(
                    path.join(directory, 'journal'),
                    (value) => repository.hasMediaReference(value),
                );
                await compensation.enqueue('delete-object', { key });
                await repository.saveMedia(
                    {
                        kind: 'character',
                        id: profile.id,
                        revision: 0,
                        imageTransform: profile.imageTransform,
                    },
                    key,
                );
                await compensation.run(storage);
                expect(await storage.exists(key)).toBe(true);
                const s3Compensation = new S3CompensationService(
                    mediaFixture.connection,
                    new S3UploadStateMachine(mediaFixture.connection),
                    async () => {
                        throw new Error(
                            'A referenced image must not reach physical deletion',
                        );
                    },
                    (value) => repository.hasMediaReference(value),
                );
                const job = await s3Compensation.enqueue('delete-object', {
                    key,
                });
                await s3Compensation.run(storage);
                expect(await storage.exists(key)).toBe(true);
                expect(
                    await queryOne(
                        mediaFixture.connection,
                        'SELECT state FROM s3_compensation_jobs WHERE id=?',
                        [job],
                    ),
                ).toEqual({ state: 'completed' });
                const url = adminApiPath(
                    `/catalog/profile-images/character/${profile.id}`,
                );
                await assertContractJson(
                    await testRequest(mediaFixture.app, url),
                    401,
                    adminCatalogHttpErrorSchema,
                );
                const response = await testRequest(mediaFixture.app, url, {
                    headers: mediaHeaders,
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('content-type')).toBe('image/webp');
                expect(response.headers.get('cache-control')).toBe(
                    'private, no-store',
                );
                expect(new Uint8Array(await response.arrayBuffer())).toEqual(
                    bytes,
                );
                const snapshot = await assertContractJson(
                    await testRequest(
                        mediaFixture.app,
                        adminApiPath('/catalog'),
                        { headers: mediaHeaders },
                    ),
                    200,
                    adminCatalogSchema,
                );
                expect(
                    snapshot.characters.find((c) => c.id === character.id)
                        ?.profiles[0].imageUrl,
                ).toBe(`${url}?v=1`);
                await assertContractJson(
                    await testRequest(
                        mediaFixture.app,
                        adminApiPath(
                            '/catalog/profile-images/character/999999',
                        ),
                        { headers: mediaHeaders },
                    ),
                    404,
                    adminCatalogHttpErrorSchema,
                );
            } finally {
                await mediaFixture.close();
                await fs.rm(directory, { recursive: true, force: true });
            }
        });
    },
);
