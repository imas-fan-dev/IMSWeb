/**
 * Platform-account value handling shared by the API and the Web.
 *
 * This module deliberately carries no Zod: the API imports it through
 * `@imsweb/contracts/namecards/runtime`, and pulling the schema runtime into a
 * server-only module would be dead weight. `./namecards` re-exports every
 * value here so the Web can keep reading them from the entrypoint it uses.
 */

/** 单次交换的名片数量上限：快速列表、发起与扫码出示同受此限。 */
export const NAMECARD_EXCHANGE_CARD_LIMIT = 20

/** 扫码出示的二维码一周内有效。 */
export const NAMECARD_SCAN_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** The fields the editor needs to turn raw input into the stored value. */
export interface PlatformAccountFormat {
  id: string
  group: "game" | "social" | "showcase" | "game-platform" | "link"
  pattern: string
  baseUrl: string | null
  uppercase: boolean
}

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Turns whatever the visitor typed into the identifier we store.
 *
 * One rule: match the platform's link template first. No match means the input
 * is not a link for this platform, so it is handed back untouched and the
 * pattern rejects it. A match drops the template's literal parts, then removes
 * the first `?`, `#` or `&` in what is left together with everything after it.
 */
export function formatPlatformValue(
  kind: PlatformAccountFormat,
  raw: string
): string {
  const input = raw.trim();
  if (!input) return "";
  const marker = kind.baseUrl?.indexOf("{value}") ?? -1;
  if (marker < 0) {
    // No template (game handles, the homepage link): the input is the value.
    return finishValue(kind, stripTrailingSlash(input));
  }
  const prefix = kind.baseUrl!.slice(0, marker);
  const suffix = kind.baseUrl!.slice(marker + "{value}".length);
  const bare = stripScheme(input);
  const barePrefix = stripScheme(prefix);
  if (!bare.toLowerCase().startsWith(barePrefix.toLowerCase())) return input;
  let value = bare.slice(barePrefix.length);
  if (suffix) {
    const end = value.toLowerCase().lastIndexOf(stripScheme(suffix).toLowerCase());
    if (end < 0) return input;
    value = value.slice(0, end);
  }
  const cut = value.search(/[?#&]/);
  if (cut >= 0) value = value.slice(0, cut);
  value = stripTrailingSlash(value);
  // 还在打模板前缀（或只剩模板本身）时不能把输入清空。
  return value ? finishValue(kind, value) : input;
}

/** 粘贴整条链接时用来定位平台的模板来源。 */
export interface PlatformAccountTemplate {
  baseUrl: string | null
}

/**
 * 在候选平台里找出这条链接属于谁：按字面前缀匹配，最长者优先；模板带后缀时
 * 后缀也必须出现在剩余部分里。匹配不上返回 null，由调用方提示用户。
 */
export function matchPlatformAccountKind<T extends PlatformAccountTemplate>(
  kinds: readonly T[],
  raw: string
): T | null {
  const input = raw.trim()
  if (!input) return null
  const bare = stripScheme(input).toLowerCase()
  let matched: { kind: T; length: number } | null = null
  for (const kind of kinds) {
    const baseUrl = kind.baseUrl ?? ""
    const marker = baseUrl.indexOf("{value}")
    if (marker < 0) continue
    const prefix = stripScheme(baseUrl.slice(0, marker)).toLowerCase()
    const suffix = stripScheme(
      baseUrl.slice(marker + "{value}".length)
    ).toLowerCase()
    if (!prefix || !bare.startsWith(prefix)) continue
    if (suffix && !bare.slice(prefix.length).includes(suffix)) continue
    if (!matched || prefix.length > matched.length) {
      matched = { kind, length: prefix.length }
    }
  }
  return matched?.kind ?? null;
}

/** 比较模板时忽略协议，`https://x.com/u` 与 `x.com/u` 等价。 */
function stripScheme(value: string): string {
  return value.replace(/^https?:\/\//i, "");
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function finishValue(kind: PlatformAccountFormat, value: string): string {
  const decoded = decodeOnce(value);
  if (kind.uppercase) return decoded.toUpperCase();
  // A pattern that never allows capitals names a lower-case-only namespace
  // (GitHub handles), so the editor folds the input for the visitor.
  return /A-Z/.test(kind.pattern) ? decoded : decoded.toLowerCase();
}

/** Canonical storage form: YouTube handles are stored percent-encoded. */
export function encodePlatformValue(
  kind: PlatformAccountFormat,
  value: string
): string {
  return kind.id === "youtube" && value.startsWith("@")
    ? `@${encodeURIComponent(value.slice(1))}`
    : value
}

/** Readable form for the editor, which prefers the real handle on screen. */
export function decodePlatformValue(
  kind: PlatformAccountFormat,
  value: string
): string {
  return kind.id === "youtube" && value.startsWith("@")
    ? `@${decodeOnce(value.slice(1))}`
    : value
}

/** Null when the value fits the platform, otherwise the message to show. */
export function platformValueError(
  kind: PlatformAccountFormat,
  value: string
): string | null {
  if (!value) return null
  if (kind.group === "link" && !/^https?:\/\//i.test(value)) {
    return "请填写完整的链接（以 https:// 开头）"
  }
  try {
    return new RegExp(kind.pattern, "u").test(value)
      ? null
      : "格式不符合该平台的要求"
  } catch {
    return "格式不符合该平台的要求"
  }
}

