function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function buildInformationHtmlDocument(title: string, html: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'; font-src 'none'; media-src 'self'; form-action 'none'; base-uri 'none'">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: Geist, "Noto Sans SC", "PingFang SC", sans-serif; }
    * { box-sizing: border-box; letter-spacing: 0; }
    body { margin: 0; color: CanvasText; background: Canvas; }
    article { width: min(100% - 32px, 880px); margin: 0 auto; padding: 40px 0 72px; font-size: 16px; line-height: 1.8; overflow-wrap: anywhere; }
    img { display: block; max-width: 100%; height: auto; margin: 24px auto; }
    a { color: LinkText; text-underline-offset: 3px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 10px; border: 1px solid GrayText; text-align: left; }
    pre { max-width: 100%; overflow: auto; padding: 16px; background: color-mix(in srgb, CanvasText 7%, Canvas); }
    @media (max-width: 520px) { article { width: min(100% - 24px, 880px); padding-top: 24px; } }
  </style>
</head>
<body><article>${html}</article></body>
</html>`
}
