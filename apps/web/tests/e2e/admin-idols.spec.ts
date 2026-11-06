import AxeBuilder from "@axe-core/playwright"
import { z } from "@imsweb/contracts/z"
import {
  createWikiIdolRequestSchema,
  defaultWikiImageTransform,
  updateWikiIdolRequestSchema,
  wikiAdminCatalogSchema,
  wikiAdminStoriesSchema,
  wikiIdolMutationResultSchema,
  wikiStoryCoverAssetsSchema,
  wikiStorySourceCatalogSchema,
  wikiStoriesQuerySchema,
  wikiEntityImageResultSchema,
  wikiHttpErrorResponseSchema,
} from "@imsweb/contracts/wiki"

import {
  makeWikiAdminAgency,
  makeWikiAdminCatalog,
  makeWikiAdminGroup,
  makeWikiAdminIdol,
  makeWikiAdminStories,
} from "../../mocks/data/wiki"
import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { expect, test } from "./fixtures/test"

test("independent catalog editing preserves the story workspace @mobile", async ({
  page,
  api,
}, testInfo) => {
  installEmptyWikiCatalogMock(api)
  await installAdminAuthMock(page, api, {
    user: { dept: "editor", adminRole: null },
  })
  const idol = makeWikiAdminIdol()
  const unit = makeWikiAdminIdol({
    id: 11,
    name: "测试组合",
    folderName: "test_unit",
    entryKind: "unit",
    groupIds: [],
    wikiEnabled: false,
  })
  const agency = makeWikiAdminAgency({
    idols: [idol, unit],
    groups: [makeWikiAdminGroup({ idols: [idol] })],
  })
  const writes: unknown[] = []
  api.expect({
    name: "catalog reads across story, management, save and return",
    method: "GET",
    path: "/api/admin/wiki/catalog",
    responses: { 200: wikiAdminCatalogSchema },
    times: 4,
    handle: () => ({ json: makeWikiAdminCatalog({ agencies: [agency] }) }),
  })
  api.expect({
    name: "edit the selected content page",
    method: "PATCH",
    path: "/api/admin/wiki/idols/10",
    body: updateWikiIdolRequestSchema,
    responses: { 200: wikiIdolMutationResultSchema },
    handle: ({ body, record }) => {
      expect(record.headers["x-csrftoken"]).toBe("admin-e2e-csrf")
      writes.push(body)
      Object.assign(idol, body)
      return { json: { status: "success", idol } }
    },
  })
  api.expect({
    method: "GET",
    path: "/api/admin/wiki/stories",
    query: wikiStoriesQuerySchema,
    responses: { 200: wikiAdminStoriesSchema },
    times: 2,
    handle: () => ({
      json: makeWikiAdminStories({
        idol: { ...makeWikiAdminStories().idol, name: idol.name },
      }),
    }),
  })
  api.expect({
    method: "GET",
    path: "/api/admin/wiki/agencies/1/story-cover-assets",
    responses: { 200: wikiStoryCoverAssetsSchema },
    times: 2,
    handle: () => ({
      json: {
        status: "success",
        agency: { id: agency.id, code: agency.code, name: agency.name },
        assets: [],
      },
    }),
  })
  api.expect({
    method: "GET",
    path: "/api/admin/wiki/story-source-catalog",
    responses: { 200: wikiStorySourceCatalogSchema },
    times: 2,
    handle: () => ({
      json: { status: "success", contentTypes: [], sourcePlatforms: [] },
    }),
  })

  await page.goto("/admin/stories?agencyId=1&idolId=10&query=开场&expanded=1")
  await expect(page.getByRole("textbox", { name: "搜索剧情" })).toHaveValue(
    "开场"
  )
  for (const name of [
    "新增企划",
    "编辑企划",
    "新增栏目",
    "新增内容页",
    "编辑内容页",
  ]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0)
  }
  await page.getByRole("link", { name: "偶像管理", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "条目管理", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "清除定位" }).click()
  await page.getByRole("combobox", { name: "类型", exact: true }).click()
  await page.getByRole("option", { name: "组合", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "编辑内容页 测试组合" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "编辑内容页 天海春香" })
  ).toHaveCount(0)
  await page.getByRole("combobox", { name: "类型", exact: true }).click()
  await page.getByRole("option", { name: "全部类型" }).click()
  await expect(
    page.getByRole("combobox", { name: "类型", exact: true })
  ).toContainText("全部类型")
  await page.getByRole("textbox", { name: "搜索内容页" }).fill("amami_haruka")
  await expect(
    page.getByRole("button", { name: "编辑内容页 天海春香" })
  ).toHaveCount(1)
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
  ).toBe(false)
  await page.screenshot({
    path: testInfo.outputPath("catalog-list.png"),
    fullPage: true,
  })
  await page.getByRole("button", { name: "编辑内容页 天海春香" }).click()
  const dialog = page.getByRole("dialog", { name: "编辑内容页", exact: true })
  await expect(
    dialog.getByRole("textbox", { name: "名称", exact: true })
  ).toBeFocused()
  await page.screenshot({
    path: testInfo.outputPath("catalog-editor.png"),
    fullPage: false,
  })
  await dialog
    .getByRole("textbox", { name: "名称", exact: true })
    .fill("天海春香（更新）")
  await dialog.getByRole("button", { name: "保存", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "编辑内容页 天海春香（更新）" })
  ).toBeVisible()
  expect(writes).toEqual([
    expect.objectContaining({ name: "天海春香（更新）", entryKind: "idol" }),
  ])
  await page.getByRole("link", { name: "返回剧情内容" }).click()
  await expect(page.getByRole("textbox", { name: "搜索剧情" })).toHaveValue(
    "开场"
  )
  await expect(
    page.getByRole("heading", { name: "天海春香（更新）", exact: true })
  ).toBeVisible()
  const finalUrl = new URL(page.url())
  expect(finalUrl.searchParams.get("idolId")).toBe("10")
  expect(finalUrl.searchParams.get("expanded")).toBe("1")
  if (testInfo.project.name === "chromium-mobile") {
    await page.getByRole("button", { name: "选择内容页", exact: true }).click()
    const directory = page.getByRole("dialog", {
      name: "选择内容页",
      exact: true,
    })
    await directory
      .getByRole("button", { name: "天海春香（更新）", exact: true })
      .click()
    await expect(directory).toBeHidden()
  }
  await page.screenshot({
    path: testInfo.outputPath("story-readonly-catalog.png"),
    fullPage: true,
  })
})

test("create chooses agency-specific columns and retains drafts through two-stage save @mobile", async ({
  page,
  api,
}, testInfo) => {
  if (testInfo.project.name === "chromium-mobile")
    await page.setViewportSize({ width: 320, height: 568 })
  installEmptyWikiCatalogMock(api)
  await installAdminAuthMock(page, api, {
    user: { dept: "editor", adminRole: null },
  })
  const idol = makeWikiAdminIdol({
    id: 88,
    agencyId: 2,
    name: "新增资料",
    folderName: "new_entry",
    groupIds: [21, 22],
  })
  const first = makeWikiAdminAgency({
    groups: [makeWikiAdminGroup({ name: "第一栏目" })],
  })
  const second = makeWikiAdminAgency({
    id: 2,
    code: "sc",
    name: "闪耀色彩",
    color: "#8dbbff",
    groups: [
      makeWikiAdminGroup({ id: 21, name: "组合栏目" }),
      makeWikiAdminGroup({ id: 22, name: "资料栏目" }),
    ],
  })
  let saved = false
  api.expect({
    method: "GET",
    path: "/api/admin/wiki/catalog",
    responses: { 200: wikiAdminCatalogSchema },
    times: 2,
    handle: () => ({
      json: makeWikiAdminCatalog({
        agencies: [first, { ...second, idols: saved ? [idol] : [] }],
      }),
    }),
  })
  let releaseCreate!: () => void
  let releaseImage!: () => void
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve
  })
  const imageGate = new Promise<void>((resolve) => {
    releaseImage = resolve
  })
  let creates = 0
  let uploads = 0
  api.expect({
    method: "POST",
    path: "/api/admin/wiki/agencies/2/idols",
    body: createWikiIdolRequestSchema,
    responses: { 201: wikiIdolMutationResultSchema },
    handle: async ({ body, record }) => {
      creates++
      expect(record.headers["x-csrftoken"]).toBe("admin-e2e-csrf")
      expect(body).toMatchObject({
        name: "新增资料",
        folderName: "new_entry",
        groupIds: [21, 22],
        color: "#8dbbff",
      })
      await createGate
      saved = true
      return { status: 201, json: { status: "success", idol } }
    },
  })
  api.expect({
    method: "PUT",
    path: "/api/admin/wiki/idols/88/avatar",
    rawBody: {
      name: "new content-page avatar and composition",
      reason: "FormData carries the file and Web-local image controls",
      schema: z
        .string()
        .min(1)
        .refine(
          (body) =>
            body.includes('name="image"') &&
            /name="image_rotation"\r\n\r\n90/.test(body)
        ),
      contentType: z.string().regex(/^multipart\/form-data;\s*boundary=\S+$/i),
    },
    responses: { 200: wikiEntityImageResultSchema },
    handle: async () => {
      uploads++
      await imageGate
      return {
        json: {
          status: "success",
          url: "/uploads/e2e-avatar.png",
          mediaRevision: 1,
          imageTransform: { ...defaultWikiImageTransform, rotation: 90 },
        },
      }
    },
  })

  try {
    await page.goto("/admin/idols/entries?type=unit&query=hidden")
    await expect(
      page.getByRole("combobox", { name: "所属企划", exact: true })
    ).toContainText("全部企划")
    const location = page.url()
    await page.getByRole("button", { name: "新增内容页", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "新增内容页", exact: true })
    const chooser = dialog.getByRole("combobox", { name: "所属企划（必选）" })
    await expect(chooser).toBeFocused()
    await expect(
      dialog.getByRole("button", { name: "创建内容页", exact: true })
    ).toBeDisabled()
    await chooser.press("ArrowDown")
    await page.getByRole("option", { name: "765PRO", exact: true }).click()
    await dialog
      .getByRole("textbox", { name: "名称", exact: true })
      .fill("新增资料")
    await dialog
      .getByRole("textbox", { name: "素材目录", exact: true })
      .fill("new_entry")
    await dialog.getByRole("checkbox", { name: "第一栏目" }).check()
    await dialog.getByLabel("上传图片", { exact: true }).setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64"
      ),
    })
    await dialog.getByRole("button", { name: "向右旋转" }).click()
    const imageUrl = await dialog
      .getByRole("img", { name: "图片构图预览" })
      .getAttribute("src")
    await chooser.click()
    await page.getByRole("option", { name: "闪耀色彩", exact: true }).click()
    await expect(
      dialog.getByRole("checkbox", { name: "第一栏目" })
    ).toHaveCount(0)
    await expect(
      dialog.getByRole("textbox", { name: "名称", exact: true })
    ).toHaveValue("新增资料")
    await expect(
      dialog.getByRole("img", { name: "图片构图预览" })
    ).toHaveAttribute("src", imageUrl!)
    const group = dialog.getByRole("checkbox", { name: "组合栏目" })
    await group.focus()
    await group.press("Space")
    await expect(group).toBeChecked()
    await dialog.getByRole("checkbox", { name: "资料栏目" }).check()
    await dialog.getByRole("button", { name: "更多设置" }).click()
    const a11y = await new AxeBuilder({ page })
      .setLegacyMode()
      .include('[data-slot="dialog-content"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()
    expect(a11y.violations).toEqual([])
    const body = dialog.locator('[data-slot="dialog-body"]')
    await body.evaluate((element) => {
      element.scrollTop = 0
    })
    const footerBefore = await dialog
      .locator('[data-slot="dialog-footer"]')
      .boundingBox()
    await page.screenshot({
      path: testInfo.outputPath("create-agency-options.png"),
    })
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const footerAfter = await dialog
      .locator('[data-slot="dialog-footer"]')
      .boundingBox()
    expect(footerBefore).toEqual(footerAfter)
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth
      )
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath("create-settings.png") })
    await dialog
      .getByRole("button", { name: "创建内容页", exact: true })
      .click()
    await expect.poll(() => creates).toBe(1)
    await page.keyboard.press("Escape")
    await page.mouse.click(1, 1)
    await expect(dialog).toBeVisible()
    await expect(chooser).toBeDisabled()
    await expect(
      dialog.getByRole("button", { name: "取消", exact: true })
    ).toBeDisabled()
    await dialog.locator("form").dispatchEvent("submit")
    releaseCreate()
    await expect.poll(() => uploads).toBe(1)
    await page.keyboard.press("Escape")
    await expect(dialog).toBeVisible()
    releaseImage()
    await expect(dialog).toBeHidden()
    await expect(
      page.getByText("“新增资料”已创建", { exact: true })
    ).toBeVisible()
    expect(page.url()).toBe(location)
    await page.getByRole("button", { name: "查看条目", exact: true }).click()
    await expect(page).toHaveURL(/agencyId=2&idolId=88/)
    await expect(
      page.getByRole("button", { name: "编辑内容页 新增资料" })
    ).toBeVisible()
    expect(creates).toBe(1)
    expect(uploads).toBe(1)
  } finally {
    releaseCreate()
    releaseImage()
  }
})

test("create recovers catalog loading errors, prefills context and cancels without writes @mobile", async ({
  page,
  api,
}) => {
  installEmptyWikiCatalogMock(api)
  await installAdminAuthMock(page, api, {
    user: { dept: "editor", adminRole: null },
  })
  let reads = 0
  api.expect({
    method: "GET",
    path: "/api/admin/wiki/catalog",
    responses: {
      200: wikiAdminCatalogSchema,
      503: wikiHttpErrorResponseSchema,
    },
    times: 2,
    handle: () => {
      reads++
      return reads === 1
        ? { status: 503, json: { status: "error", msg: "目录暂不可用" } }
        : {
            json: makeWikiAdminCatalog({
              agencies: [makeWikiAdminAgency({ groups: [] })],
            }),
          }
    },
  })
  await page.goto("/admin/idols/entries?agencyId=1")
  await expect(page.getByText("目录加载失败", { exact: true })).toBeVisible()
  const opener = page.getByRole("button", { name: "新增内容页", exact: true })
  await opener.click()
  const dialog = page.getByRole("dialog", { name: "新增内容页", exact: true })
  await dialog
    .getByRole("button", { name: "重试加载目录", exact: true })
    .click()
  await expect(dialog.getByRole("combobox")).toContainText("765PRO")
  await expect(dialog.getByText(/当前企划没有栏目/)).toBeVisible()
  await dialog
    .getByRole("textbox", { name: "名称", exact: true })
    .fill("取消的草稿")
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
  await opener.click()
  await expect(
    dialog.getByRole("textbox", { name: "名称", exact: true })
  ).toHaveValue("")
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await expect(dialog).toBeHidden()
})
