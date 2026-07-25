import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createWikiFixture } from "./fixture";

describe("Wiki public dynamic data contract", () => {
  test("catalog exposes the requested agency and resolved idol artwork anonymously", async () => {
    const fixture = createWikiFixture();
    fixture.story.idols[5]!.avatar_object_key =
      "wiki/agencies/sc/idols/sc_idol/avatar.webp";
    fixture.story.agencies[5]!.icon_object_key =
      "wiki/agencies/sc/branding/icon.webp";

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
      iconUrl: "/icon/agencies/6.webp",
      idolCount: 1,
    });
    assert.deepEqual(body.selection, {
      agency: body.agencies[5],
      layoutRevision: 0,
      groups: [{
        id: 6,
        code: "sc-main",
        name: "闪耀色彩 Main",
        color: "#8dbbff",
        iconUrl: null,
        idols: [{
          id: 6,
          name: "樱木真乃",
          folderName: "sc_idol",
          color: "#8dbbff",
          imageUrl:
            `/image/${encodeURIComponent("闪耀色彩")}/` +
            `${encodeURIComponent("樱木真乃")}/icon.webp`,
          imageFit: "cover",
          textColor: "#ffffff",
        }],
      }],
    });
    assert.deepEqual(fixture.storage.lists, []);
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
    fixture.story.seedStory({
      idol_id: 6,
      category: "enzaP卡",
      card_name: "【动态剧情】",
      up_name: "来源一",
      video_title: "第一话",
      subtitle: "全话",
      image_file: "cards/story image.webp",
    });
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
    assert.equal(category.cards[0].links.length, 2);
    assert.equal(
      category.cards[0].img,
      `/image/${encodeURIComponent("闪耀色彩")}/` +
        `${encodeURIComponent("樱木真乃")}/cards/story%20image.webp`,
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
