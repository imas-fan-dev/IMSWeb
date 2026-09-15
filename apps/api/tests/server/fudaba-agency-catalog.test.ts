import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CANONICAL_FUDABA_AGENCIES,
    projectCanonicalFudabaAgencies
} from '../fixtures/fudaba-agency-catalog';

test('canonical Fudaba agency data keeps IDs, ordering, names, colors, and icons', () => {
    assert.deepEqual(CANONICAL_FUDABA_AGENCIES, [
        { id: 1, code: '765', name: '765PRO', color: '#f34f6d', order: 0,
            iconObjectKey: 'wiki/shared/static/icon/765pro.webp' },
        { id: 2, code: '876', name: '876PRO', color: '#656a75', order: 1,
            iconObjectKey: 'wiki/shared/static/icon/876pro.webp' },
        { id: 3, code: 'cg', name: '灰姑娘女孩', color: '#2681c8', order: 2,
            iconObjectKey: 'wiki/shared/static/icon/cg.webp' },
        { id: 4, code: 'ml', name: '百万现场', color: '#ffc30b', order: 3,
            iconObjectKey: 'wiki/shared/static/icon/ml.webp' },
        { id: 5, code: 'sidem', name: 'SideM', color: '#0fbe94', order: 4,
            iconObjectKey: 'wiki/shared/static/icon/sidem.webp' },
        { id: 6, code: 'sc', name: '闪耀色彩', color: '#8dbbff', order: 5,
            iconObjectKey: 'wiki/shared/static/icon/sc.webp' },
        { id: 7, code: 'gk', name: '学园偶像大师', color: '#f39800', order: 6,
            iconObjectKey: 'wiki/shared/static/icon/gk.webp' }
    ]);
});

test('canonical Fudaba agency data is frozen and projections are fresh', () => {
    assert.equal(Object.isFrozen(CANONICAL_FUDABA_AGENCIES), true);
    assert.equal(CANONICAL_FUDABA_AGENCIES.every(Object.isFrozen), true);

    const first = projectCanonicalFudabaAgencies();
    const second = projectCanonicalFudabaAgencies();
    assert.notEqual(first, second);
    assert.notEqual(first[0], second[0]);
    first[0]!.name = 'mutated projection';
    assert.equal(second[0]!.name, '765PRO');
    assert.equal(CANONICAL_FUDABA_AGENCIES[0]!.name, '765PRO');
});
