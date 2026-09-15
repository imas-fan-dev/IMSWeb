import assert from "node:assert/strict";
import { describe, test } from "node:test";
// pi-lens-ignore: ts:2305
import { wikiTestResponseSchema } from "@imsweb/contracts/wiki";
import { createWikiFixture } from "./fixture";

async function assertPlainText(
  response: Response,
  status: number,
  body: string,
): Promise<void> {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type") ?? "", /^text\/plain/i);
  assert.equal(await response.text(), body);
}

describe("WIKI-01 database-associated media and story object paths", () => {
  test("entity icon routes use database keys while retired static routes and traversal are rejected", async () => {
    const fixture = createWikiFixture();
    fixture.story.agencies[2]!.icon_object_key =
      "wiki/shared/static/icon/cg/cute.webp";
    fixture.storage.seed(
      "wiki/shared/static/icon/cg/cute.webp",
      new TextEncoder().encode("object-icon"),
      "image/webp",
    );
    const icon = await fixture.app.request("/icon/agencies/3.webp");
    assert.equal(icon.status, 200);
    assert.equal(await icon.text(), "object-icon");
    const css = await fixture.app.request("/css/story.css");
    await assertPlainText(css, 404, "Not Found");
    await assertPlainText(
      await fixture.app.request("/icon/cg/cute.webp"),
      404,
      "Not Found",
    );

    const callsBefore = fixture.staticRequests.length;
    const storageGetsBefore = [...fixture.storage.gets];
    await assertPlainText(
      await fixture.app.request("/icon/agencies/%252e%252e.webp"),
      404,
      "Not found",
    );
    await assertPlainText(
      await fixture.app.request("/api/wiki/story-cover-assets/999.webp"),
      404,
      "Not found",
    );
    for (const path of [
      "/css/%252e%252e/templates/story.html",
      "/image/闪耀色彩/樱木真乃/%252e%252e/secret.webp",
      "/image/闪耀色彩/樱木真乃/%255c..%255csecret.webp",
    ]) {
      const response = await fixture.app.request(path);
      await assertPlainText(response, 403, "Forbidden");
    }
    assert.equal(fixture.staticRequests.length, callsBefore);
    assert.deepEqual(fixture.storage.gets, storageGetsBefore);
  });

  test("image GET/HEAD preserve body and metadata while unknown targets remain 404", async () => {
    const fixture = createWikiFixture();
    const key = "wiki/agencies/sc/idols/sc_idol/story-images/cards/fixture.webp";
    fixture.storage.seed(key, new Uint8Array([9, 8, 7]), "image/webp");
    const path = "/image/闪耀色彩/樱木真乃/cards/fixture.webp";
    const get = await fixture.app.request(path);
    assert.equal(get.status, 200);
    assert.equal(get.headers.get("content-type"), "image/webp");
    assert.equal(get.headers.get("content-length"), "3");
    assert.equal(get.headers.get("etag"), '"fixture-3"');
    assert.deepEqual(
      new Uint8Array(await get.arrayBuffer()),
      new Uint8Array([9, 8, 7]),
    );
    const head = await fixture.app.request(path, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-length"), "3");
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    await assertPlainText(
      await fixture.app.request("/image/不存在/樱木真乃/cards/fixture.webp"),
      404,
      "Not found",
    );
    assert.equal(
      (await fixture.app.request("/image/闪耀色彩/不存在/cards/fixture.webp"))
        .status,
      404,
    );
    assert.equal(
      (await fixture.app.request("/image/闪耀色彩/樱木真乃/cards/missing.webp"))
        .status,
      404,
    );
  });

  test("health and random background reads remain public and compatible", async () => {
    const fixture = createWikiFixture();
    const health = await fixture.app.request("/api/wiki/test");
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.deepEqual(wikiTestResponseSchema.parse(healthBody), healthBody);
    const empty = await fixture.app.request("/api/wiki/random_bg");
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { url: "" });

    fixture.story.samples.set("cg", {
      id: 501,
      card_id: 401,
      idol_id: 3,
      category: "卡剧情",
      card_name: "【背景】",
      up_name: "up",
      video_title: "title",
      url: "#",
      content_type_id: 1,
      content_type_name: "剧情",
      content_type_icon_name: "book-open-text",
      source_platform_id: 2,
      source_platform_name: "其他来源",
      subtitle: "",
      image_file: "card/bg.webp",
      image_fit: "cover",
      image_focal_x: 0.5,
      image_focal_y: 0.5,
      image_zoom: 1,
      image_rotation: 0,
      image_media_revision: 0,
      idol_name: "岛村卯月",
      agency_name: "灰姑娘女孩",
    });
    fixture.storage.seed("wiki/agencies/cg/idols/cg_idol/story-images/card/bg.webp");
    const background = await fixture.app.request("/api/wiki/random_bg");
    assert.equal(background.status, 200);
    assert.deepEqual(await background.json(), {
      url: "/image/%E7%81%B0%E5%A7%91%E5%A8%98%E5%A5%B3%E5%AD%A9/%E5%B2%9B%E6%9D%91%E5%8D%AF%E6%9C%88/card/bg.webp",
      card_id: 401,
      card_name: "【背景】",
      idol_name: "岛村卯月",
      agency_name: "灰姑娘女孩",
    });
  });
});
