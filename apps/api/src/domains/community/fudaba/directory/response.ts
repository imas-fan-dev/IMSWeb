import type { FudabaMapOffice } from '@imsweb/contracts/fudaba';
import { regionalLocation } from '@/domains/community/fudaba/contracts/location';
import type { ObjectStorage } from '@/ports/object-storage';
import type {
    FudabaPublicCardRecord,
    FudabaPublicMapOfficeRecord,
    FudabaPublicOfficeRecord,
    FudabaPublicPlacedCardRecord
} from '@/ports/repositories';
import { requirePublicObjectUrl } from '@/utils/storage/public-object-url';

export async function fudabaPublicOfficeView(
    storage: ObjectStorage | undefined,
    office: FudabaPublicOfficeRecord
): Promise<Record<string, unknown>> {
    let coverUrl: string | null = null;
    if (office.cover_object_key) {
        if (!storage) {
            throw Object.assign(new Error('公开对象读取地址未配置'), { status: 503 });
        }
        coverUrl = await requirePublicObjectUrl(storage, office.cover_object_key);
    }
    return {
        id: office.id,
        slug: office.slug,
        name: office.name,
        intro: office.intro,
        city: office.city,
        accent: office.accent,
        coverUrl,
        isOpen: office.is_open,
        visitorCount: office.visitor_count,
        seriesCodes: office.series_codes
    };
}

export async function fudabaPublicCardView(
    storage: ObjectStorage | undefined,
    card: FudabaPublicCardRecord
): Promise<Record<string, unknown>> {
    if (!storage) {
        throw Object.assign(new Error('公开对象读取地址未配置'), { status: 503 });
    }
    const [frontImageUrl, backImageUrl] = await Promise.all([
        requirePublicObjectUrl(storage, card.front_object_key),
        requirePublicObjectUrl(storage, card.back_object_key)
    ]);
    return {
        id: card.id,
        producerName: card.producer_name,
        displayName: card.display_name,
        seriesCode: card.series_code,
        favoriteIdol: card.favorite_idol,
        favoriteIdols: card.favorite_idols.map((idol) => ({
            id: idol.idol_id,
            name: idol.name_cn,
            seriesCode: idol.agency_code
        })),
        frontImageUrl,
        backImageUrl,
        accent: card.accent,
        bio: card.bio,
        tradeNote: card.trade_note,
        available: card.available,
        source: card.source_url ? {
            url: card.source_url,
            label: card.source_label,
            credit: card.source_credit
        } : null,
        createdAt: card.created_at,
        interactions: {
            likes: card.like_count,
            favorites: card.favorite_count,
            viewerLiked: card.viewer_liked,
            viewerFavorited: card.viewer_favorited
        }
    };
}

export async function fudabaPublicPlacedCardView(
    storage: ObjectStorage | undefined,
    card: FudabaPublicPlacedCardRecord
): Promise<Record<string, unknown>> {
    return {
        ...await fudabaPublicCardView(storage, card),
        viewerOwned: card.viewer_owned,
        placement: {
            pinnedAt: card.pinned_at,
            x: card.position_x,
            y: card.position_y,
            rotation: card.rotation,
            zIndex: card.z_index,
            revision: card.revision,
            updatedAt: card.updated_at
        }
    };
}

export function fudabaPublicMapOfficeView(
    office: FudabaPublicMapOfficeRecord
): FudabaMapOffice {
    return {
        id: office.id,
        slug: office.slug,
        name: office.name,
        city: office.city,
        accent: office.accent,
        isOpen: office.is_open,
        seriesCodes: office.series_codes,
        location: regionalLocation(office.latitude_e1, office.longitude_e1)
    };
}
