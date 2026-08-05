import type { UploadedFile } from "@/ports/http";
import type { ImageProcessor } from "@/ports/media";
import type { RuntimeServices } from "@/ports/runtime-services";
import type { ObjectStorage } from "@/ports/object-storage";
import type {
  AgencyRecord,
  IdolRecord,
  IdolWithAgencyRecord,
  StoryCardRecord,
  StoryRecord,
  StoryRepository,
  WikiCategoryRecord,
  WikiGroupRecord,
  WikiImageTransform,
} from "@/ports/repositories";
import {
  type WikiAgency,
  type WikiIdol,
  type WikiRandomBackground,
  type WikiRandomIdol,
  type WikiStoryCategory,
} from "@/domains/wiki/models";
import {
  requirePublicObjectUrl,
  resolvePublicObjectUrl,
} from "@/utils/storage/public-object-url";
import { normalizeBilibiliCoverUrl } from "@/utils/media/bilibili-cover";

export const DEFAULT_STORY_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const imageTypes: Record<
  string,
  { mimes: readonly string[]; formats: readonly string[] }
> = {
  ".png": { mimes: ["image/png", "image/x-png"], formats: ["png"] },
  ".jpg": {
    mimes: ["image/jpeg", "image/jpg", "image/pjpeg"],
    formats: ["jpeg", "jpg"],
  },
  ".jpeg": {
    mimes: ["image/jpeg", "image/jpg", "image/pjpeg"],
    formats: ["jpeg", "jpg"],
  },
  ".jfif": {
    mimes: ["image/jpeg", "image/jpg", "image/pjpeg"],
    formats: ["jpeg", "jpg"],
  },
  ".gif": { mimes: ["image/gif"], formats: ["gif"] },
  ".webp": { mimes: ["image/webp"], formats: ["webp"] },
  ".bmp": { mimes: ["image/bmp", "image/x-ms-bmp"], formats: ["bmp"] },
  ".avif": { mimes: ["image/avif"], formats: ["avif", "heif"] },
};

export function requireWikiServices(
  services: RuntimeServices,
  names: Array<keyof RuntimeServices>,
) {
  for (const name of names) {
    if (!services[name])
      throw new Error(`Wiki service "${String(name)}" is not configured`);
  }
}

export function toWikiAgency(record: AgencyRecord): WikiAgency {
  return {
    id: record.id,
    code: record.code,
    name: record.name_cn,
    color: record.color,
    bannerTitle: record.banner_title,
    iconUrl: record.icon_object_key ? agencyIconUrl(record.id) : null,
    layoutRevision: record.layout_revision,
    imageTransform: agencyImageTransform(record),
    mediaRevision: record.icon_media_revision,
  };
}

export function toWikiIdol(record: IdolWithAgencyRecord): WikiIdol {
  return {
    id: record.id,
    agencyId: record.agency_id,
    agencyCode: record.agency_code,
    agencyName: record.agency_name,
    agencyColor: record.agency_color,
    name: record.name_cn,
    folderName: record.folder_name,
    color: record.color,
    wikiUrl: record.wiki_url,
    avatarUrl: record.avatar_object_key
      ? idolMediaUrl(record.agency_name, record.name_cn)
      : "",
    avatarFit: record.avatar_fit,
    avatarTransform: idolImageTransform(record),
    mediaRevision: record.avatar_media_revision,
    avatarSource: record.avatar_object_key ? "object-storage" : "none",
    textColor: record.text_color,
    entryKind: record.entry_kind,
    entrySubtype: record.entry_subtype,
  };
}

export function toWikiIdolFromRecord(
  agency: WikiAgency,
  record: IdolRecord,
): WikiIdol {
  return {
    id: record.id,
    agencyId: record.agency_id,
    agencyCode: agency.code,
    agencyName: agency.name,
    agencyColor: agency.color,
    name: record.name_cn,
    folderName: record.folder_name,
    color: record.color,
    wikiUrl: record.wiki_url,
    avatarUrl: record.avatar_object_key
      ? idolMediaUrl(agency.name, record.name_cn)
      : "",
    avatarFit: record.avatar_fit,
    avatarTransform: idolImageTransform(record),
    mediaRevision: record.avatar_media_revision,
    avatarSource: record.avatar_object_key ? "object-storage" : "none",
    textColor: record.text_color,
    entryKind: record.entry_kind,
    entrySubtype: record.entry_subtype,
  };
}

export function agencyImageTransform(record: AgencyRecord): WikiImageTransform {
  return {
    fit: record.icon_fit,
    focalX: record.icon_focal_x,
    focalY: record.icon_focal_y,
    zoom: record.icon_zoom,
    rotation: record.icon_rotation,
  };
}

export function groupImageTransform(
  record: WikiGroupRecord,
): WikiImageTransform {
  return {
    fit: record.icon_fit,
    focalX: record.icon_focal_x,
    focalY: record.icon_focal_y,
    zoom: record.icon_zoom,
    rotation: record.icon_rotation,
  };
}

export function idolImageTransform(record: IdolRecord): WikiImageTransform {
  return {
    fit: record.avatar_fit,
    focalX: record.avatar_focal_x,
    focalY: record.avatar_focal_y,
    zoom: record.avatar_zoom,
    rotation: record.avatar_rotation,
  };
}

export function storyImageTransform(
  record: StoryRecord | StoryCardRecord,
): WikiImageTransform {
  return {
    fit: record.image_fit,
    focalX: record.image_focal_x,
    focalY: record.image_focal_y,
    zoom: record.image_zoom,
    rotation: record.image_rotation,
  };
}

export function storyPresentationTransform(
  record: StoryRecord | StoryCardRecord,
): WikiImageTransform {
  if (record.cover_asset_presentation_policy === "contain") {
    return {
      fit: "contain",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
      rotation: 0,
    };
  }
  return storyImageTransform(record);
}

export function storyObjectKey(
  code: string,
  folderName: string,
  imageFile: string,
): string {
  const segments = [
    "wiki",
    "agencies",
    code,
    "idols",
    folderName,
    "story-images",
    ...imageFile.split("/"),
  ];
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[\\/\0-\x1f\x7f]/.test(segment),
    )
  ) {
    throw new Error("invalid story object key");
  }
  return segments.join("/");
}

export function idolMediaObjectKey(
  code: string,
  folderName: string,
  extension = ".webp",
): string {
  const segments = [
    "wiki",
    "agencies",
    code,
    "idols",
    folderName,
    `avatar${extension}`,
  ];
  if (
    segments.some((segment) => !segment || /[\\/\0-\x1f\x7f]/.test(segment))
  ) {
    throw new Error("invalid Wiki idol media object key");
  }
  return segments.join("/");
}

export function agencyIconObjectKey(code: string): string {
  return `wiki/agencies/${code}/branding/icon.webp`;
}

export function versionedAgencyIconObjectKey(
  code: string,
  version: string,
): string {
  return `wiki/agencies/${code}/branding/icons/${version}.webp`;
}

export function versionedStoryCoverAssetObjectKey(
  code: string,
  version: string,
): string {
  return `wiki/agencies/${code}/story-cover-assets/${version}.webp`;
}

export function versionedWikiGroupIconObjectKey(
  code: string,
  groupCode: string,
  version: string,
): string {
  return `wiki/agencies/${code}/groups/${groupCode}/icons/${version}.webp`;
}

export function versionedIdolAvatarObjectKey(
  code: string,
  folderName: string,
  version: string,
): string {
  return `wiki/agencies/${code}/idols/${folderName}/avatars/${version}.webp`;
}

export function agencyIconUrl(id: number): string {
  return `/icon/agencies/${id}.webp`;
}

export function wikiGroupIconUrl(id: number): string {
  return `/icon/wiki-groups/${id}.webp`;
}

export function idolMediaUrl(agency: string, idol: string): string {
  return `/image/${encodeURIComponent(agency)}/${encodeURIComponent(idol)}/icon.webp`;
}

export function wikiStoryImageUrl(
  agency: string,
  idol: string,
  imageFile: string | null,
): string {
  if (!imageFile) return "";
  const path = imageFile.split("/").map(encodeURIComponent).join("/");
  return `/image/${encodeURIComponent(agency)}/${encodeURIComponent(idol)}/${path}`;
}

export function aggregateStories(
  rows: StoryRecord[],
  categoryRecords: WikiCategoryRecord[],
  agency: string,
  idol: string,
  cardRows: StoryCardRecord[] = [],
): WikiStoryCategory[] {
  const categories = new Map<
    string,
    Map<string, WikiStoryCategory["cards"][number]>
  >();
  for (const category of categoryRecords)
    categories.set(category.name, new Map());
  for (const row of cardRows) {
    let cards = categories.get(row.category);
    if (!cards) {
      cards = new Map();
      categories.set(row.category, cards);
    }
    cards.set(row.card_name, {
      id: row.card_id,
      name: row.card_name,
      img: wikiStoryImageUrl(agency, idol, row.image_file),
      subtitle: row.subtitle ?? "",
      imageTransform: storyPresentationTransform(row),
      links: [],
    });
  }
  for (const row of rows) {
    let cards = categories.get(row.category);
    if (!cards) {
      cards = new Map();
      categories.set(row.category, cards);
    }
    let card = cards.get(row.card_name);
    if (!card) {
      card = {
        id: row.card_id,
        name: row.card_name,
        img: wikiStoryImageUrl(agency, idol, row.image_file),
        subtitle: row.subtitle ?? "",
        imageTransform: storyPresentationTransform(row),
        links: [],
      };
      cards.set(row.card_name, card);
    }
    card.links.push({
      id: row.id,
      up: row.up_name,
      title: row.video_title,
      url: row.url,
      contentType: row.content_type_name,
      contentTypeIcon: row.content_type_icon_name,
      sourcePlatform: row.source_platform_name,
    });
  }
  return [...categories.entries()]
    .filter(
      ([name, cards]) =>
        categoryRecords.some(
          (category) => category.name === name && category.show_when_empty,
        ) || cards.size > 0,
    )
    .map(([name, cards]) => ({ name, cards: [...cards.values()] }));
}

export function categoryStorageSlug(value: string) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (hash >>> 0).toString(36);
  const ascii = value
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (ascii || `cat_${suffix}`).toLocaleLowerCase();
}

function randomId() {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID().replaceAll("-", "");
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function newStoryImageLocation(
  code: string,
  idolFolder: string,
  storageSlug: string,
  extension = ".webp",
) {
  const filename = `${idolFolder}_${storageSlug}_${randomId()}${extension}`;
  const imageFile = `${storageSlug}/${filename}`;
  return {
    imageFile,
    key: storyObjectKey(code, idolFolder, imageFile),
    folder: storageSlug,
  };
}

export async function validateAndConvertStoryImage(
  file: UploadedFile,
  images: ImageProcessor,
): Promise<Uint8Array> {
  const extension =
    /(?:\.[^.]+)$/.exec(file.filename)?.[0].toLocaleLowerCase() ?? "";
  const expected = imageTypes[extension];
  if (!expected)
    throw Object.assign(new Error("图片格式不支持"), { status: 400 });
  const contentType = file.contentType
    .split(";", 1)[0]!
    .trim()
    .toLocaleLowerCase();
  if (!expected.mimes.includes(contentType))
    throw Object.assign(new Error("图片扩展名与 MIME 类型不匹配"), {
      status: 400,
    });
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
): Promise<WikiRandomBackground> {
  const story = await repository.sampleWikiBackground();
  if (!story || (!story.image_file && !story.cover_asset_object_key)) {
    return { url: "" };
  }
  const objectKey =
    story.cover_asset_object_key ??
    storyObjectKey(
      story.agency_code,
      story.idol_folder_name,
      story.image_file!,
    );
  return {
    url: story.cover_asset_object_key
      ? await requirePublicObjectUrl(storage, objectKey)
      : await resolvePublicObjectUrl(
          storage,
          objectKey,
          wikiStoryImageUrl(
            story.agency_name,
            story.idol_name,
            story.image_file,
          ),
        ),
    card_id: story.card_id,
    card_name: story.card_name,
    idol_name: story.idol_name,
    agency_name: story.agency_name,
  };
}

export async function randomIdol(
  repository: StoryRepository,
  storage: ObjectStorage,
  random: () => number = Math.random,
): Promise<WikiRandomIdol> {
  const [agencies, idols] = await Promise.all([
    repository.listAgencies(),
    repository.listIdolsWithAgencies(),
  ]);
  const enabledAgencyIds = new Set(
    agencies.filter((agency) => agency.wiki_enabled).map((agency) => agency.id),
  );
  const eligibleIdols = idols.filter(
    (idol) =>
      enabledAgencyIds.has(idol.agency_id) &&
      idol.wiki_enabled &&
      idol.entry_kind === "idol",
  );
  if (!eligibleIdols.length) {
    return { status: "success", eligibleCount: 0, idol: null };
  }

  const sampledIndex = Math.min(
    eligibleIdols.length - 1,
    Math.max(0, Math.floor(random() * eligibleIdols.length)),
  );
  const row = eligibleIdols[sampledIndex]!;
  const idol = toWikiIdol(row);
  const agency = agencies.find((candidate) => candidate.id === row.agency_id)!;
  const [imageUrl, iconUrl] = await Promise.all([
    row.avatar_object_key
      ? resolvePublicObjectUrl(
          storage,
          row.avatar_object_key,
          idol.avatarUrl ?? "",
        )
      : "",
    agency.icon_object_key
      ? resolvePublicObjectUrl(
          storage,
          agency.icon_object_key,
          agencyIconUrl(agency.id),
        )
      : null,
  ]);
  return {
    status: "success",
    eligibleCount: eligibleIdols.length,
    idol: {
      id: idol.id,
      name: idol.name,
      color: idol.color,
      textColor: idol.textColor ?? "#ffffff",
      imageUrl,
      imageTransform: idol.avatarTransform!,
      agency: {
        id: idol.agencyId,
        code: idol.agencyCode,
        name: idol.agencyName,
        color: idol.agencyColor,
        iconUrl,
        imageTransform: agencyImageTransform(agency),
      },
    },
  };
}

interface BilibiliResponse {
  code?: number;
  message?: string;
  data?: any;
}

export async function parseBilibili(
  input: string,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs = 5000,
) {
  const bv = /(BV[a-zA-Z0-9]{10})/.exec(input);
  const av = /av(\d+)/i.exec(input);
  const ml = /ml(\d+)/i.exec(input);
  if (!bv && !av && !ml)
    return { status: "error", msg: "未检测到有效的 BV号/av号/收藏夹链接" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const apiUrl =
      bv || av
        ? `https://api.bilibili.com/x/web-interface/view?${bv ? `bvid=${bv[1]}` : `aid=${av![1]}`}`
        : `https://api.bilibili.com/x/v3/fav/folder/info?media_id=${ml![1]}`;
    const response = await fetchImpl(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    const payload = (await response.json()) as BilibiliResponse;
    if (payload.code !== 0)
      return { status: "error", msg: payload.message || "未知错误" };
    if (ml) {
      return {
        status: "success",
        title: String(payload.data?.title ?? ""),
        up: String(payload.data?.upper?.name ?? ""),
        std_url: `https://www.bilibili.com/list/ml${ml[1]}`,
        cover_url: normalizeBilibiliCoverUrl(payload.data?.cover),
      };
    }
    const pageNumber = Number(/[?&]p=(\d+)/.exec(input)?.[1] ?? "1");
    const pages = Array.isArray(payload.data?.pages) ? payload.data.pages : [];
    const page =
      pages.find((candidate: any) => candidate.page === pageNumber) ?? pages[0];
    const title =
      pages.length > 1 && page?.part ? page.part : payload.data?.title;
    return {
      status: "success",
      title: String(title ?? ""),
      up: String(payload.data?.owner?.name ?? ""),
      std_url: `https://www.bilibili.com/video/${String(payload.data?.bvid ?? bv?.[1] ?? "")}${pageNumber > 1 ? `?p=${pageNumber}` : ""}`,
      cover_url: normalizeBilibiliCoverUrl(payload.data?.pic),
    };
  } finally {
    clearTimeout(timeout);
  }
}
