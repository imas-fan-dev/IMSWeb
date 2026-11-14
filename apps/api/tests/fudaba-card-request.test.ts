import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

import {
    parseFudabaCardCreateFields,
    parseMediaRotations
} from '@/domains/community/fudaba/cards/request';

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

describe('media rotations', () => {
    test('accepts middle pages alongside the two sides', () => {
        const parsed = parseMediaRotations(
            JSON.stringify({ front: 1, back: 2, middles: [0, 3] })
        )
        assert.deepEqual(parsed, { front: 1, back: 2, middles: [0, 3] })
    })

    test('rejects an out-of-range turn count', () => {
        assert.throws(() => parseMediaRotations(JSON.stringify({ front: 4 })))
    })
})

describe('group cards', () => {
    test('stay visible even when the request asks otherwise', () => {
        // 「任何人都可以自由领取」要求团体名片始终可见。
        const parsed = parseFudabaCardCreateFields(
            fields({
                isGroupCard: 'true',
                groupName: '测试团体',
                producerName: '',
                visible: 'false',
            })
        )
        assert.equal(parsed.isGroupCard, true)
        assert.equal(parsed.visible, true)
        assert.equal(parsed.exchangeMode, 'auto')
    })
})

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

describe('fudaba group cards', () => {
    test('the group name replaces the producer name and pins the exchange mode', () => {
        const parsed = parseFudabaCardCreateFields(
            fields({
                isGroupCard: 'true',
                producerName: '',
                groupName: '  765PRO  ',
                exchangeMode: 'manual'
            })
        )
        // 制作人名称由团体名称派生；交换模式只能是自动。
        assert.equal(parsed.isGroupCard, true)
        assert.equal(parsed.producerName, '765PRO')
        assert.equal(parsed.groupName, '765PRO')
        assert.equal(parsed.exchangeMode, 'auto')
    })

    test('a group card may keep its own producer name (a mascot, say)', () => {
        const parsed = parseFudabaCardCreateFields(
            fields({
                isGroupCard: 'true',
                producerName: ' 团体吉祥物 ',
                groupName: '765PRO',
                exchangeMode: 'auto'
            })
        )
        assert.equal(parsed.producerName, '团体吉祥物')
        assert.equal(parsed.exchangeMode, 'auto')
    })

    test('a group card without a group name is refused', () => {
        assert.throws(
            () => parseFudabaCardCreateFields(
                fields({ isGroupCard: 'true', producerName: '', groupName: '' })
            ),
            /团体名片需要填写团体名称/
        )
    })

    test('a personal card still needs the producer name', () => {
        assert.throws(
            () => parseFudabaCardCreateFields(
                fields({ isGroupCard: 'false', producerName: '', groupName: '765PRO' })
            ),
            /producerName/
        )
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
