import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

import { parseFudabaCardCreateFields } from '@/domains/community/fudaba/cards/request';

function fields(overrides: Record<string, string> = {}): Record<string, string> {
    return {
        producerName: '测试制作人',
        seriesCodes: JSON.stringify(['765as']),
        favoriteCharacterIds: JSON.stringify([]),
        bio: '',
        tradeNote: '',
        exchangeMode: 'manual',
        madeOn: '',
        groupName: '',
        producerReading: '',
        isOriginal: 'false',
        madeWithAi: 'false',
        visible: 'true',
        credits: JSON.stringify([]),
        ...overrides
    }
}

describe('fudaba card request flags', () => {
    test('keeps the original declaration on its own', () => {
        const parsed = parseFudabaCardCreateFields(
            fields({ isOriginal: 'true' })
        )
        assert.equal(parsed.isOriginal, true)
        assert.equal(parsed.madeWithAi, false)
    })

    test('drops the original declaration when both were submitted', () => {
        // 前端只允许二选一；两个都勾上说明请求被绕过，服务端以 AI 声明为准。
        const parsed = parseFudabaCardCreateFields(
            fields({ isOriginal: 'true', madeWithAi: 'true' })
        )
        assert.equal(parsed.isOriginal, false)
        assert.equal(parsed.madeWithAi, true)
    })
})

describe('fudaba card request producer reading', () => {
    test('keeps the syllable marks used for sorting', () => {
        const parsed = parseFudabaCardCreateFields(
            fields({ producerReading: "かとう-せんぱい's" })
        )
        assert.equal(parsed.producerReading, "かとう-せんぱい's")
    })

    test('rejects characters outside the reading alphabet', () => {
        assert.throws(
            () => parseFudabaCardCreateFields(fields({ producerReading: 'かとう。' })),
            /制作人名读法/
        )
    })
})
