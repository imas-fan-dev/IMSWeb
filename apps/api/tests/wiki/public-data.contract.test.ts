import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createWikiFixture } from "./fixture";

const COVER_TRANSFORM = {
  fit: "cover",
  focalX: 0.5,
  focalY: 0.5,
  zoom: 1,
  rotation: 0,
};
const CONTAIN_TRANSFORM = {
  fit: "contain",
  focalX: 0.5,
  focalY: 0.5,
  zoom: 1,
  rotation: 0,
};

describe("Wiki public dynamic data contract", () => {
  test("catalog exposes the requested agency and resolved idol artwork anonymously", async () => {
    const fixture = createWikiFixture();
    fixture.storage.publicReadUrlBase = "https://cdn.example.test";
    fixture.story.idols[5]!.avatar_object_key =
      "wiki/agencies/sc/idols/sc_idol/avatar.webp";
    fixture.story.agencies[5]!.icon_object_key =
      "wiki/agencies/sc/branding/icon.webp";
    fixture.storage.seed("wiki/agencies/sc/idols/sc_idol/avatar.webp");
    fixture.storage.seed("wiki/agencies/sc/branding/icon.webp");

    const response = await fixture.app.request(
      `/api/wiki/catalog?agency=${encodeURIComponent("闪耀色彩")}`,
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as any;
    assert.equal(body.status, "success");
    assert.equal(body.agencies.length, 7);
    assert.deepEqual(body.agencies[5], {
      id: 6,
      code: "sc",
      name: "闪耀色彩",
      color: "#8dbbff",
      bannerTitle: "闪耀色彩 Banner",
      iconUrl: "https://cdn.example.test/wiki/agencies/sc/branding/icon.webp",
      idolCount: 1,
      entryCount: 1,
      imageTransform: CONTAIN_TRANSFORM,
    });
    assert.deepEqual(body.selection, {
      agency: body.agencies[5],
      layoutRevision: 0,
      groups: [
        {
          id: 6,
          code: "sc-main",
          name: "闪耀色彩 Main",
          color: "#8dbbff",
          iconUrl: null,
          imageTransform: CONTAIN_TRANSFORM,
          idols: [
            {
              id: 6,
              name: "樱木真乃",
              folderName: "sc_idol",
              color: "#8dbbff",
              imageUrl:
                "https://cdn.example.test/wiki/agencies/sc/idols/sc_idol/avatar.webp",
              imageFit: "cover",
              imageTransform: COVER_TRANSFORM,
              textColor: "#ffffff",
              entryKind: "idol",
              entrySubtype: null,
            },
          ],
        },
      ],
      ungroupedIdols: [],
    });
    assert.deepEqual(fixture.storage.lists, []);
  });

  test("random idol samples only enabled Wiki idol entries with resolved artwork", async () => {
    const fixture = createWikiFixture();
    fixture.storage.publicReadUrlBase = "https://cdn.example.test";
    for (const idol of fixture.story.idols) {
      idol.entry_kind = "story";
      idol.entry_subtype = "event";
    }
    fixture.story.idols[0]!.entry_kind = "idol";
    fixture.story.idols[0]!.entry_subtype = null;
    fixture.story.idols[0]!.wiki_enabled = false;
    fixture.story.idols[1]!.entry_kind = "idol";
    fixture.story.idols[1]!.entry_subtype = null;
    fixture.story.agencies[1]!.wiki_enabled = false;

    const selected = fixture.story.idols[5]!;
    selected.entry_kind = "idol";
    selected.entry_subtype = null;
    selected.avatar_object_key = "wiki/agencies/sc/idols/sc_idol/avatar.webp";
    selected.avatar_focal_x = 0.35;
    selected.avatar_focal_y = 0.4;
    selected.avatar_zoom = 1.25;
    fixture.storage.seed(selected.avatar_object_key);

    const response = await fixture.app.request("/api/wiki/random_idol");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "success",
      eligibleCount: 1,
      idol: {
        id: 6,
        name: "樱木真乃",
        color: "#8dbbff",
        textColor: "#ffffff",
        imageUrl:
          "https://cdn.example.test/wiki/agencies/sc/idols/sc_idol/avatar.webp",
        imageTransform: {
          fit: "cover",
          focalX: 0.35,
          focalY: 0.4,
          zoom: 1.25,
          rotation: 0,
        },
        agency: {
          id: 6,
          code: "sc",
          name: "闪耀色彩",
          color: "#8dbbff",
        },
      },
    });

    selected.wiki_enabled = false;
    const empty = await fixture.app.request("/api/wiki/random_idol");
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), {
      status: "success",
      eligibleCount: 0,
      idol: null,
    });
  });

  test("catalog places idols without memberships in the final ungrouped collection", async () => {
    const fixture = createWikiFixture();
    fixture.story.members = fixture.story.members.filter(
      (member) => member.idol_id !== 6,
    );

    const response = await fixture.app.request(
      `/api/wiki/catalog?agency=${encodeURIComponent("闪耀色彩")}`,
    );

    assert.equal(response.status, 200);
    const selection = ((await response.json()) as any).selection;
    assert.deepEqual(selection.groups[0].idols, []);
    assert.equal(selection.ungroupedIdols.length, 1);
    assert.equal(selection.ungroupedIdols[0].id, 6);
    assert.equal(selection.ungroupedIdols[0].name, "樱木真乃");
  });

  test("catalog rejects unknown agencies without hiding the default selection", async () => {
    const fixture = createWikiFixture();
    const initial = await fixture.app.request("/api/wiki/catalog");
    assert.equal(initial.status, 200);
    const initialBody = (await initial.json()) as any;
    assert.equal(initialBody.selection.agency.name, "765PRO");

    const unknown = await fixture.app.request(
      `/api/wiki/catalog?agency=${encodeURIComponent("不存在")}`,
    );
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), {
      status: "error",
      msg: "企划不存在",
    });
  });

  test("story view aggregates cards and multiple sources with encoded media URLs", async () => {
    const fixture = createWikiFixture();
    fixture.storage.seed("wiki/agencies/sc/idols/sc_idol/avatar.webp");
    fixture.storage.publicReadUrlBase = "https://cdn.example.test";
    fixture.story.seedStory({
      idol_id: 6,
      category: "enzaP卡",
      card_name: "【动态剧情】",
      up_name: "来源一",
      video_title: "第一话",
      subtitle: "全话",
      image_file: "cards/story image.webp",
    });
    fixture.storage.seed(
      "wiki/agencies/sc/idols/sc_idol/story-images/cards/story image.webp",
    );
    fixture.story.seedStory({
      idol_id: 6,
      category: "enzaP卡",
      card_name: "【动态剧情】",
      up_name: "来源二",
      video_title: "另一视角",
      subtitle: "全话",
      image_file: "cards/story image.webp",
    });

    const response = await fixture.app.request(
      `/api/wiki/stories?agency=${encodeURIComponent("闪耀色彩")}` +
        `&idol=${encodeURIComponent("樱木真乃")}`,
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as any;
    assert.equal(body.agency.code, "sc");
    assert.equal(body.idol.name, "樱木真乃");
    assert.equal(body.idol.imageFit, "cover");
    const category = body.categories.find(
      (item: { name: string }) => item.name === "enzaP卡",
    );
    assert.ok(category);
    assert.equal(category.cards.length, 1);
    assert.equal(category.cards[0].id, fixture.story.cards[0]!.card_id);
    assert.equal(category.cards[0].links.length, 2);
    assert.equal(
      category.cards[0].img,
      "https://cdn.example.test/wiki/agencies/sc/idols/sc_idol/" +
        "story-images/cards/story%20image.webp",
    );
  });

  test("story reads validate the requested agency and idol", async () => {
    const fixture = createWikiFixture();
    assert.equal((await fixture.app.request("/api/wiki/stories")).status, 400);
    assert.equal(
      (
        await fixture.app.request(
          `/api/wiki/stories?agency=${encodeURIComponent("不存在")}&idol=x`,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await fixture.app.request(
          `/api/wiki/stories?agency=${encodeURIComponent("闪耀色彩")}` +
            `&idol=${encodeURIComponent("不存在")}`,
        )
      ).status,
      404,
    );
  });
});
