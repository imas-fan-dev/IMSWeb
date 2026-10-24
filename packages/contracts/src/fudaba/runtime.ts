import { hasAsciiControl } from "../runtime-primitives.js";

export { NAMECARD_REACTION_EMOJIS } from "./reactions-runtime.js";

export {
  NAMECARD_CHARACTER_CATEGORIES,
  NAMECARD_CHARACTER_DEFAULT_PAGE_SIZE,
  NAMECARD_CHARACTER_MAX_PAGE_SIZE,
  NAMECARD_CHARACTER_MAX_QUERY_LENGTH,
  NAMECARD_FAVORITE_CHARACTER_LIMIT,
  NAMECARD_UNIT_DEFAULT_PAGE_SIZE,
  NAMECARD_UNIT_MAX_AGENCIES,
  NAMECARD_UNIT_MAX_MEMBERS,
  NAMECARD_UNIT_MAX_PAGE_SIZE,
  NAMECARD_UNIT_MAX_QUERY_LENGTH,
} from "./namecard-runtime.js";

const MAX_MAP_URL_LENGTH = 2048;

function isAbsoluteMapUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.search || url.hash) return false;
  return !url.pathname.includes("//");
}

/**
 * A same-origin absolute path or an absolute `http(s)` URL, with no query,
 * fragment, backslash, or embedded credentials.
 */
export function isFudabaMapStyleUrl(value: string): boolean {
  if (hasAsciiControl(value)) return false;
  if (value.length === 0 || value.length > MAX_MAP_URL_LENGTH) return false;
  if (value.includes("?") || value.includes("#") || value.includes("\\")) {
    return false;
  }
  if (value.startsWith("/")) return !value.includes("//");
  return isAbsoluteMapUrl(value);
}

/** Public JS API key; the security code belongs only to the proxy server. */
export function isFudabaAMapKey(value: string): boolean {
  return /^[a-zA-Z0-9_-]{16,128}$/.test(value);
}

export function isFudabaAMapStyle(value: string): boolean {
  return /^amap:\/\/styles\/[a-zA-Z0-9_-]{1,128}$/.test(value);
}

export function isFudabaAMapSecurityProxyUrl(value: string): boolean {
  return isFudabaMapStyleUrl(value) &&
    (value.startsWith('/') || value.startsWith('https://')) &&
    value.endsWith('/_AMapService');
}

export function isFudabaMapboxToken(value: string): boolean {
  return /^pk\.[A-Za-z0-9._-]{16,2048}$/.test(value);
}

export function isFudabaMapboxStyle(value: string): boolean {
  return /^mapbox:\/\/styles\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(value) && value.length <= 2048;
}
