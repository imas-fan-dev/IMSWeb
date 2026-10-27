import type { FudabaCard, FudabaMapOffice, FudabaOffice, FudabaPlacedCard } from "@imsweb/contracts/fudaba";
import type {
    NamecardCharacterCatalogAgency,
    NamecardCharacterCatalogEntry,
    NamecardCharacterCatalogUnit,
} from "@imsweb/contracts/fudaba/characters";
import { publicOfficeLocation } from '@/domains/community/fudaba/contracts/location';
import type { ObjectStorage } from "@/ports/object-storage";
import type {
    FudabaPublicCardRecord,
    FudabaPublicMapOfficeRecord,
    FudabaPublicOfficeRecord,
    FudabaPublicPlacedCardRecord,
    NamecardCharacterAgencyRecord,
    NamecardCharacterRecord,
    NamecardUnitRecord,
} from "@/ports/repositories";
import { requirePublicObjectUrl } from "@/utils/storage/public-object-url";

export async function fudabaPublicOfficeView(
    storage: ObjectStorage | undefined,
    office: FudabaPublicOfficeRecord,
    includeLocation = false,
): Promise<FudabaOffice> {
    let coverUrl: string | null = null;
    if (office.cover_object_key) {
        if (!storage) {
            throw Object.assign(new Error("公开对象读取地址未配置"), {
                status: 503,
            });
        }
        coverUrl = await requirePublicObjectUrl(
            storage,
            office.cover_object_key,
        );
    }
    return {
        id: office.id,
        slug: office.slug,
        name: office.name,
        intro: office.intro,
        city: office.city,
        address: office.address,
        accent: office.accent,
        coverUrl,
        isOpen: office.is_open,
        visitorCount: office.visitor_count,
        seriesCodes: office.series_codes,
        ...(includeLocation ? {
            location: office.public_latitude_exact != null && office.public_longitude_exact != null
                ? { precision: 'exact' as const, latitude: office.public_latitude_exact, longitude: office.public_longitude_exact }
                : null
        } : {}),
    };
}

export async function fudabaPublicCardView(
    storage: ObjectStorage | undefined,
    card: FudabaPublicCardRecord,
): Promise<FudabaCard> {
    if (!storage) {
        throw Object.assign(new Error("公开对象读取地址未配置"), {
            status: 503,
        });
    }
    const [frontImageUrl, backImageUrl] = await Promise.all([
        requirePublicObjectUrl(storage, card.front_object_key),
        requirePublicObjectUrl(storage, card.back_object_key),
    ]);
    return {
        id: card.id,
        producerName: card.producer_name,
        displayName: card.display_name,
        seriesCode: card.series_code,
        favoriteCharacter: card.favorite_character,
        favoriteCharacters: card.favorite_characters.map((character) => ({
            id: character.character_id,
            name: character.name_cn,
            seriesCode: character.agency_code,
        })),
        frontImageUrl,
        backImageUrl,
        accent: card.accent,
        bio: card.bio,
        tradeNote: card.trade_note,
        available: card.available,
        source: card.source_url
            ? {
                  url: card.source_url,
                  label: card.source_label,
                  credit: card.source_credit,
              }
            : null,
        createdAt: card.created_at,
        interactions: {
            likes: card.like_count,
            favorites: card.favorite_count,
            viewerLiked: card.viewer_liked,
            viewerFavorited: card.viewer_favorited,
        },
    };
}

export async function fudabaPublicPlacedCardView(
    storage: ObjectStorage | undefined,
    card: FudabaPublicPlacedCardRecord,
): Promise<FudabaPlacedCard> {
    return {
        ...(await fudabaPublicCardView(storage, card)),
        viewerOwned: card.viewer_owned,
        placement: {
            pinnedAt: card.pinned_at,
            x: card.position_x,
            y: card.position_y,
            rotation: card.rotation,
            zIndex: card.z_index,
            revision: card.revision,
            updatedAt: card.updated_at,
        },
    };
}

export function fudabaPublicMapOfficeView(
    office: FudabaPublicMapOfficeRecord,
): FudabaMapOffice {
    return {
        id: office.id,
        slug: office.slug,
        name: office.name,
        city: office.city,
        address: office.address,
        accent: office.accent,
        isOpen: office.is_open,
        seriesCodes: office.series_codes,
        location: publicOfficeLocation(office),
    };
}

export function namecardCharacterCatalogAgencyView(
    agency: NamecardCharacterAgencyRecord,
): NamecardCharacterCatalogAgency {
    return {
        id: agency.id,
        code: agency.code,
        name: agency.name_cn,
        color: agency.color,
    };
}

export function namecardCharacterCatalogEntryView(
    character: NamecardCharacterRecord,
): NamecardCharacterCatalogEntry {
    return {
        id: character.id,
        agencyId: character.agency_id,
        agencyCode: character.agency_code,
        agencyName: character.agency_name,
        agencyColor: character.agency_color,
        category: character.category,
        isFallback: character.is_fallback,
        nameCn: character.name_cn,
        nameJa: character.name_ja,
        nameEn: character.name_en,
        aliases: character.aliases,
    };
}

export function namecardCharacterCatalogUnitView(
    unit: NamecardUnitRecord,
): NamecardCharacterCatalogUnit {
    return {
        id: unit.id,
        nameCn: unit.name_cn,
        nameJa: unit.name_ja,
        nameEn: unit.name_en,
        aliases: unit.aliases,
        agencyIds: unit.agencies.map((agency) => agency.id),
        memberIds: unit.members.map((member) => member.character_id),
    };
}
