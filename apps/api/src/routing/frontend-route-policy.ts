import {
  apiPath,
  cssPath,
  eventChroniclePath,
  iconPath,
  imagePath,
  publicAssetsPath,
  publicUploadsPath,
  siteContentPath,
  sitesPath,
} from '@imsweb/contracts/paths';
import { isSensitiveRequestPath } from "@/middleware/static-path-policy";
import {
    FRONTEND_PRERENDERED_ROUTES,
    FRONTEND_SPA_FALLBACK_PATTERNS,
} from '@/routing/frontend-route-delivery';

export type FrontendRouteDecision =
  | { kind: "server" }
  | { kind: "frontend"; assetPath: string }
  | { kind: "not-found" };

export interface FrontendRouteRequest {
  method: string;
  pathname: string;
}

const SERVER_PREFIXES = [
  apiPath(),
  siteContentPath(),
  sitesPath(),
  imagePath(),
  iconPath(),
  cssPath(),
  publicUploadsPath(),
  eventChroniclePath(),
  publicAssetsPath('/images/eventchronicle/events'),
] as const;

const PRERENDERED_ROUTES: ReadonlyMap<string, string> = new Map(
    FRONTEND_PRERENDERED_ROUTES,
);

const SPA_FALLBACK = "__spa-fallback.html";

function requestPath(pathname: unknown): string | null {
  const value = String(pathname || "");
  const end = value.search(/[?#]/);
  const path = end === -1 ? value : value.slice(0, end);
  if (!path.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(path))
    return null;
  return path;
}

function hasPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isServerOwned(pathname: string): boolean {
  if (SERVER_PREFIXES.some((prefix) => hasPathPrefix(pathname, prefix)))
    return true;
  if (/^\/information\/[a-z0-9][a-z0-9_-]{7,63}\/content$/i.test(pathname))
    return true;
  return /^\/runninggame\/(?:Build|BuildMobile)\/[^/]+\.data$/.test(pathname);
}

function matchesSpaFallback(
    routePathname: string,
    segments: readonly string[],
): boolean {
    return FRONTEND_SPA_FALLBACK_PATTERNS.some((pattern) => {
        const pathMatches =
            pattern.match === 'exact'
                ? routePathname === pattern.path
                : hasPathPrefix(routePathname, pattern.path);
        if (!pathMatches) return false;
        if ('segmentCount' in pattern && segments.length !== pattern.segmentCount) {
            return false;
        }
        return pattern.segments.every(
            (expected, index) => segments[index] === expected,
        );
    });
}

function decodedSegments(pathname: string): string[] | null {
  const rawSegments = pathname.slice(1).split("/");
  if (rawSegments.some((segment) => segment.length === 0)) return null;

  const segments: string[] = [];
  for (const rawSegment of rawSegments) {
    let segment: string;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      return null;
    }
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      /[/\\\u0000-\u001f\u007f]/.test(segment)
    ) {
      return null;
    }
    segments.push(segment);
  }
  return segments;
}

export function resolveFrontendRoute(
  request: FrontendRouteRequest,
  frontendFiles: ReadonlySet<string>,
): FrontendRouteDecision {
  const pathname = requestPath(request.pathname);
  if (!pathname) return { kind: "not-found" };

  const method = String(request.method || "").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return { kind: "server" };

  // Server and security ownership always wins, including for non-navigation methods.
  if (isSensitiveRequestPath(pathname) || isServerOwned(pathname))
    return { kind: "server" };

  if (pathname === "/" || pathname === "/index.html") {
    const rootAsset = PRERENDERED_ROUTES.get("/");
    return rootAsset && frontendFiles.has(rootAsset)
      ? { kind: "frontend", assetPath: rootAsset }
      : { kind: "not-found" };
  }

  const routePathname =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  const prerenderedAsset = PRERENDERED_ROUTES.get(routePathname);
  if (prerenderedAsset) {
    return frontendFiles.has(prerenderedAsset)
      ? { kind: "frontend", assetPath: prerenderedAsset }
      : { kind: "not-found" };
  }

  const segments = decodedSegments(routePathname);
  if (!segments) return { kind: "not-found" };

  const usesSpaFallback = matchesSpaFallback(routePathname, segments);
  if (usesSpaFallback) {
    return frontendFiles.has(SPA_FALLBACK)
      ? { kind: "frontend", assetPath: SPA_FALLBACK }
      : { kind: "not-found" };
  }

  if (routePathname !== pathname) return { kind: "not-found" };

  const assetPath = segments.join("/");
  return !assetPath.endsWith(".html") && frontendFiles.has(assetPath)
    ? { kind: "frontend", assetPath }
    : { kind: "not-found" };
}
