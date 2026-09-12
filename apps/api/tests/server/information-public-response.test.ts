import assert from 'node:assert/strict';
import test from 'node:test';
import { publicInformationCard } from '@/domains/content/information/public-response';
import type { ObjectStorage } from '@/ports/object-storage';

const storage: ObjectStorage = {
    async createPublicReadUrl(key) {
        return `https://cdn.example.test/${key}`;
    },
    async get() { return null; },
    async put() { throw new Error('not implemented'); },
    async delete() {},
    async exists() { return false; },
    async copy() {},
    async move() {},
    async list() { return []; },
    async deletePrefix() {}
};

test('public information details rewrite cover and managed HTML images to direct URLs', async () => {
    const card = await publicInformationCard(storage, {
        id: 'information-card',
        category: 'activity',
        contentType: 'html',
        image: '/uploads/information/original/cover.png',
        link: '/information/information-card',
        title: 'Information card',
        html: '<p>正文</p><img alt="海报" src="/uploads/information/original/body image.png">',
        updatedAt: '2026-07-27T00:00:00.000Z'
    });

    assert.equal(
        card.image,
        'https://cdn.example.test/editorial/information/assets/cover/cover.png'
    );
    assert.match(
        card.html ?? '',
        /https:\/\/cdn\.example\.test\/editorial\/information\/assets\/body image\/cover\.png/
    );
    assert.doesNotMatch(card.html ?? '', /\/uploads\/information/);
});
