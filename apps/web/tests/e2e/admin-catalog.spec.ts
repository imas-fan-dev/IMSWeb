import AxeBuilder from "@axe-core/playwright"
import {
  adminCatalogMutationSchema,
  adminCatalogProfileRequestSchema,
  adminCatalogSchema,
  adminCatalogCreateCharacterRequestSchema,
  adminCatalogCreateCharacterResponseSchema,
  adminCatalogStoryTargetRequestSchema,
  adminCatalogStoryTargetResponseSchema,
} from "@imsweb/contracts/catalog"
import {
  wikiAdminCatalogSchema,
  wikiAdminStoriesSchema,
  wikiStoryCoverAssetsSchema,
  wikiStorySourceCatalogSchema,
  wikiStoriesQuerySchema,
} from "@imsweb/contracts/wiki"
import {
  makeWikiAdminAgency,
  makeWikiAdminCatalog,
  makeWikiAdminIdol,
  makeWikiAdminStories,
} from "../../mocks/data/wiki"
import { createAdminCatalog } from "../../mocks/data/catalog"
import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { expect, test } from "./fixtures/test"

test("story workspace selects the character profile and reuses a related content entry @mobile", async ({
  page,
  api,
}, testInfo) => {
  installEmptyWikiCatalogMock(api)
  await installAdminAuthMock(page, api, {
    user: { dept: "editor", adminRole: null },
  })
  const shared = createAdminCatalog()
  const agency = makeWikiAdminAgency({
    idols: [
      makeWikiAdminIdol({
        name: "旧剧情专题",
        entryKind: "story",
        entrySubtype: "special",
        groupIds: [],
      }),
    ],
    groups: [],
  })
  let linked = false
  api.expect({
    method: "GET",
    path: "/api/admin/catalog",
    responses: { 200: adminCatalogSchema },
    handle: () => ({ json: shared }),
  })
  api.expect({
    method: "GET",
    path: "/api/admin/wiki/catalog",
    responses: { 200: wikiAdminCatalogSchema },
    times: 2,
    handle: () => ({ json: makeWikiAdminCatalog({ agencies: [agency] }) }),
  })
  api.expect({
    method: "POST",
    path: "/api/admin/catalog/story-target",
    body: adminCatalogStoryTargetRequestSchema,
    responses: { 200: adminCatalogStoryTargetResponseSchema },
    handle: ({ body, record }) => {
      expect(body).toEqual({ profileId: 7 })
      expect(record.headers["x-csrftoken"]).toBe("admin-e2e-csrf")
      linked = true
      agency.idols.push(
        makeWikiAdminIdol({ id: 55, name: "天海春香", groupIds: [] })
      )
      return {
        json: {
          success: true,
          entryId: 55,
          characterId: 20,
          profileId: 7,
          projectId: 1,
          projectCode: agency.code,
        },
      }
    },
  })
  api.expect({
    method: "GET",
    path: "/api/admin/wiki/stories",
    query: wikiStoriesQuerySchema,
    responses: { 200: wikiAdminStoriesSchema },
    times: { min: 2, max: 4 },
    handle: () => ({
      json: makeWikiAdminStories({
        idol: {
          ...makeWikiAdminStories().idol,
          id: linked ? 55 : 10,
          name: linked ? "天海春香" : "旧剧情专题",
        },
      }),
    }),
  })
  api.expect({
    method: "GET",
    path: "/api/admin/wiki/agencies/1/story-cover-assets",
    responses: { 200: wikiStoryCoverAssetsSchema },
    times: { min: 1, max: 3 },
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
    handle: () => ({
      json: { status: "success", contentTypes: [], sourcePlatforms: [] },
    }),
  })
  await page.goto("/admin/stories?agencyId=1&idolId=10")
  await page.getByRole("button", { name: "从角色档案选择" }).click()
  const dialog = page.getByRole("dialog", { name: "选择角色档案" })
  await expect(
    dialog.getByRole("button", { name: "天海春香 · 本家" })
  ).toBeVisible()
  const axe = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze()
  expect(
    axe.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    )
  ).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath("story-character-selector.png"),
    fullPage: true,
  })
  await dialog.getByRole("button", { name: "天海春香 · 本家" }).click()
  await expect(dialog).toHaveCount(0)
  await expect
    .poll(() => new URL(page.url()).searchParams.get("idolId"))
    .toBe("55")
  await expect(
    page.getByRole("heading", { name: "天海春香", exact: true })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
  ).toBe(false)
})

test("both former character lists open the same full profile workspace @mobile", async ({
  page,
  api,
}) => {
  installEmptyWikiCatalogMock(api)
  await installAdminAuthMock(page, api, { sessionTimes: 2 })
  api.expect({
    method: "GET",
    path: "/api/admin/catalog",
    responses: { 200: adminCatalogSchema },
    times: 2,
    handle: () => ({ json: createAdminCatalog() }),
  })
  for (const path of ["/admin/idols/characters", "/admin/cards/characters"]) {
    await page.goto(
      `${path}?agencyId=1&page=3&query=春香&category=idol#profile`
    )
    await expect(page.getByLabel("CV（声优）")).toBeVisible()
    const url = new URL(page.url())
    expect(url.pathname).toBe("/admin/idols")
    expect(url.searchParams.get("projectId")).toBe("1")
    expect(url.searchParams.get("page")).toBe("3")
    expect(url.searchParams.get("query")).toBe("春香")
    expect(url.hash).toBe("#profile")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(
      page.getByRole("link", { name: "角色列表", exact: true })
    ).toHaveCount(0)
    const workspaceLink = page.getByRole("link", {
      name: "角色",
      exact: true,
    })
    if (!(await workspaceLink.isVisible()))
      await page.getByRole("button", { name: /偶像数据库/ }).click()
    await expect(workspaceLink).toHaveAttribute("aria-current", "page")
    await expect(
      page.getByRole("link", { name: "组合身份管理", exact: true })
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "组合与分组", exact: true })
    ).toHaveCount(0)
    const project = await page
      .getByRole("link", { name: "企划", exact: true })
      .boundingBox()
    const group = await page
      .getByRole("link", { name: "组合", exact: true })
      .boundingBox()
    const character = await workspaceLink.boundingBox()
    expect(project!.y).toBeLessThan(group!.y)
    expect(group!.y).toBeLessThan(character!.y)
  }
})

test("character list edits the full project profile inline @mobile", async ({
  page,
  api,
}, testInfo) => {
  installEmptyWikiCatalogMock(api)
  await installAdminAuthMock(page, api)
  const data = createAdminCatalog()
  api.expect({
    method: "GET",
    path: "/api/admin/catalog",
    responses: { 200: adminCatalogSchema },
    times: 2,
    handle: () => ({ json: data }),
  })
  let saved = false
  api.expect({
    method: "PUT",
    path: "/api/admin/catalog/profiles",
    body: adminCatalogProfileRequestSchema,
    responses: { 200: adminCatalogMutationSchema },
    handle: ({ body, record }) => {
      expect(record.headers["x-csrftoken"]).toBe("admin-e2e-csrf")
      expect(body).toMatchObject({
        kind: "character",
        ownerId: 20,
        projectId: 1,
        revision: 3,
        cvName: "中村繪里子",
        aliases: "春香别名",
        category: "staff",
        displayOrder: 8,
      })
      const { kind, ...fields } = body
      expect(kind).toBe("character")
      Object.assign(data.characters[0].profiles[0], fields, { revision: 4 })
      saved = true
      return { json: { success: true } }
    },
  })
  await page.goto("/admin/idols?projectId=1&ownerId=20")
  await expect(
    page.getByRole("heading", { name: "角色档案", exact: true })
  ).toBeVisible()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByLabel("CV（声优）").fill("中村繪里子")
  await page.getByLabel("别名（逗号或换行分隔）").fill("春香别名")
  await page.getByLabel("排序值", { exact: true }).fill("8")
  await page.getByRole("combobox", { name: "角色分类", exact: true }).click()
  await page.getByRole("option", { name: "工作人员", exact: true }).click()
  await page.getByLabel("生日月份").fill("4")
  await page.getByLabel("生日日期").fill("3")
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
    )
  ).toBe(false)
  await page.screenshot({
    path: testInfo.outputPath("unified-character-workspace.png"),
    fullPage: true,
  })
  const accessibility = await new AxeBuilder({ page }).include("main").analyze()
  expect(
    accessibility.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    )
  ).toEqual([])
  await page.getByRole("button", { name: "保存档案", exact: true }).click()
  await expect.poll(() => saved).toBe(true)
  await expect(
    page.getByRole("button", { name: "保存档案", exact: true })
  ).toBeEnabled()
  await expect(page.getByLabel("CV（声优）")).toHaveValue("中村繪里子")
})

test("full first profile creates one new character identity @mobile", async ({
  page,
  api,
}) => {
  installEmptyWikiCatalogMock(api)
  await installAdminAuthMock(page, api)
  const data = createAdminCatalog()
  api.expect({
    method: "GET",
    path: "/api/admin/catalog",
    responses: { 200: adminCatalogSchema },
    times: 2,
    handle: () => ({ json: data }),
  })
  api.expect({
    method: "POST",
    path: "/api/admin/catalog/characters",
    body: adminCatalogCreateCharacterRequestSchema,
    responses: { 200: adminCatalogCreateCharacterResponseSchema },
    handle: ({ body, record }) => {
      expect(record.headers["x-csrftoken"]).toBe("admin-e2e-csrf")
      expect(body).toMatchObject({
        nameCn: "新人物",
        aliases: "新别名",
        category: "idol",
        displayOrder: 0,
        cvName: "新声优",
      })
      data.characters.push({
        id: 40,
        name: body.nameCn,
        isFallback: body.isFallback,
        retired: false,
        defaultProfileId: 42,
        revision: 0,
        profiles: [
          {
            ...data.characters[0].profiles[0],
            ...body,
            id: 42,
            ownerId: 40,
            revision: 0,
          },
        ],
      })
      return { json: { success: true, characterId: 40, profileId: 42 } }
    },
  })
  await page.goto("/admin/idols?projectId=1")
  await page.getByLabel("CV（声优）").waitFor()
  await page.getByRole("button", { name: "新建人物档案", exact: true }).click()
  await page.getByLabel("企划内中文名").fill("新人物")
  await page.getByLabel("别名（逗号或换行分隔）").fill("新别名")
  await page.getByLabel("CV（声优）").fill("新声优")
  await page.getByRole("button", { name: "创建人物档案", exact: true }).click()
  await expect(page).toHaveURL(/ownerId=40/)
  await expect(page.getByLabel("CV（声优）")).toHaveValue("新声优")
  await expect(
    page.getByRole("button", { name: "保存档案", exact: true })
  ).toBeEnabled()
  expect(data.characters).toHaveLength(2)
})
