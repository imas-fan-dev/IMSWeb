import { describe, expect, it } from "vitest"

import type { AdminCatalog } from "~/lib/api"
import { catalogWorkspaceList } from "~/pages/admin/idols/catalog-workspace-model"

function character(
  id: number,
  name: string,
  category: string,
  displayOrder: number
) {
  return {
    id,
    name,
    isFallback: false,
    retired: false,
    defaultProfileId: id * 10,
    revision: 0,
    profiles: [
      {
        id: id * 10,
        ownerId: id,
        projectId: 1,
        nameCn: name,
        nameJa: null,
        nameEn: null,
        aliases: null,
        category,
        displayOrder,
        isFallback: false,
        color: null,
        birthMonth: null,
        birthDay: null,
        biography: null,
        voiceStatus: "unknown",
        cvName: null,
        profileUrl: null,
        mediaRevision: 0,
        revision: 0,
        imageTransform: {
          fit: "cover",
          focalX: 0.5,
          focalY: 0.5,
          zoom: 1,
          rotation: 0,
        },
        imageUrl: null,
      },
    ],
  }
}

const catalog = {
  success: true,
  projects: [{ id: 1, code: "765", name: "765PRO" }],
  characters: [
    character(1, "对手A", "rival", 0),
    character(2, "偶像B", "idol", 5),
    character(3, "偶像C", "idol", 1),
    character(4, "工作人员D", "staff", 2),
  ],
  groups: [],
  entries: [],
  navigationGroups: [],
} as unknown as AdminCatalog

describe("catalogWorkspaceList character ordering", () => {
  it("orders by category rank before display order", () => {
    const { candidates } = catalogWorkspaceList(catalog, {
      kind: "character",
      projectId: 1,
      query: "",
      category: "all",
      includeMissing: false,
      ownerId: null,
      page: null,
    })

    expect(candidates.map((item) => item.name)).toEqual([
      "偶像C",
      "偶像B",
      "工作人员D",
      "对手A",
    ])
  })
})
