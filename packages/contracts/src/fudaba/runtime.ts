import { hasAsciiControl } from "../runtime-primitives.js";

export { NAMECARD_REACTION_EMOJIS } from "./reactions-runtime.js";

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
