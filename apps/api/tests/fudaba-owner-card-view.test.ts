import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { fudabaOwnerCardListSchema } from '@imsweb/contracts/fudaba';

import { fudabaOwnerCardView } from '@/domains/community/fudaba/contracts/card';
import type { FudabaCardRecord } from '@/ports/repositories';

function legacyRecord(overrides: Partial<FudabaCardRecord> = {}): FudabaCardRecord {
    return {
        id: 'card-1',
        card_number: 1,
        producer_name: 'テスト',
        series_codes: ['765as'],
        favorite_characters: [],
        pages: [],
        pending_pages: [],
        middle_object_keys: [],
        credits: [],
        legacy_card_id: null,
        // 旧行在数据库里允许是 NULL：`accent` 无默认值，`bio` / `trade_note` 早期只写空。
        accent: null,
        bio: null,
        trade_note: null,
        exchange_mode: 'none',
        made_on: null,
        group_name: null,
        producer_reading: null,
        is_original: false,
        made_with_ai: false,
        visible: true,
        is_group_card: false,
        publication_status: 'published',
        revision: 1,
        review_status: null,
        review_reason: null,
        review_submitted_at: null,
        pending_payload: null,
        owner_account_id: 'account-1',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        deleted_at: null,
        ...overrides,
    } as FudabaCardRecord;
}

describe('fudabaOwnerCardView', () => {
    test('旧行的 NULL 文本字段回填，所有者侧契约仍成立', () => {
        const view = fudabaOwnerCardView(legacyRecord());
        assert.equal(view.bio, '');
        assert.equal(view.tradeNote, '');
        assert.match(view.accent, /^#[0-9a-f]{6}$/i);
        const parsed = fudabaOwnerCardListSchema.safeParse({ items: [view] });
        assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
    });
});
