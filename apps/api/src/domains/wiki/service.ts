import type { StaticAssets, UploadedFile } from "@/ports/http";
import type { ImageProcessor } from "@/ports/media";
import type { ObjectStorage } from "@/ports/object-storage";
import type { RuntimeServices } from "@/ports/runtime-services";
import type { AgencyRecord, IdolRecord, IdolWithAgencyRecord, StoryRecord, StoryRepository } from "@/ports/repositories";
import {
  legacyArtworkForAgency,
  legacyAvatarMedia,
  legacyCharacterAvatarMedia,
  type WikiAvatarMedia,
} from "@/domains/wiki/legacy-media";
import {
  SUPPORTED_AGENCY_CODES,
  type SupportedAgencyCode,
  type WikiAgency,
  type WikiIdol,
  type WikiRandomBackground,
  type WikiStoryCategory,
} from "@/domains/wiki/models";

export const DEFAULT_STORY_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const supportedCodes = new Set<string>(SUPPORTED_AGENCY_CODES);
const avatarExtensions = [".webp", ".png", ".jpg", ".jpeg", ".gif"] as const;
const lightColorIdols = new Set([
  "萩原雪歩", "萩原雪步", "葛城リーリヤ", "葛城莉莉娅", "幽谷霧子", "幽谷雾子",
  "桑山千雪", "奥空心白", "诗花", "Altessimo", "中谷育", "W", "蕾特拉", "神速一魂", "及川雫",
]);
const agencyOrder: Record<string, number> = {
  "765PRO": 1, "876PRO": 2, "灰姑娘女孩": 3, "百万现场": 4, SideM: 5, "闪耀色彩": 6, "学园偶像大师": 7,
};
const agencyColors: Record<string, string> = {
  "765PRO": "#f34f6d", "876PRO": "#656a75", "灰姑娘女孩": "#2681c8", "百万现场": "#ffc30b",
  SideM: "#0fbe94", "闪耀色彩": "#8dbbff", "学园偶像大师": "#f39800",
};
const categoryFolders: Record<string, string> = {
  "P卡": "pcard", "S卡": "scard", "个人剧情": "personal", "活动剧情": "event", "未分类剧情": "other",
  "横卡": "h_card", "竖卡": "v_card", "生日": "birthday", "节日": "festival", "新年": "new_year",
  "情人节": "valentine", "白情": "whiteday", "圣诞节": "christmas", "万圣节": "halloween",
  "特殊": "special", "卡剧情": "card", "亲密度剧情": "intimacy", "初": "first", "N.I.A": "nia",
  STEP3: "step3", "组合剧情": "unit_story", "节日_生日": "festival_birthday", "其他": "others", SP: "sp",
  "二代": "gen2", "白金星光": "platinum", "星光舞台": "stella", OFA: "ofa", "星耀季节": "starlit",
  "enza主线": "enza_main", "Episode 0": "ep0", "特殊剧情": "special_story", "enzaP卡": "enza_pcard",
  "enzaS卡": "enza_scard", "scspP卡_电话": "scsp_pcard_call", "scspS卡": "scsp_scard",
  "【W.I.N.G.編】": "wing", "【ファン感謝祭編】": "fan_festival", "【G.R.A.D.編】": "grad",
  "【Landing Point編】": "landing_point", "【S.T.E.P.編】": "step",
  "ytb，X链接 [需要VPN]": "ytb_x_link", "b站的一些切片": "bilibili_clips",
  "🍫情人节": "valentine", "🍬白色情人节": "whiteday", "🃏愚人节": "april_fools",
  "🌟闪耀日": "shiny_day", "🎃万圣节": "halloween", "🎄圣诞节": "christmas", "📄其他": "others",
  "偶像直播": "idol_live", "星组": "ilstars", "安提卡": "lantica", "放学后": "afterschool",
  "花组": "alstroemeria", "迷光": "straylight", "N组": "noctchill", "嘘组": "shhis",
  "黑星": "cometik", "混组训练直播": "mixed_live",
};
const imageTypes: Record<string, { mimes: readonly string[]; formats: readonly string[] }> = {
  ".png": { mimes: ["image/png", "image/x-png"], formats: ["png"] },
  ".jpg": { mimes: ["image/jpeg", "image/jpg", "image/pjpeg"], formats: ["jpeg", "jpg"] },
  ".jpeg": { mimes: ["image/jpeg", "image/jpg", "image/pjpeg"], formats: ["jpeg", "jpg"] },
  ".jfif": { mimes: ["image/jpeg", "image/jpg", "image/pjpeg"], formats: ["jpeg", "jpg"] },
  ".gif": { mimes: ["image/gif"], formats: ["gif"] },
  ".webp": { mimes: ["image/webp"], formats: ["webp"] },
  ".bmp": { mimes: ["image/bmp", "image/x-ms-bmp"], formats: ["bmp"] },
  ".avif": { mimes: ["image/avif"], formats: ["avif", "heif"] },
};

export function isSupportedAgencyCode(code: string): code is SupportedAgencyCode {
  return supportedCodes.has(code);
}

export function requireWikiServices(services: RuntimeServices, names: Array<keyof RuntimeServices>) {
  for (const name of names) {
    if (!services[name]) throw new Error(`Wiki service "${String(name)}" is not configured`);
  }
}

export function toWikiAgency(record: AgencyRecord): WikiAgency | null {
  if (!isSupportedAgencyCode(record.code)) return null;
  return { id: record.id, code: record.code, name: record.name_cn, color: record.color };
}

export function toWikiIdol(
  record: IdolWithAgencyRecord,
  avatar: WikiAvatarMedia = { url: "", fit: "cover", source: "legacy-agency" },
): WikiIdol | null {
  if (!isSupportedAgencyCode(record.agency_code)) return null;
  return {
    id: record.id, agencyId: record.agency_id, agencyCode: record.agency_code,
    agencyName: record.agency_name, agencyColor: record.agency_color, name: record.name_cn,
    folderName: record.folder_name, color: record.color, avatarUrl: avatar.url, avatarFit: avatar.fit,
    avatarSource: avatar.source,
    textColor: lightColorIdols.has(record.name_cn) ? "#333333" : "#ffffff",
  };
}

export function toWikiIdolFromRecord(
  agency: WikiAgency,
  record: IdolRecord,
  avatar: WikiAvatarMedia = { url: "", fit: "cover", source: "legacy-agency" },
): WikiIdol {
  return {
    id: record.id, agencyId: record.agency_id, agencyCode: agency.code, agencyName: agency.name,
    agencyColor: agency.color, name: record.name_cn, folderName: record.folder_name,
    color: record.color, avatarUrl: avatar.url, avatarFit: avatar.fit, avatarSource: avatar.source,
    textColor: lightColorIdols.has(record.name_cn) ? "#333333" : "#ffffff",
  };
}

export function storyObjectKey(code: string, folderName: string, imageFile: string): string {
  const segments = ["Data", code, folderName, ...imageFile.split("/")];
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[\\/\0-\x1f\x7f]/.test(segment))) {
    throw new Error("invalid story object key");
  }
  return segments.join("/");
}

export function idolMediaObjectKey(code: string, folderName: string): string {
  return storyObjectKey(code, folderName, "icon.webp");
}

export function wikiStaticObjectKey(namespace: string, relativePath: string): string {
  if (!["icon", "css", "assets"].includes(namespace)) throw new Error("invalid Wiki static namespace");
  const segments = ["Wiki", "static", namespace, ...relativePath.split("/")];
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[\\/\0-\x1f\x7f]/.test(segment))) {
    throw new Error("invalid Wiki static object key");
  }
  return segments.join("/");
}

export function idolMediaUrl(agency: string, idol: string): string {
  return `/image/${encodeURIComponent(agency)}/${encodeURIComponent(idol)}/icon.webp`;
}

export async function findAvatar(storage: ObjectStorage, code: string, folderName: string, agency: string, idol: string) {
  for (const extension of avatarExtensions) {
    if (await storage.exists(storyObjectKey(code, folderName, `icon${extension}`))) {
      return {
        url: `/image/${encodeURIComponent(agency)}/${encodeURIComponent(idol)}/icon${extension}`,
        fit: "cover",
        source: "object-storage",
      } satisfies WikiAvatarMedia;
    }
  }
  return legacyAvatarMedia(code, folderName, idol);
}

export async function buildHomeAgencies(repository: StoryRepository, storage: ObjectStorage) {
  const rows = await repository.listIdolsWithAgencies();
  const idols = (await Promise.all(rows.map(async (row) => {
    if (!isSupportedAgencyCode(row.agency_code)) return null;
    const avatar = await findAvatar(storage, row.agency_code, row.folder_name, row.agency_name, row.name_cn);
    return toWikiIdol(row, avatar);
  }))).filter((idol): idol is WikiIdol => idol !== null);
  const grouped = new Map<string, { name: string; color: string; idols: WikiIdol[] }>();
  for (const idol of idols) {
    const group = grouped.get(idol.agencyName) ?? {
      name: idol.agencyName,
      color: agencyColors[idol.agencyName] ?? idol.agencyColor ?? "#ff9a9e",
      idols: [],
    };
    group.idols.push(idol);
    grouped.set(idol.agencyName, group);
  }
  return [...grouped.values()].sort((left, right) => (agencyOrder[left.name] ?? 99) - (agencyOrder[right.name] ?? 99));
}

export async function buildIdolMediaCatalog(repository: StoryRepository, storage: ObjectStorage) {
  const agencies = await buildHomeAgencies(repository, storage);
  return agencies.map((agency) => ({
    code: agency.idols[0]?.agencyCode ?? "",
    name: agency.name,
    idols: agency.idols.map((idol) => ({
      name: idol.name,
      imageUrl: idol.avatarUrl ?? "",
      imageFit: idol.avatarFit ?? "cover",
      source: idol.avatarSource ?? "legacy-agency",
    })),
  }));
}

export async function importLegacyIdolMedia(
  repository: StoryRepository,
  storage: ObjectStorage,
  staticAssets: StaticAssets,
  images: ImageProcessor,
  requestUrl: string,
) {
  const rows = await repository.listIdolsWithAgencies();
  let imported = 0;
  let skipped = 0;
  const failed: string[] = [];
  for (const row of rows) {
    const legacy = legacyCharacterAvatarMedia(row.agency_code, row.folder_name, row.name_cn);
    if (!legacy) continue;
    const key = idolMediaObjectKey(row.agency_code, row.folder_name);
    if (await storage.exists(key)) {
      skipped += 1;
      continue;
    }
    try {
      const source = await staticAssets.fetch(new Request(new URL(legacy.url, requestUrl), { method: "GET" }));
      if (!source.ok) throw new Error(`legacy asset returned ${source.status}`);
      const body = new Uint8Array(await source.arrayBuffer());
      await images.validate(body);
      const converted = await images.toWebp(body, 85);
      await storage.put(key, converted, {
        contentType: "image/webp",
        metadata: { source: "legacy", idol: row.name_cn },
      });
      imported += 1;
    } catch (_) {
      failed.push(`${row.agency_name}/${row.name_cn}`);
    }
  }
  return { imported, skipped, failed };
}

export function getPresetCategories(agency: string, idol: string): string[] {
  if (agency === "765PRO") {
    return new Set(["奥空心白", "玲音", "诗花", "四条贵音", "我那霸响", "亚夜", "星井美希"]).has(idol)
      ? [] : ["SP", "二代", "白金星光", "星光舞台", "OFA", "星耀季节"];
  }
  if (agency === "876PRO") return new Set(["日高爱", "水谷绘理", "秋月凉"]).has(idol) ? [] : ["ytb，X链接 [需要VPN]", "b站的一些切片"];
  if (agency === "灰姑娘女孩") return idol === "活动剧情" ? [] : ["特殊", "卡剧情"];
  if (agency === "百万现场") {
    return new Set(["主线剧情", "活动剧情", "管理层生日", "诗花", "玲音", "346"]).has(idol)
      ? [] : ["亲密度剧情", "横卡", "竖卡", "生日", "新年", "情人节", "白情", "圣诞节", "万圣节"];
  }
  if (agency === "SideM") return new Set(["朗读剧", "成长之星"]).has(idol) ? [] : ["个人剧情", "组合剧情", "活动剧情", "卡剧情", "节日_生日", "其他"];
  if (agency === "闪耀色彩") {
    if (idol === "enza组合") return ["illumination STARS", "L'Antica", "放学后Climax Girls", "Alstroemeria", "Straylight", "noctchill", "SHHis", "CoMETIK"];
    if (idol === "enza节日") return ["🍫情人节", "🍬白色情人节", "🃏愚人节", "🌟闪耀日", "🎃万圣节", "🎄圣诞节", "📄其他"];
    if (idol === "联动活动") return ["组合剧情"];
    if (idol === "直播") return ["偶像直播", "特殊", "星组", "安提卡", "放学后", "花组", "迷光", "N组", "嘘组", "黑星", "混组训练直播"];
    if (idol === "scsp活动") return [];
    if (new Set(["ルビー", "MEMちょ", "有馬かな", "黒川あかね"]).has(idol)) return ["enza主线", "enzaP卡", "enzaS卡"];
    if (idol === "七草叶月") return ["特殊剧情", "enzaS卡", "scspS卡"];
    return ["enza主线", "Episode 0", "特殊剧情", "enzaP卡", "enzaS卡", "scspP卡_电话", "scspS卡"];
  }
  if (agency === "学园偶像大师") return new Set(["活动剧情", "主线剧情", "S卡", "根绪亚纱里"]).has(idol) ? [] : ["初", "N.I.A", "STEP3", "P卡"];
  return ["个人剧情", "活动剧情", "未分类剧情"];
}

export function aggregateStories(rows: StoryRecord[], presetCategories: string[], agency: string, idol: string): WikiStoryCategory[] {
  const categories = new Map<string, Map<string, WikiStoryCategory["cards"][number]>>();
  for (const category of presetCategories) categories.set(category, new Map());
  for (const row of rows) {
    let cards = categories.get(row.category);
    if (!cards) { cards = new Map(); categories.set(row.category, cards); }
    let card = cards.get(row.card_name);
    if (!card) {
      card = {
        name: row.card_name,
        img: row.image_file ? `/image/${agency}/${idol}/${row.image_file}` : "",
        subtitle: row.subtitle ?? "",
        links: [],
      };
      cards.set(row.card_name, card);
    }
    card.links.push({ id: row.id, up: row.up_name, title: row.video_title, url: row.url });
  }
  return [...categories.entries()]
    .filter(([name, cards]) => presetCategories.includes(name) || cards.size > 0)
    .map(([name, cards]) => ({ name, cards: [...cards.values()] }));
}

function stableSuffix(value: string) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function categoryFolder(category: string): string {
  const mapped = categoryFolders[category];
  if (mapped) return mapped;
  const ascii = category.normalize("NFKC").replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return ascii || `cat_${stableSuffix(category)}`;
}

function randomId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID().replaceAll("-", "");
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function newStoryImageLocation(code: string, idolFolder: string, category: string, extension = ".webp") {
  const folder = categoryFolder(category);
  const filename = `${idolFolder}_${folder}_${randomId()}${extension}`;
  const imageFile = `${folder}/${filename}`;
  return { imageFile, key: storyObjectKey(code, idolFolder, imageFile), folder };
}

export async function validateAndConvertStoryImage(file: UploadedFile, images: ImageProcessor): Promise<Uint8Array> {
  const extension = /(?:\.[^.]+)$/.exec(file.filename)?.[0].toLocaleLowerCase() ?? "";
  const expected = imageTypes[extension];
  if (!expected) throw Object.assign(new Error("图片格式不支持"), { status: 400 });
  const contentType = file.contentType.split(";", 1)[0]!.trim().toLocaleLowerCase();
  if (!expected.mimes.includes(contentType)) throw Object.assign(new Error("图片扩展名与 MIME 类型不匹配"), { status: 400 });
  let info;
  try {
    info = await images.validate(file.body);
  } catch (_) {
    throw Object.assign(new Error("图片内容损坏或无法解码"), { status: 400 });
  }
  if (!expected.formats.includes(info.format.toLocaleLowerCase())) {
    throw Object.assign(new Error("图片内容与文件格式不匹配"), { status: 400 });
  }
  try {
    return await images.toWebp(file.body, 85);
  } catch (_) {
    throw Object.assign(new Error("图片内容损坏或无法解码"), { status: 400 });
  }
}

export async function randomBackground(
  repository: StoryRepository,
  storage: ObjectStorage,
  random = Math.random,
): Promise<WikiRandomBackground> {
  const candidates: WikiRandomBackground[] = [];
  for (const [code, categories] of Object.entries({
    cg: ["卡剧情"], sc: ["enzaP卡", "enzaS卡"], gk: ["P卡", "S卡"], ml: ["横卡"],
  })) {
    try {
      const story = await repository.sampleStory(code, categories);
      if (story?.image_file) {
        let url = legacyArtworkForAgency(story.agency_name);
        let cardName = "企划视觉素材";
        const agency = await repository.findAgencyByName(story.agency_name);
        const idol = agency ? await repository.findIdolByAgencyAndName(agency.id, story.idol_name) : null;
        if (agency && idol) {
          const key = storyObjectKey(agency.code, idol.folder_name, story.image_file);
          if (await storage.exists(key)) {
            url = `/image/${story.agency_name}/${story.idol_name}/${story.image_file}`;
            cardName = story.card_name;
          }
        }
        candidates.push({
          url,
          card_name: cardName, idol_name: story.idol_name, agency_name: story.agency_name,
        });
      }
    } catch (_) {
      // Legacy behavior skips a broken agency table and still serves other candidates.
    }
  }
  return candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]! : {
    url: legacyArtworkForAgency("765PRO"),
    card_name: "企划视觉素材",
    agency_name: "765PRO",
  };
}

interface BilibiliResponse {
  code?: number;
  message?: string;
  data?: any;
}

export async function parseBilibili(input: string, fetchImpl: typeof globalThis.fetch, timeoutMs = 5000) {
  const bv = /(BV[a-zA-Z0-9]{10})/.exec(input);
  const av = /av(\d+)/i.exec(input);
  const ml = /ml(\d+)/i.exec(input);
  if (!bv && !av && !ml) return { status: "error", msg: "未检测到有效的 BV号/av号/收藏夹链接" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const apiUrl = bv || av
      ? `https://api.bilibili.com/x/web-interface/view?${bv ? `bvid=${bv[1]}` : `aid=${av![1]}`}`
      : `https://api.bilibili.com/x/v3/fav/folder/info?media_id=${ml![1]}`;
    const response = await fetchImpl(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    const payload = await response.json() as BilibiliResponse;
    if (payload.code !== 0) return { status: "error", msg: payload.message || "未知错误" };
    if (ml) {
      return {
        status: "success", title: String(payload.data?.title ?? ""), up: String(payload.data?.upper?.name ?? ""),
        std_url: `https://www.bilibili.com/list/ml${ml[1]}`,
      };
    }
    const pageNumber = Number(/[?&]p=(\d+)/.exec(input)?.[1] ?? "1");
    const pages = Array.isArray(payload.data?.pages) ? payload.data.pages : [];
    const page = pages.find((candidate: any) => candidate.page === pageNumber) ?? pages[0];
    const title = pages.length > 1 && page?.part ? page.part : payload.data?.title;
    return {
      status: "success", title: String(title ?? ""), up: String(payload.data?.owner?.name ?? ""),
      std_url: `https://www.bilibili.com/video/${String(payload.data?.bvid ?? bv?.[1] ?? "")}${pageNumber > 1 ? `?p=${pageNumber}` : ""}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
