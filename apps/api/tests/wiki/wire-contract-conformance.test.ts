import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    wikiAdminCatalogSchema,
    wikiAdminStoriesSchema,
    wikiPublicCatalogSchema,
    wikiPublicStoriesSchema
} from "@imsweb/contracts/wiki";
import { createWikiFixture } from "./fixture";

// The same zod schemas the Web client uses to parse responses are applied to
// real route output here, so a payload the API emits but the client would
// reject can never pass the suite. The schemas live in @imsweb/contracts —
// the single wire-format source of truth for both workspaces.

function seedStoryContent(fixture: ReturnType<typeof createWikiFixture>) {
    fixture.story.seedStory({
        idol_id: 6,
        category: "enzaP卡",
        card_name: "【动态剧情】",
        up_name: "来源一",
        video_title: "第一话",
        subtitle: "全话",
        image_file: "cards/story-image.webp"
    });
    fixture.storage.seed(
        "wiki/agencies/sc/idols/sc_idol/story-images/cards/story-image.webp"
    );
}

describe("Wiki wire-contract conformance", () => {
    test("public catalog and stories responses satisfy the shared wire schemas", async () => {
        const fixture = createWikiFixture();
        seedStoryContent(fixture);

        const catalog = await fixture.app.request("/api/wiki/catalog");
        assert.equal(catalog.status, 200);
        const catalogBody = wikiPublicCatalogSchema.parse(await catalog.json());
        assert.ok(catalogBody.agencies.length > 0);
        assert.ok(catalogBody.selection);

        const stories = await fixture.app.request(
            `/api/wiki/stories?agency=${encodeURIComponent("闪耀色彩")}` +
                `&idol=${encodeURIComponent("樱木真乃")}`
        );
        assert.equal(stories.status, 200);
        const storiesBody = wikiPublicStoriesSchema.parse(await stories.json());
        assert.equal(storiesBody.idol.name, "樱木真乃");
        assert.ok(
            storiesBody.categories.some((category) => category.cards.length > 0)
        );
    });

    test("admin catalog and stories responses satisfy the shared wire schemas", async () => {
        const fixture = createWikiFixture();
        seedStoryContent(fixture);
        const auth = await fixture.auth("editor");
        const headers = { Cookie: `token=${auth.token}` };

        const catalog = await fixture.app.request("/api/admin/wiki/catalog", {
            headers
        });
        assert.equal(catalog.status, 200);
        const catalogBody = wikiAdminCatalogSchema.parse(await catalog.json());
        assert.ok(catalogBody.agencies.length > 0);

        const stories = await fixture.app.request(
            `/api/admin/wiki/stories?agency=${encodeURIComponent("闪耀色彩")}` +
                `&idol=${encodeURIComponent("樱木真乃")}`,
            { headers }
        );
        assert.equal(stories.status, 200);
        const storiesBody = wikiAdminStoriesSchema.parse(await stories.json());
        assert.equal(storiesBody.idol.name, "樱木真乃");
        assert.ok(storiesBody.stories.length > 0);
    });
});
