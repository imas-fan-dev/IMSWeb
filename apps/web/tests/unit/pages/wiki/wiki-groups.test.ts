import { describe, expect, it } from "vitest"

import { groupWikiIdols } from "~/pages/wiki/wiki-groups"
import type { WikiPublicIdol } from "~/shared/api"

function idol(
  id: number,
  folderName: string,
  name = folderName
): WikiPublicIdol {
  return {
    id,
    name,
    folderName,
    color: null,
    imageUrl: `/image/${folderName}.webp`,
    imageFit: "cover",
    textColor: "#ffffff",
  }
}

describe("groupWikiIdols", () => {
  it.each([
    ["765PRO", "amami_haruka", "765PRO"],
    ["876PRO", "tomori_manaka", "vα-liv"],
    ["灰姑娘女孩", "shibuya_rin", "Cool"],
    ["百万现场", "kasuga_mirai", "PRINCESS STARS"],
    ["SideM", "dramatic_stars", "组合"],
    ["闪耀色彩", "sakuragi_mano", "illumination STARS"],
    ["学园偶像大师", "hanami_saki", "初星学园"],
  ])("assigns %s/%s to %s", (agency, folderName, expectedGroup) => {
    const groups = groupWikiIdols(agency, [idol(1, folderName)])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe(expectedGroup)
    expect(groups[0]?.idols[0]?.folderName).toBe(folderName)
  })

  it("keeps unknown records visible in the fallback group", () => {
    const groups = groupWikiIdols("闪耀色彩", [
      idol(1, "sakuragi_mano", "樱木真乃"),
      idol(2, "new_archive", "新档案"),
    ])

    expect(groups.map((group) => group.name)).toEqual([
      "illumination STARS",
      "事务所人员与其他",
    ])
    expect(groups[1]?.idols[0]?.name).toBe("新档案")
  })
})
