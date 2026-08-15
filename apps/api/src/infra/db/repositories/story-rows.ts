import type { AgencyRecord, IdolRecord, WikiCategoryRecord, WikiGroupRecord } from '@/ports/repositories';

export const AGENCY_COLUMNS = `id, code, name_cn, color, wiki_enabled, display_order,
    banner_title, icon_object_key, icon_fit, icon_focal_x, icon_focal_y,
    icon_zoom, icon_rotation, icon_media_revision, fallback_artwork_object_key,
    layout_revision`;
export const IDOL_COLUMNS = `id, agency_id, name_cn, folder_name, color, wiki_enabled,
    display_order, text_color, wiki_url, avatar_object_key, avatar_fit, avatar_focal_x,
    avatar_focal_y, avatar_zoom, avatar_rotation, avatar_media_revision,
    entry_kind, entry_subtype`;
export const GROUP_COLUMNS = `id, agency_id, code, name, color, icon_object_key,
    icon_fit, icon_focal_x, icon_focal_y, icon_zoom, icon_rotation,
    icon_media_revision, display_order, is_fallback`;
export const STORY_MEDIA_COLUMNS = `cards.id AS card_id, cards.image_fit,
    cards.image_focal_x, cards.image_focal_y, cards.image_zoom,
    cards.image_rotation, cards.image_media_revision, cards.cover_asset_id,
    (SELECT name FROM wiki_story_cover_assets
     WHERE id=cards.cover_asset_id) AS cover_asset_name,
    (SELECT object_key FROM wiki_story_cover_assets
     WHERE id=cards.cover_asset_id) AS cover_asset_object_key,
    (SELECT revision FROM wiki_story_cover_assets
     WHERE id=cards.cover_asset_id) AS cover_asset_revision,
    (SELECT presentation_policy FROM wiki_story_cover_assets
     WHERE id=cards.cover_asset_id) AS cover_asset_presentation_policy`;
export const STORY_COLUMNS = `COALESCE(links.legacy_id, links.id) AS id,
    cards.idol_id, categories.name AS category, cards.card_name,
    COALESCE(links.up_name, '') AS up_name,
    COALESCE(links.video_title, '') AS video_title,
    COALESCE(links.url, '') AS url, links.content_type_id,
    COALESCE((SELECT name FROM wiki_story_content_types
              WHERE id=links.content_type_id), '') AS content_type_name,
    COALESCE((SELECT icon_name FROM wiki_story_content_types
              WHERE id=links.content_type_id), 'link-2') AS content_type_icon_name,
    links.source_platform_id,
    COALESCE((SELECT name FROM wiki_story_source_platforms
              WHERE id=links.source_platform_id), '') AS source_platform_name,
    cards.subtitle, cards.image_file,
    ${STORY_MEDIA_COLUMNS}`;
export const STORY_CARD_COLUMNS = `cards.idol_id,
    categories.name AS category, cards.card_name, cards.subtitle, cards.image_file,
    ${STORY_MEDIA_COLUMNS}`;
export const STORY_CLEANUP_COLUMNS = `COALESCE(links.legacy_id, links.id) AS id,
    cards.idol_id, categories.name AS category, cards.card_name,
    COALESCE(links.up_name, '') AS up_name,
    COALESCE(links.video_title, '') AS video_title,
    COALESCE(links.url, '') AS url, links.content_type_id,
    COALESCE((SELECT name FROM wiki_story_content_types
              WHERE id=links.content_type_id), '') AS content_type_name,
    COALESCE((SELECT icon_name FROM wiki_story_content_types
              WHERE id=links.content_type_id), 'link-2') AS content_type_icon_name,
    links.source_platform_id,
    COALESCE((SELECT name FROM wiki_story_source_platforms
              WHERE id=links.source_platform_id), '') AS source_platform_name,
    cards.subtitle,
    COALESCE(links.legacy_image_file, cards.image_file) AS image_file,
    ${STORY_MEDIA_COLUMNS}`;

export function booleanValue(value: boolean | number): boolean {
    return value === true || value === 1;
}

export function agencyRecord(row: AgencyRecord): AgencyRecord {
    return { ...row, wiki_enabled: booleanValue(row.wiki_enabled) };
}

export function idolRecord<Row extends IdolRecord>(row: Row): Row {
    return { ...row, wiki_enabled: booleanValue(row.wiki_enabled) };
}

export function groupRecord(row: WikiGroupRecord): WikiGroupRecord {
    return { ...row, is_fallback: booleanValue(row.is_fallback) };
}

export function categoryRecord(row: WikiCategoryRecord): WikiCategoryRecord {
    return {
        ...row,
        background_eligible: booleanValue(row.background_eligible),
        show_when_empty: booleanValue(row.show_when_empty)
    };
}
