import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { projectCanonicalFudabaAgencies } from '../fixtures/fudaba-agency-catalog';

export const FUDABA_TEST_IDOLS = [
    {
        id: 900_001,
        agencyId: 1,
        agencyCode: '765',
        name: '测试春香',
        folderName: 'test-haruka',
        color: '#e22b30',
        order: 0
    },
    {
        id: 900_002,
        agencyId: 3,
        agencyCode: 'cg',
        name: '测试卯月',
        folderName: 'test-uzuki',
        color: '#f16ab1',
        order: 0
    }
] as const;

export async function seedCanonicalFudabaAgencies(
    database: ManagedSqlDatabase
): Promise<void> {
    // Historical migration tests intentionally stop before the catalog rename.
    const renamed = Boolean((await database.prepare(
        "SELECT to_regclass('public.projects') AS relation"
    ).first<{ relation: string | null }>())?.relation);
    const projects = renamed ? 'projects' : 'agencies';
    const entries = renamed ? 'wiki_entries' : 'idols';
    const projectColumn = renamed ? 'project_id' : 'agency_id';
    const nameColumn = renamed ? 'local_name_cn' : 'name_cn';
    const slugColumn = renamed ? 'storage_slug' : 'folder_name';
    const colorColumn = renamed ? 'local_accent_color' : 'color';
    const visibleColumn = renamed ? 'is_visible' : 'wiki_enabled';
    const splitSettings = Boolean((await database.prepare(
        "SELECT to_regclass('public.wiki_project_settings') AS relation"
    ).first<{ relation: string | null }>())?.relation);
    for (const agency of projectCanonicalFudabaAgencies()) {
        if (splitSettings) {
            await database.prepare(
                `INSERT INTO projects(id,code,name_cn,color,display_order,icon_object_key,
                    icon_fit,icon_focal_x,icon_focal_y,icon_zoom,icon_rotation,icon_media_revision)
                 VALUES (?,?,?,?,?,?,'contain',0.5,0.5,1,0,0)
                 ON CONFLICT(code) DO UPDATE SET name_cn=excluded.name_cn,color=excluded.color,
                    display_order=excluded.display_order,icon_object_key=excluded.icon_object_key`
            ).bind(agency.id,agency.code,agency.name,agency.color,agency.order,agency.iconObjectKey).run();
            await database.prepare(
                `UPDATE wiki_project_settings SET is_enabled=TRUE,banner_title=?
                 WHERE project_id=(SELECT id FROM projects WHERE code=?)`
            ).bind(`${agency.name} Banner`,agency.code).run();
            continue;
        }
        await database.prepare(
            `INSERT INTO ${projects}
                (id, code, name_cn, color, wiki_enabled, display_order,
                 banner_title, icon_object_key, icon_fit, icon_focal_x,
                 icon_focal_y, icon_zoom, icon_rotation, icon_media_revision,
                 fallback_artwork_object_key, layout_revision)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'contain', 0.5, 0.5, 1, 0, 0,
                     NULL, 0)
             ON CONFLICT(code) DO UPDATE SET
                 name_cn=excluded.name_cn,
                 color=excluded.color,
                 wiki_enabled=excluded.wiki_enabled,
                 display_order=excluded.display_order,
                 banner_title=excluded.banner_title,
                 icon_object_key=excluded.icon_object_key`
        ).bind(
            agency.id,
            agency.code,
            agency.name,
            agency.color,
            true,
            agency.order,
            `${agency.name} Banner`,
            agency.iconObjectKey
        ).run();
    }
    // The explicit ids above do not advance the identity sequence, so an
    // identity insert after this fixture would reuse id 1 and collide with
    // agency 765. Push the sequence past the ids this fixture owns.
    await database
        .prepare(
            `SELECT setval(pg_get_serial_sequence('${projects}', 'id'),
                           GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${projects}), 1))`
        )
        .first();
    for (const idol of FUDABA_TEST_IDOLS) {
        await database.prepare(
            `INSERT INTO ${entries}
                (id, ${projectColumn}, ${nameColumn}, ${slugColumn}, ${colorColumn}, ${visibleColumn},
                 display_order, text_color)
             VALUES (?, ?, ?, ?, ?, ?, ?, '#ffffff')
             ON CONFLICT(id) DO UPDATE SET
                 ${projectColumn}=excluded.${projectColumn},
                 ${nameColumn}=excluded.${nameColumn},
                 ${slugColumn}=excluded.${slugColumn},
                 ${colorColumn}=excluded.${colorColumn},
                 ${visibleColumn}=excluded.${visibleColumn},
                 display_order=excluded.display_order`
        ).bind(
            idol.id,
            idol.agencyId,
            idol.name,
            idol.folderName,
            idol.color,
            true,
            idol.order
        ).run();
    }
    // The catalog table only exists once the character-catalog migration has
    // applied. `namecard_characters` is the renamed catalog the namecard
    // selection paths now validate against, so it has to carry the same fixture
    // characters or every selection test reads an empty catalog.
    const characterCatalog = await database
        .prepare(`SELECT to_regclass('public.namecard_characters') AS relation`)
        .first<{ relation: string | null }>();
    if (!characterCatalog?.relation) return;
    const profileOwned = renamed && !Boolean((await database.prepare(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='catalog_characters' AND column_name='name_cn'"
    ).first()) );
    if (profileOwned) {
        for (const idol of FUDABA_TEST_IDOLS) {
            const existing = await database.prepare('SELECT id FROM namecard_characters WHERE id=?').bind(idol.id).first();
            if (existing) {
                await database.prepare('UPDATE namecard_characters SET agency_id=?,name_cn=?,display_order=? WHERE id=?')
                    .bind(idol.agencyId,idol.name,idol.order,idol.id).run();
            } else {
                await database.prepare("INSERT INTO namecard_characters(id,agency_id,category,is_fallback,name_cn,display_order) VALUES (?,?,'idol',FALSE,?,?)")
                    .bind(idol.id,idol.agencyId,idol.name,idol.order).run();
            }
        }
        return;
    }
    const characters = renamed ? 'catalog_characters' : 'namecard_characters';
    const defaultProject = renamed ? 'default_project_id' : 'agency_id';
    for (const idol of FUDABA_TEST_IDOLS) {
        await database
            .prepare(
                `INSERT INTO ${characters}
                    (id, ${defaultProject}, category, is_fallback, name_cn, name_ja,
                     name_en, aliases, display_order, revision, created_at,
                     updated_at)
                 VALUES (?, ?, 'idol', FALSE, ?, NULL, NULL, NULL, ?, 0,
                         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET
                     ${defaultProject}=excluded.${defaultProject},
                     name_cn=excluded.name_cn,
                     display_order=excluded.display_order`
            )
            .bind(idol.id, idol.agencyId, idol.name, idol.order)
            .run();
    }
}
