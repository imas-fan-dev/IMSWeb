import type { EventKind } from '@/ports/repositories';
import {
    enumValue,
    publicUrl,
    relatedLinks,
    sourceUrl,
    text
} from '@/domains/content/editorial/contracts/article-input';

export const EVENT_KINDS = ['event', 'notice'] as const;
const EVENT_STATUSES = ['scheduled', 'ongoing', 'ended', 'cancelled'] as const;

export function postKind(value: unknown, fallback?: unknown): EventKind {
    return enumValue(value ?? fallback, EVENT_KINDS, '帖子类型');
}

export interface PostDetailFields {
    kind: EventKind;
    sourceUrl: string | null;
    name: string | null;
    contact: string | null;
    startAt: string | null;
    endAt: string | null;
    timezone: string;
    venueName: string | null;
    address: string | null;
    registrationUrl: string | null;
    eventStatus: string | null;
    relatedLinks: Array<{ label: string; url: string }>;
}

/**
 * 通知类帖子不带线下活动信息，只有 kind 为 event 时才解析场地与时间。
 */
export function postDetailFields(
    payload: Record<string, unknown>,
    current: Record<string, unknown>,
    kind: EventKind
): PostDetailFields {
    const isConcreteEvent = kind === 'event';
    return {
        kind,
        sourceUrl: sourceUrl(payload.sourceUrl ?? current.source_url),
        name: isConcreteEvent ? text(payload.name ?? current.name, '主办方', 160) : null,
        contact: isConcreteEvent ? text(payload.contact ?? current.contact, '联系方式', 500) : null,
        startAt: isConcreteEvent ? text(payload.startAt ?? current.start_at, '开始时间', 64) : null,
        endAt: isConcreteEvent ? text(payload.endAt ?? current.end_at, '结束时间', 64) : null,
        timezone: text(payload.timezone ?? current.timezone, '时区', 80) || 'Asia/Shanghai',
        venueName: isConcreteEvent
            ? text(payload.venueName ?? current.venue_name, '地点名称', 240)
            : null,
        address: isConcreteEvent ? text(payload.address ?? current.address, '地址', 500) : null,
        registrationUrl: isConcreteEvent
            ? publicUrl(payload.registrationUrl ?? current.registration_url, '报名链接')
            : null,
        eventStatus: !isConcreteEvent || payload.eventStatus === null
            ? null
            : enumValue(
                payload.eventStatus ?? current.event_status ?? 'scheduled',
                EVENT_STATUSES,
                '活动状态'
            ),
        relatedLinks: relatedLinks(payload.relatedLinks, current)
    };
}
