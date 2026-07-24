import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createWikiFixture } from "./fixture";

describe("WIKI-01 static and story object paths", () => {
  test("icon/css routes work while encoded traversal and sensitive paths are rejected before assets/storage", async () => {
    const fixture = createWikiFixture();
    fixture.storage.seed(
      "Wiki/static/icon/cg/cute.webp",
      new TextEncoder().encode("object-icon"),
      "image/webp",
    );
    const icon = await fixture.app.request("/icon/cg/cute.webp");
    assert.equal(icon.status, 200);
    assert.equal(await icon.text(), "object-icon");
    const css = await fixture.app.request("/css/story.css");
    assert.equal(css.status, 200);
    assert.equal(await css.text(), "fixture-css");

    const callsBefore = fixture.staticRequests.length;
    const storageGetsBefore = [...fixture.storage.gets];
    for (const path of [
      "/icon/%252e%252e/app.py",
      "/css/%252e%252e/templates/story.html",
      "/image/闪耀色彩/樱木真乃/%252e%252e/secret.webp",
      "/image/闪耀色彩/樱木真乃/%255c..%255csecret.webp",
    ]) {
      const response = await fixture.app.request(path);
      assert.equal(response.status, 403, `${path} must be forbidden`);
    }
    assert.equal(fixture.staticRequests.length, callsBefore);
    assert.deepEqual(fixture.storage.gets, storageGetsBefore);
  });

  test("image GET/HEAD preserve body and metadata while unknown targets remain 404", async () => {
    const fixture = createWikiFixture();
    const key = "Data/sc/sc_idol/cards/fixture.webp";
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
    assert.equal(
      (await fixture.app.request("/image/不存在/樱木真乃/cards/fixture.webp"))
        .status,
      404,
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
    assert.deepEqual(await health.json(), { status: "ok" });
    fixture.story.samples.set("cg", {
      id: 501,
      idol_id: 3,
      category: "卡剧情",
      card_name: "【背景】",
      up_name: "up",
      video_title: "title",
      url: "#",
      subtitle: "",
      image_file: "card/bg.webp",
      idol_name: "岛村卯月",
      agency_name: "灰姑娘女孩",
    });
    const fallback = await fixture.app.request("/api/wiki/random_bg");
    assert.equal(fallback.status, 200);
    assert.deepEqual(await fallback.json(), {
      url: "/assets/images/Production/Cinderellaintro.png",
      card_name: "企划视觉素材",
      idol_name: "岛村卯月",
      agency_name: "灰姑娘女孩",
    });

    fixture.storage.seed("Data/cg/cg_idol/card/bg.webp");
    const background = await fixture.app.request("/api/wiki/random_bg");
    assert.equal(background.status, 200);
    assert.deepEqual(await background.json(), {
      url: "/image/灰姑娘女孩/岛村卯月/card/bg.webp",
      card_name: "【背景】",
      idol_name: "岛村卯月",
      agency_name: "灰姑娘女孩",
    });
  });
});
