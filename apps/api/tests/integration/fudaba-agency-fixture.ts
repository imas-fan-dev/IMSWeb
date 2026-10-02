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
    for (const agency of projectCanonicalFudabaAgencies()) {
        await database.prepare(
            `INSERT INTO agencies
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
    for (const idol of FUDABA_TEST_IDOLS) {
        await database.prepare(
            `INSERT INTO idols
                (id, agency_id, name_cn, folder_name, color, wiki_enabled,
                 display_order, text_color)
             VALUES (?, ?, ?, ?, ?, ?, ?, '#ffffff')
             ON CONFLICT(id) DO UPDATE SET
                 agency_id=excluded.agency_id,
                 name_cn=excluded.name_cn,
                 folder_name=excluded.folder_name,
                 color=excluded.color,
                 wiki_enabled=excluded.wiki_enabled,
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
}
