/**
 * Platform-account value handling shared by the API and the Web.
 *
 * This module deliberately carries no Zod: the API imports it through
 * `@imsweb/contracts/namecards/runtime`, and pulling the schema runtime into a
 * server-only module would be dead weight. `./namecards` re-exports every
 * value here so the Web can keep reading them from the entrypoint it uses.
 */

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

