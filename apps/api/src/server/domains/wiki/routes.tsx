import type { Context, Env, Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { RuntimeServices } from "@/ports/runtime-services";
import type { ParsedUpload, UploadedFile } from "@/ports/upload-parser";
import { deleteObjectWithCompensation } from "@/shared/compensation";
import { storedObjectResponse } from "@/shared/stored-object-response";
import {
  DEFAULT_STORY_UPLOAD_MAX_BYTES,
  aggregateStories,
  buildHomeAgencies,
  buildIdolMediaCatalog,
  categoryFolder,
  findAvatar,
  getPresetCategories,
  idolMediaObjectKey,
  idolMediaUrl,
  importLegacyIdolMedia,
  isSupportedAgencyCode,
  newStoryImageLocation,
  parseBilibili,
  randomBackground,
  requireWikiServices,
  storyObjectKey,
  toWikiAgency,
  toWikiIdolFromRecord,
  validateAndConvertStoryImage,
  wikiStaticObjectKey,
} from "@/domains/wiki/service";
import { WikiHomeTemplate } from "@/domains/wiki/templates/index";
import { WikiStoryTemplate } from "@/domains/wiki/templates/story";

export type WikiServicesResolver<E extends Env> = (
  context: Context<E>,
) => RuntimeServices | Promise<RuntimeServices>;

const jsonHeaders = { "Content-Type": "application/json; charset=UTF-8" };
const errorBody = (msg: string) => ({ status: "error", msg });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function plain(body: string, status: number) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
}

function statusOf(error: unknown, fallback = 500) {
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number" && Number.isInteger(status) ? status : fallback;
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

async function authorizeWikiWrite<E extends Env>(context: Context<E>, services: RuntimeServices) {
  if (!services.tokens) throw new Error("Wiki token service is not configured");
  const token = getCookie(context, "token");
  if (!token) return json(errorBody("未登录，请先登录"), 401);
  let claims;
  try {
    claims = await services.tokens.verify(token);
  } catch (_) {
    return json(errorBody("未登录，请先登录"), 401);
  }
  if (!["op", "editor"].includes(claims.dept)) return json(errorBody("无权限执行此操作"), 403);
  const csrf = context.req.header("X-CSRFToken");
  if (!csrf || typeof claims.csrfSecret !== "string" || !constantTimeEqual(csrf, claims.csrfSecret)) {
    return json(errorBody("CSRF token 无效，请刷新页面重试"), 403);
  }
  return null;
}

function decodeWikiSegment(value: string): string {
  let decoded = value;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      if (iteration === 0) throw new Error("Forbidden");
      break;
    }
    if (next === decoded) break;
    decoded = next;
    if (!decoded || decoded === "." || decoded === ".." || /[\\/\0-\x1f\x7f]/.test(decoded)) {
      throw new Error("Forbidden");
    }
  }
  if (!decoded || decoded === "." || decoded === ".." || /[\\/\0-\x1f\x7f]/.test(decoded)) {
    throw new Error("Forbidden");
  }
  return decoded;
}

async function parseWikiUpload(request: Request, services: RuntimeServices): Promise<ParsedUpload> {
  const maxBytes = services.config?.storyMaxUploadBytes ?? DEFAULT_STORY_UPLOAD_MAX_BYTES;
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw Object.assign(new Error("上传文件超过大小限制"), { status: 413 });
  }
  const contentType = request.headers.get("content-type")?.toLocaleLowerCase() ?? "";
  if (contentType.startsWith("application/x-www-form-urlencoded")) {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > maxBytes) {
      throw Object.assign(new Error("上传文件超过大小限制"), { status: 413 });
    }
    return { fields: Object.fromEntries(new URLSearchParams(body)), files: {} };
  }
  if (!services.uploads) throw new Error("Wiki upload parser is not configured");
  return services.uploads.parse(request, {
    maxBytes,
    fileFields: ["image"],
    maxFiles: 1,
    maxFields: 16,
    maxParts: 17,
  });
}

function singleFile(upload: ParsedUpload, field: string): UploadedFile | undefined {
  const value = upload.files[field];
  return Array.isArray(value) ? value[0] : value;
}

function splitStoryUrl(raw: string) {
  const separator = raw.indexOf(" | ");
  return separator < 0
    ? { url: raw.trim(), subtitle: "" }
    : { url: raw.slice(0, separator).trim(), subtitle: raw.slice(separator + 3).trim() };
}

async function findMutationTarget(services: RuntimeServices, agencyName: string, idolName: string) {
  const repository = services.story!;
  const agencyRecord = await repository.findAgencyByName(agencyName);
  const agency = agencyRecord ? toWikiAgency(agencyRecord) : null;
  if (!agency) return { error: json(errorBody("企划不存在")) } as const;
  const idolRecord = await repository.findIdolByAgencyAndName(agency.id, idolName);
  if (!idolRecord) return { error: json(errorBody("找不到该偶像")) } as const;
  return { agency, idol: toWikiIdolFromRecord(agency, idolRecord) } as const;
}

async function cleanupObjects(services: RuntimeServices, keys: Iterable<string>) {
  if (!services.storage) return;
  const uniqueKeys = [...new Set(keys)];
  const results = await Promise.allSettled(
    uniqueKeys.map((key) => deleteObjectWithCompensation(services, key)),
  );
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error(`Failed to clean committed Wiki object: ${uniqueKeys[index]}`, result.reason);
    }
  }
}

async function cleanupObjectPrefix(
  services: RuntimeServices,
  prefix: string,
  knownKeys: Iterable<string>,
) {
  const keys = [...knownKeys];
  const directoryPrefix = `${prefix.replace(/\/+$/, "")}/`;
  try {
    keys.push(...(await services.storage!.list(directoryPrefix))
      .filter((object) => object.key.startsWith(directoryPrefix))
      .map((object) => object.key));
  } catch (error) {
    console.error(`Failed to enumerate committed Wiki prefix: ${directoryPrefix}`, error);
  }
  await cleanupObjects(services, keys);
}

export function registerWikiRoutes<E extends Env>(
  app: Hono<E>,
  resolveServices: WikiServicesResolver<E>,
): void {
  app.get("/api/wiki/test", (context) => context.json({ status: "ok" }));

  app.on(["GET", "HEAD"], "/icon/*", async (context) => {
    const services = await resolveServices(context);
    requireWikiServices(services, ["staticAssets"]);
    const segments = new URL(context.req.raw.url).pathname.split("/").slice(2);
    try {
      const relativePath = segments.map(decodeWikiSegment).join("/");
      const object = await services.storage?.get(wikiStaticObjectKey("icon", relativePath));
      if (object) return storedObjectResponse(context.req.raw, object);
    } catch (error) {
      const message = messageOf(error, "");
      if (message.startsWith("Forbidden") || message.startsWith("invalid Wiki")) {
        return plain("Forbidden", 403);
      }
    }
    return services.staticAssets!.fetch(context.req.raw);
  });

  app.on(["GET", "HEAD"], "/css/*", async (context) => {
    const services = await resolveServices(context);
    requireWikiServices(services, ["staticAssets"]);
    const segments = new URL(context.req.raw.url).pathname.split("/").slice(2);
    try {
      const relativePath = segments.map(decodeWikiSegment).join("/");
      const object = await services.storage?.get(wikiStaticObjectKey("css", relativePath));
      if (object) return storedObjectResponse(context.req.raw, object);
    } catch (error) {
      const message = messageOf(error, "");
      if (message.startsWith("Forbidden") || message.startsWith("invalid Wiki")) {
        return plain("Forbidden", 403);
      }
    }
    return services.staticAssets!.fetch(context.req.raw);
  });

  app.on(["GET", "HEAD"], "/image/:agency/:idol/*", async (context) => {
    const services = await resolveServices(context);
    requireWikiServices(services, ["story", "storage"]);
    let agencyName: string;
    let idolName: string;
    let filename: string;
    const pathSegments = new URL(context.req.raw.url).pathname.split("/");
    if (pathSegments.length < 5 || pathSegments[1] !== "image") return plain("Not found", 404);
    try {
      agencyName = decodeWikiSegment(pathSegments[2]);
      idolName = decodeWikiSegment(pathSegments[3]);
      filename = pathSegments.slice(4).map(decodeWikiSegment).join("/");
    } catch {
      return plain("Forbidden", 403);
    }
    if (!agencyName || !idolName || !filename) return plain("Not found", 404);
    const agency = await services.story!.findAgencyByName(agencyName);
    if (!agency || !isSupportedAgencyCode(agency.code)) return plain("Not found", 404);
    const idol = await services.story!.findIdolByAgencyAndName(agency.id, idolName);
    if (!idol) return plain("Not found", 404);
    let object;
    try {
      object = await services.storage!.get(storyObjectKey(agency.code, idol.folder_name, filename));
    } catch (_) {
      return plain("Not found", 404);
    }
    return object ? storedObjectResponse(context.req.raw, object) : plain("Not found", 404);
  });

  app.get("/wiki/", async (context) => {
    const services = await resolveServices(context);
    requireWikiServices(services, ["story", "storage"]);
    const [agencies, initialBg] = await Promise.all([
      buildHomeAgencies(services.story!, services.storage!),
      randomBackground(services.story!, services.storage!),
    ]);
    return context.html(<WikiHomeTemplate agencies={agencies} initialBg={initialBg.url ? initialBg : null} />);
  });

  app.get("/story", async (context) => {
    const agencyName = context.req.query("agency");
    const idolName = context.req.query("idol");
    if (!agencyName || !idolName) return plain("参数缺失", 400);
    const services = await resolveServices(context);
    requireWikiServices(services, ["story", "storage"]);
    const agencyRecord = await services.story!.findAgencyByName(agencyName);
    const agency = agencyRecord ? toWikiAgency(agencyRecord) : null;
    if (!agency) return plain("找不到该企划", 404);
    const idolRecord = await services.story!.findIdolByAgencyAndName(agency.id, idolName);
    if (!idolRecord) return plain("数据库中未找到该偶像", 404);
    const [stories, avatarUrl] = await Promise.all([
      services.story!.listStories(agency.code, idolRecord.id),
      findAvatar(services.storage!, agency.code, idolRecord.folder_name, agency.name, idolRecord.name_cn),
    ]);
    const presetCategories = getPresetCategories(agency.name, idolRecord.name_cn);
    const categories = aggregateStories(stories, presetCategories, agency.name, idolRecord.name_cn);
    const idolColor = lightColorIdolsForRoute(idolRecord.name_cn) ? agency.color : idolRecord.color;
    return context.html(<WikiStoryTemplate
      agency={agency.name}
      idol={idolRecord.name_cn}
      idolDisplayName={idolRecord.name_cn}
      categories={categories}
      presetCategories={presetCategories}
      avatarUrl={avatarUrl.url}
      avatarFit={avatarUrl.fit}
      idolColor={idolColor}
    />);
  });

  app.get("/api/wiki/idol-media", async (context) => {
    const services = await resolveServices(context);
    requireWikiServices(services, ["story", "storage"]);
    return json({
      status: "success",
      agencies: await buildIdolMediaCatalog(services.story!, services.storage!),
    });
  });

  app.post("/api/wiki/idol-media", async (context) => {
    const services = await resolveServices(context);
    const unauthorized = await authorizeWikiWrite(context, services);
    if (unauthorized) return unauthorized;
    requireWikiServices(services, ["story", "storage", "images", "uploads"]);
    try {
      const upload = await parseWikiUpload(context.req.raw, services);
      const file = singleFile(upload, "image");
      if (!file?.filename) return json(errorBody("请选择角色图片"), 400);
      const target = await findMutationTarget(
        services,
        (upload.fields.agency ?? "").trim(),
        (upload.fields.idol ?? "").trim(),
      );
      if ("error" in target) return target.error;
      const converted = await validateAndConvertStoryImage(file, services.images!);
      const key = idolMediaObjectKey(target.agency.code, target.idol.folderName);
      const object = await services.storage!.put(key, converted, {
        contentType: "image/webp",
        metadata: { kind: "idol-media", idol: target.idol.name },
      });
      return json({
        status: "success",
        url: `${idolMediaUrl(target.agency.name, target.idol.name)}?v=${encodeURIComponent(object.etag)}`,
      });
    } catch (error) {
      const status = statusOf(error);
      if (status === 413) return json(errorBody("上传文件超过大小限制"), 413);
      if (status === 400) return json(errorBody(messageOf(error, "图片内容损坏或无法解码")), 400);
      return json(errorBody("保存角色素材失败"), 500);
    }
  });

  app.delete("/api/wiki/idol-media", async (context) => {
    const services = await resolveServices(context);
    const unauthorized = await authorizeWikiWrite(context, services);
    if (unauthorized) return unauthorized;
    requireWikiServices(services, ["story", "storage"]);
    try {
      const fields = await context.req.json<Record<string, unknown>>();
      const target = await findMutationTarget(
        services,
        typeof fields.agency === "string" ? fields.agency.trim() : "",
        typeof fields.idol === "string" ? fields.idol.trim() : "",
      );
      if ("error" in target) return target.error;
      await deleteObjectWithCompensation(
        services,
        idolMediaObjectKey(target.agency.code, target.idol.folderName),
      );
      return json({ status: "success" });
    } catch (error) {
      const status = statusOf(error, 400);
      return json(errorBody(messageOf(error, "删除角色素材失败")), status);
    }
  });

  app.post("/api/wiki/idol-media/import-legacy", async (context) => {
    const services = await resolveServices(context);
    const unauthorized = await authorizeWikiWrite(context, services);
    if (unauthorized) return unauthorized;
    requireWikiServices(services, ["story", "storage", "staticAssets", "images"]);
    try {
      const result = await importLegacyIdolMedia(
        services.story!,
        services.storage!,
        services.staticAssets!,
        services.images!,
        context.req.url,
      );
      return json({ status: "success", ...result });
    } catch (_) {
      return json(errorBody("导入 Legacy 角色素材失败"), 500);
    }
  });

  app.post("/api/wiki/add_story", async (context) => {
    const services = await resolveServices(context);
    const unauthorized = await authorizeWikiWrite(context, services);
    if (unauthorized) return unauthorized;
    requireWikiServices(services, ["story", "storage", "images", "uploads"]);
    let createdKey: string | null = null;
    try {
      const upload = await parseWikiUpload(context.req.raw, services);
      const fields = upload.fields;
      const file = singleFile(upload, "image");
      const converted = file?.filename
        ? await validateAndConvertStoryImage(file, services.images!)
        : null;
      const agencyName = (fields.agency ?? "").trim();
      const idolName = (fields.idol ?? "").trim();
      const target = await findMutationTarget(services, agencyName, idolName);
      if ("error" in target) return target.error;
      const category = (fields.category_name ?? "未分类剧情").trim();
      const cardName = (fields.card_name ?? "").trim();
      const upName = (fields.up_name ?? "默认UP").trim();
      const videoTitle = (fields.video_title ?? "").trim();
      const parsedUrl = splitStoryUrl((fields.url ?? "#").trim());
      let imageFile: string | null = "";
      if (file?.filename && converted) {
        const location = newStoryImageLocation(target.agency.code, target.idol.folderName, category);
        createdKey = location.key;
        imageFile = location.imageFile;
        await services.storage!.put(createdKey, converted, { contentType: "image/webp" });
      }
      await services.story!.insertStoryReturningId({
        agencyCode: target.agency.code, idolId: target.idol.id, category, cardName, upName,
        videoTitle, url: parsedUrl.url, subtitle: parsedUrl.subtitle, imageFile,
      });
      return json({ status: "success" });
    } catch (error) {
      if (createdKey) await cleanupObjects(services, [createdKey]);
      const status = statusOf(error);
      if (status === 413) return json(errorBody("上传文件超过大小限制"), 413);
      if (status === 400) return json(errorBody(messageOf(error, "图片内容损坏或无法解码")), 400);
      return json(errorBody("保存剧情失败"), 500);
    }
  });

  app.post("/api/wiki/edit_story", async (context) => {
    const services = await resolveServices(context);
    const unauthorized = await authorizeWikiWrite(context, services);
    if (unauthorized) return unauthorized;
    requireWikiServices(services, ["story", "storage", "images", "uploads"]);
    let createdKey: string | null = null;
    let oldKey: string | null = null;
    try {
      const upload = await parseWikiUpload(context.req.raw, services);
      const fields = upload.fields;
      const file = singleFile(upload, "image");
      const converted = file?.filename
        ? await validateAndConvertStoryImage(file, services.images!)
        : null;
      const target = await findMutationTarget(services, (fields.agency ?? "").trim(), (fields.idol ?? "").trim());
      if ("error" in target) return target.error;
      const oldCardName = (fields.old_card_name ?? "").trim();
      const oldCategory = (fields.old_category_name ?? "").trim();
      const category = (fields.category_name ?? "").trim();
      const cardName = (fields.card_name ?? "").trim();
      const record = await services.story!.findFirstStoryByCard(target.agency.code, target.idol.id, oldCategory, oldCardName);
      if (!record) return json(errorBody("找不到要修改的记录"));
      let imageFile = record.image_file;
      if (file?.filename && converted) {
        const location = newStoryImageLocation(target.agency.code, target.idol.folderName, category);
        createdKey = location.key;
        imageFile = location.imageFile;
        await services.storage!.put(createdKey, converted, { contentType: "image/webp" });
        if (record.image_file) oldKey = storyObjectKey(target.agency.code, target.idol.folderName, record.image_file);
      } else if (record.image_file && oldCategory !== category) {
        const extension = /(?:\.[^./]+)$/.exec(record.image_file)?.[0] ?? ".webp";
        const location = newStoryImageLocation(target.agency.code, target.idol.folderName, category, extension);
        const sourceKey = storyObjectKey(target.agency.code, target.idol.folderName, record.image_file);
        if (await services.storage!.exists(sourceKey)) {
          createdKey = location.key;
          await services.storage!.copy(sourceKey, location.key);
          oldKey = sourceKey;
          imageFile = location.imageFile;
        }
      }
      const parsedUrl = splitStoryUrl((fields.url ?? "").trim());
      const story = {
        id: record.id, agencyCode: target.agency.code, idolId: target.idol.id, category, cardName,
        upName: (fields.up_name ?? "").trim(), videoTitle: (fields.video_title ?? "").trim(),
        url: parsedUrl.url, subtitle: parsedUrl.subtitle, imageFile,
      };
      await services.story!.updateStoryAndRenameGroup({
        story,
        rename: oldCardName !== cardName || oldCategory !== category
          ? { oldCategory, oldCardName, category, cardName, subtitle: parsedUrl.subtitle }
          : undefined,
      });
      if (oldKey) await cleanupObjects(services, [oldKey]);
      return json({ status: "success" });
    } catch (error) {
      if (createdKey) await cleanupObjects(services, [createdKey]);
      const status = statusOf(error);
      if (status === 413) return json(errorBody("上传文件超过大小限制"), 413);
      if (status === 400) return json(errorBody(messageOf(error, "图片内容损坏或无法解码")), 400);
      return json(errorBody("修改剧情失败"), 500);
    }
  });

  app.post("/api/wiki/delete_story", async (context) => {
    const services = await resolveServices(context);
    const unauthorized = await authorizeWikiWrite(context, services);
    if (unauthorized) return unauthorized;
    requireWikiServices(services, ["story", "storage", "uploads"]);
    try {
      const { fields } = await parseWikiUpload(context.req.raw, services);
      const target = await findMutationTarget(services, (fields.agency ?? "").trim(), (fields.idol ?? "").trim());
      if ("error" in target) return target.error;
      const category = (fields.category_name ?? "").trim();
      const cardName = (fields.card_name ?? "").trim();
      const rows = await services.story!.listStoryGroupForDelete(target.agency.code, target.idol.id, category, cardName);
      await services.story!.deleteStoryGroup(target.agency.code, target.idol.id, category, cardName);
      await cleanupObjects(services, rows.flatMap((row) => {
        if (!row.image_file) return [];
        try { return [storyObjectKey(target.agency.code, target.idol.folderName, row.image_file)]; } catch (_) { return []; }
      }));
      return json({ status: "success" });
    } catch (error) {
      if (statusOf(error) === 413) return json(errorBody("上传文件超过大小限制"), 413);
      return json(errorBody("删除剧情失败"), 500);
    }
  });

  app.post("/api/wiki/delete_category", async (context) => {
    const services = await resolveServices(context);
    const unauthorized = await authorizeWikiWrite(context, services);
    if (unauthorized) return unauthorized;
    requireWikiServices(services, ["story", "storage", "uploads"]);
    try {
      const { fields } = await parseWikiUpload(context.req.raw, services);
      const target = await findMutationTarget(services, (fields.agency ?? "").trim(), (fields.idol ?? "").trim());
      if ("error" in target) return target.error;
      const category = (fields.category_name ?? "").trim();
      const images = await services.story!.listCategoryImages(target.agency.code, target.idol.id, category);
      await services.story!.deleteCategory(target.agency.code, target.idol.id, category);
      const keys = images.flatMap(({ image_file: imageFile }) => {
        if (!imageFile) return [];
        try { return [storyObjectKey(target.agency.code, target.idol.folderName, imageFile)]; } catch (_) { return []; }
      });
      const prefix = storyObjectKey(target.agency.code, target.idol.folderName, categoryFolder(category) + "/placeholder");
      await cleanupObjectPrefix(services, prefix.slice(0, prefix.lastIndexOf("/")), keys);
      return json({ status: "success" });
    } catch (error) {
      if (statusOf(error) === 413) return json(errorBody("上传文件超过大小限制"), 413);
      return json(errorBody("删除分类失败"), 500);
    }
  });

  app.post("/api/wiki/parse_bilibili", async (context) => {
    const services = await resolveServices(context);
    const unauthorized = await authorizeWikiWrite(context, services);
    if (unauthorized) return unauthorized;
    requireWikiServices(services, ["fetch"]);
    let body: unknown = {};
    try { body = await context.req.json(); } catch (_) { body = {}; }
    const input = typeof body === "object" && body !== null && "url" in body && typeof (body as { url?: unknown }).url === "string"
      ? (body as { url: string }).url.trim() : "";
    try {
      return json(await parseBilibili(input, services.fetch!));
    } catch (_) {
      return json(errorBody("解析请求失败"), 502);
    }
  });

  app.post("/api/wiki/save_story_layout", async (context) => {
    const services = await resolveServices(context);
    const unauthorized = await authorizeWikiWrite(context, services);
    return unauthorized ?? json({ status: "success" });
  });

  app.get("/api/wiki/random_bg", async (context) => {
    const services = await resolveServices(context);
    requireWikiServices(services, ["story", "storage"]);
    return json(await randomBackground(services.story!, services.storage!));
  });
}

function lightColorIdolsForRoute(name: string) {
  return new Set(["萩原雪歩", "萩原雪步", "葛城リーリヤ", "葛城莉莉娅", "幽谷霧子", "幽谷雾子", "桑山千雪", "奥空心白", "诗花", "Altessimo", "中谷育", "W", "蕾特拉", "神速一魂", "及川雫"]).has(name);
}
