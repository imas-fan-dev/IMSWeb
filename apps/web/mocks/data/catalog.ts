import type { AdminCatalog, AdminCatalogProfile, CatalogBirthdays } from "@imsweb/contracts/catalog"
import { defaultWikiImageTransform } from "@imsweb/contracts/wiki"

export function createCatalogBirthdays(): CatalogBirthdays {
  return { success: true,items: [
    { characterId: 1,profileId: 11,projectId: 1,name: "相马夏美",agency: "灰姑娘女孩",color: "#e684a8",month: 7,day: 23,story: { agency: "cg", idol: "相马夏美" } },
    { characterId: 2,profileId: 12,projectId: 2,name: "舞滨步",agency: "百万现场",color: "#e684a8",month: 7,day: 23,story: null },
    { characterId: 3,profileId: 13,projectId: 1,name: "栋方爱海",agency: "灰姑娘女孩",color: "#e684a8",month: 8,day: 1,story: { agency: "cg", idol: "栋方爱海" } },
    { characterId: 4,profileId: 14,projectId: 3,name: "皮埃尔",agency: "SideM",color: "#e684a8",month: 8,day: 1,story: null },
    { characterId: 5,profileId: 15,projectId: 4,name: "仓本千奈",agency: "学园偶像大师",color: "#e684a8",month: 8,day: 1,story: null },
    { characterId: 6,profileId: 16,projectId: 4,name: "闰日偶像",agency: "学园偶像大师",color: "#e684a8",month: 2,day: 29,story: null },
  ] }
}

export function createAdminCatalog(overrides: Partial<AdminCatalog> = {}): AdminCatalog {
  const profile: AdminCatalogProfile = {
    id: 7, ownerId: 20, projectId: 1, nameCn: "天海春香", nameJa: null, nameEn: null,
    aliases: null, category: "idol", displayOrder: 0, isFallback: false,
    color: "#e22b30", birthMonth: null, birthDay: null, biography: null,
    voiceStatus: "unknown", cvName: null, profileUrl: null, imageUrl: null,
    imageTransform: defaultWikiImageTransform, mediaRevision: 0, revision: 3,
  }
  return {
    success: true,
    projects: [{ id: 1, code: "765", name: "本家" }, { id: 2, code: "ml", name: "百万现场" }],
    characters: [{ id: 20, name: "天海春香", isFallback: false, retired: false, defaultProfileId: 7, revision: 0, profiles: [profile] }],
    groups: [{ id: 30, name: "765PRO", kind: "organization", retired: false, revision: 4,
      profiles: [{ ...profile, id: 8, ownerId: 30, biography: "事务所资料", category: null, displayOrder: null, aliases: null, isFallback: false }] }],
    entries: [{ id: 10, projectId: 1, name: "天海春香", characterProfileId: 7, groupProfileId: null, revision: 5 }],
    navigationGroups: [],
    ...overrides,
  }
}
