import assert from 'node:assert/strict';
import { test } from 'vitest';
import { namecardSortKey } from '@/utils/sorting/namecard-sort-key';

test.describe('namecard sort key', () => {
    test('uses an English name as-is', () => {
        assert.deepEqual(namecardSortKey('Amami Haruka', null), {
            key: 'amamiharuka',
            bucket: 0
        });
        // NFKC folds full-width Latin, then whitespace is removed and case lowered.
        assert.deepEqual(namecardSortKey('  Ａｍａｍｉ　Ｈａｒｕｋａ  ', null), {
            key: 'amamiharuka',
            bucket: 0
        });
    });

    test('prefers an English reading over a Japanese name', () => {
        assert.deepEqual(namecardSortKey('天海春香', 'Amami Haruka'), {
            key: 'amamiharuka',
            bucket: 0
        });
    });

    test('romanizes a kana reading', () => {
        assert.deepEqual(namecardSortKey('天海春香', 'アマミ ハルカ'), {
            key: 'amamiharuka',
            bucket: 1
        });
        assert.deepEqual(namecardSortKey('天海春香', 'あまみ はるか'), {
            key: 'amamiharuka',
            bucket: 1
        });
        // jaconv drops the long-vowel mark: シャイニー → SHAINI.
        assert.deepEqual(namecardSortKey('シャイニー', null), {
            key: 'shaini',
            bucket: 1
        });
    });

    test('romanizes a name that starts with kana when no reading exists', () => {
        assert.deepEqual(namecardSortKey('あまみ はるか', null), {
            key: 'amamiharuka',
            bucket: 1
        });
        assert.deepEqual(namecardSortKey('アマミハルカ', null), {
            key: 'amamiharuka',
            bucket: 1
        });
    });

    test('romanizes kana that follows a latin prefix', () => {
        // 英文开头 + 假名尾巴也参与罗马化，不能落进特殊符号桶。
        assert.deepEqual(namecardSortKey('Zheiアマミ', null), {
            key: 'zheiamami',
            bucket: 1
        });
    });

    test('falls back to pinyin for a Chinese name', () => {
        assert.deepEqual(namecardSortKey('天海春香', null), {
            key: 'tianhaichunxiang',
            bucket: 2
        });
    });

    test('falls back to pinyin for traditional Chinese names', () => {
        assert.deepEqual(namecardSortKey('陳奕迅', null), {
            key: 'chenyixun',
            bucket: 2
        });
        assert.deepEqual(namecardSortKey('張學友', null), {
            key: 'zhangxueyou',
            bucket: 2
        });
    });

    test('chains kana romanization into pinyin for mixed scripts', () => {
        assert.deepEqual(namecardSortKey('春香アマミ', null), {
            key: 'chunxiangamami',
            bucket: 1
        });
        assert.deepEqual(namecardSortKey('あまみハルカ', null), {
            key: 'amamiharuka',
            bucket: 1
        });
    });

    test('sinks symbols and other unmapped text to the last bucket', () => {
        assert.deepEqual(namecardSortKey('☆★', null), {
            key: '☆★',
            bucket: 3
        });
        assert.deepEqual(namecardSortKey('765', null), {
            key: '765',
            bucket: 3
        });
    });

    test('returns an empty last-bucket key for a blank name', () => {
        assert.deepEqual(namecardSortKey(null, 'アマミ'), {
            key: '',
            bucket: 3
        });
        assert.deepEqual(namecardSortKey('   ', 'アマミ'), {
            key: '',
            bucket: 3
        });
        // An empty reading is treated as missing, not as a Latin source.
        assert.deepEqual(namecardSortKey('天海春香', ''), {
            key: 'tianhaichunxiang',
            bucket: 2
        });
    });
});
