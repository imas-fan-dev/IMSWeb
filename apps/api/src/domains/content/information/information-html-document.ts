import { html as renderHtml, raw } from "hono/html";

export const INFORMATION_DOCUMENT_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "font-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "img-src 'self' https: http: data: blob:",
  "media-src 'self'",
  "object-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
].join("; ");

export function buildInformationHtmlDocument(
  title: string,
  html: string,
): string {
  return String(renderHtml`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${INFORMATION_DOCUMENT_CSP}">
  <title>${title}</title>
  <style>
    :root { color-scheme: light; font-family: Geist, "Noto Sans SC", "PingFang SC", sans-serif; }
    :root[data-theme="dark"] { color-scheme: dark; }
    * { box-sizing: border-box; letter-spacing: 0; }
    body { margin: 0; color: CanvasText; background: Canvas; }
    article { width: min(100% - 32px, 880px); margin: 0 auto; padding: 40px 0 72px; font-size: 16px; line-height: 1.8; overflow-wrap: anywhere; }
    h1, h2, h3, h4, h5, h6 { margin: 1.5em 0 0.65em; line-height: 1.3; }
    h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
    p, ul, ol, blockquote, figure { margin: 1em 0; }
    img, video { display: block; max-width: 100%; height: auto; margin: 24px auto; }
    figure img { margin-bottom: 8px; }
    figcaption { color: GrayText; font-size: 0.875em; text-align: center; }
    a { color: LinkText; text-underline-offset: 3px; }
    blockquote { padding-left: 16px; border-left: 3px solid GrayText; color: GrayText; }
    hr { margin: 32px 0; border: 0; border-top: 1px solid GrayText; opacity: 0.45; }
    table { display: block; width: 100%; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
    th, td { padding: 8px 10px; border: 1px solid GrayText; text-align: left; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { max-width: 100%; overflow: auto; padding: 16px; background: color-mix(in srgb, CanvasText 7%, Canvas); }
    @media (max-width: 520px) { article { width: min(100% - 24px, 880px); padding: 24px 0 48px; } }
  </style>
</head>
<body><article>${raw(html)}</article></body>
</html>`);
}
