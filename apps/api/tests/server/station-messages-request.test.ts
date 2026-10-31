import {
    ADMIN_STATION_MESSAGE_DEFAULT_PAGE_SIZE,
    ADMIN_STATION_MESSAGE_MAX_PAGE_SIZE,
    AdminStationMessageRequestError,
    normalizeAdminStationMessageListQuery,
    normalizeAdminStationMessageRecipientQuery,
    normalizeAdminStationMessageSend
} from '@/domains/admin/station-messages/request';
import type { AdminStationMessageSendRequest } from '@imsweb/contracts/platform/admin-station-messages';
import {
    ADMIN_STATION_MESSAGE_MAX_LEAD_MS,
    ADMIN_STATION_MESSAGE_MIN_LEAD_MS
} from '@imsweb/contracts/platform/admin-station-messages/runtime';
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

const NOW = 1_790_000_000_000;
const MINUTE = 60_000;

function sendInput(
    overrides: Partial<AdminStationMessageSendRequest> = {}
): AdminStationMessageSendRequest {
    return {
        title: '维护通知',
        body: '正文',
        audience: 'all' as const,
        forwardEmail: false,
        scheduledAt: null,
        ...overrides
    };
}

describe('admin station message request normalization', () => {
    test('falls back to the first page and clamps the page size', () => {
        assert.deepEqual(normalizeAdminStationMessageListQuery({}), {
            page: 1,
            pageSize: ADMIN_STATION_MESSAGE_DEFAULT_PAGE_SIZE
        });
        assert.deepEqual(normalizeAdminStationMessageListQuery({ page: '3', pageSize: '12' }), {
            page: 3,
            pageSize: 12
        });
        assert.deepEqual(normalizeAdminStationMessageListQuery({ pageSize: '500' }), {
            page: 1,
            pageSize: ADMIN_STATION_MESSAGE_MAX_PAGE_SIZE
        });
        assert.deepEqual(normalizeAdminStationMessageListQuery({ page: '0', pageSize: '-2' }), {
            page: 1,
            pageSize: ADMIN_STATION_MESSAGE_DEFAULT_PAGE_SIZE
        });
    });

    test('trims the recipient search and drops an empty one', () => {
        assert.equal(
            normalizeAdminStationMessageRecipientQuery({ query: '  调试  ' }).query,
            '调试'
        );
        assert.equal(normalizeAdminStationMessageRecipientQuery({ query: '   ' }).query, null);
        assert.equal(normalizeAdminStationMessageRecipientQuery({}).query, null);
    });

    test('keeps the selected recipients of a selected batch', () => {
        assert.deepEqual(
            normalizeAdminStationMessageSend(
                sendInput({ audience: 'selected', accountIds: ['a', 'b'] }),
                NOW
            ),
            {
                title: '维护通知',
                body: '正文',
                audience: 'selected',
                accountIds: ['a', 'b'],
                forwardEmail: false,
                scheduledAt: null
            }
        );
    });

    test('drops the recipient list of an all-audience batch', () => {
        const normalized = normalizeAdminStationMessageSend(
            sendInput({ audience: 'all', accountIds: ['a'] }),
            NOW
        );
        assert.deepEqual(normalized.accountIds, []);
    });

    test('rejects a selected batch without recipients', () => {
        assert.throws(
            () => normalizeAdminStationMessageSend(sendInput({ audience: 'selected' }), NOW),
            (error: unknown) =>
                error instanceof AdminStationMessageRequestError &&
                error.code === 'STATION_MESSAGE_RECIPIENTS_REQUIRED'
        );
    });

    test('rejects a schedule inside the minimum lead time', () => {
        assert.throws(
            () =>
                normalizeAdminStationMessageSend(
                    sendInput({ scheduledAt: NOW + ADMIN_STATION_MESSAGE_MIN_LEAD_MS - 1 }),
                    NOW
                ),
            (error: unknown) =>
                error instanceof AdminStationMessageRequestError &&
                error.code === 'STATION_MESSAGE_SCHEDULE_TOO_SOON'
        );
    });

    test('rejects a schedule beyond the maximum lead time', () => {
        assert.throws(
            () =>
                normalizeAdminStationMessageSend(
                    sendInput({ scheduledAt: NOW + ADMIN_STATION_MESSAGE_MAX_LEAD_MS + MINUTE }),
                    NOW
                ),
            (error: unknown) =>
                error instanceof AdminStationMessageRequestError &&
                error.code === 'STATION_MESSAGE_SCHEDULE_TOO_FAR'
        );
    });

    test('rejects a schedule whose local minute drifted', () => {
        const scheduledAt = NOW + 10 * MINUTE;
        assert.throws(
            () =>
                normalizeAdminStationMessageSend(
                    sendInput({
                        scheduledAt,
                        scheduledLocalMinute: '2020-01-01T00:00'
                    }),
                    NOW
                ),
            (error: unknown) =>
                error instanceof AdminStationMessageRequestError &&
                error.code === 'STATION_MESSAGE_SCHEDULE_STALE'
        );
        const localMinute = new Date(scheduledAt);
        const pad = (value: number) => String(value).padStart(2, '0');
        const matching = `${localMinute.getFullYear()}-${pad(localMinute.getMonth() + 1)}-${pad(
            localMinute.getDate()
        )}T${pad(localMinute.getHours())}:${pad(localMinute.getMinutes())}`;
        assert.equal(
            normalizeAdminStationMessageSend(
                sendInput({ scheduledAt, scheduledLocalMinute: matching }),
                NOW
            ).scheduledAt,
            scheduledAt
        );
    });
});
